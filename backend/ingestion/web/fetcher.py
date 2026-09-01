# backend/ingestion/web/fetcher.py
# Récupération du texte d'une carte publiée sur le web (D-023).
#
# Deux formats couvrent l'essentiel de ce qu'on trouve : une page HTML, ou un
# PDF déposé sur le site du restaurant. Les cartes publiées sous forme d'image
# seule sont ignorées — elles relèvent du scan de carte (D-004), pas d'ici.
#
# Ce module ne fait QUE récupérer du texte. Il n'interprète rien : l'extraction
# d'observations est faite par le modèle (text_client.py) et le jugement par le
# scoring déterministe (menu_score.py). Voir D-014.

import io
import os
import re

import requests
from bs4 import BeautifulSoup

USER_AGENT = "LocalSignal/0.1 (projet académique HETIC)"

# Au-delà, ce n'est pas une carte : c'est un site entier ou un document lourd.
# Évite d'envoyer 200 000 caractères au modèle, qui les facturerait.
MAX_BYTES = 8 * 1024 * 1024

# Une carte complète tient dans 10 000 caractères (~3 300 tokens). Au-delà, on
# récupère surtout du bruit de page. Le raisonnement du modèle étant désactivé,
# la sortie est courte et cette entrée tient dans le quota par minute du tier
# gratuit Groq — 8 000 tokens, sortie réservée comprise.
MAX_CHARS = int(os.environ.get("MENU_TEXT_MAX_CHARS", "10000"))

# Balises dont le contenu textuel n'appartient jamais à une carte.
_NOISE_TAGS = ["script", "style", "nav", "header", "footer", "noscript", "svg", "form"]

_BLANK_RUN = re.compile(r"\n{3,}")
_SPACE_RUN = re.compile(r"[ \t]{2,}")


class FetchError(Exception):
    """Récupération impossible — le restaurant est simplement laissé sans carte."""


def fetch_text(url: str, timeout: int = 20) -> tuple[str, str]:
    """
    Récupère le texte lisible d'une URL de carte.

    Args:
        url: adresse de la carte (page HTML ou PDF)
        timeout: délai réseau, en secondes

    Returns:
        (texte, format) où format vaut 'html' ou 'pdf'.

    Raises:
        FetchError: URL injoignable, format non géré, ou contenu vide.
    """
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
            stream=True,
        )
        response.raise_for_status()
    except requests.HTTPError as e:
        # Le code HTTP est l'information utile : un 403 dit « ce site refuse les
        # robots », un 404 dit « le tag OSM est périmé ». Les deux appellent des
        # suites différentes, et « HTTPError » ne permet de trancher ni l'un ni
        # l'autre.
        code = e.response.status_code if e.response is not None else "?"
        raise FetchError(f"HTTP {code}") from e
    except requests.Timeout as e:
        raise FetchError(f"délai dépassé (> {timeout} s)") from e
    except requests.RequestException as e:
        raise FetchError(f"injoignable : {type(e).__name__}") from e

    content_type = response.headers.get("Content-Type", "").lower()

    # `stream=True` + lecture bornée : un PDF de 400 Mo ne doit pas saturer la
    # mémoire d'un worker.
    body = response.raw.read(MAX_BYTES + 1, decode_content=True)
    if len(body) > MAX_BYTES:
        raise FetchError(f"document trop lourd (> {MAX_BYTES // (1024 * 1024)} Mo)")
    if not body:
        raise FetchError("réponse vide")

    # Le format se lit d'abord dans les octets, ensuite dans l'en-tête, et en
    # dernier recours dans l'extension : beaucoup de sites servent une page
    # HTML sous une URL en « .pdf » (redirection vers un visualiseur), et
    # l'inverse existe aussi. Se fier à l'extension produit des erreurs de
    # parseur illisibles du type « invalid pdf header ».
    is_pdf = body[:5] == b"%PDF-"
    is_html = body[:512].lstrip()[:9].lower().startswith((b"<!doctype", b"<html"))

    if is_pdf or ("application/pdf" in content_type and not is_html):
        return _from_pdf(body), "pdf"

    if is_html or "text/html" in content_type or "application/xhtml" in content_type:
        return _from_html(body, response.encoding), "html"

    # Une carte publiée en JPEG/PNG relève du scan de carte, pas de ce module.
    raise FetchError(f"format non géré : {content_type or 'inconnu'}")


def _from_pdf(body: bytes) -> str:
    """Extrait le texte d'un PDF. Un PDF scanné (image pure) ne rend rien."""
    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise FetchError("pypdf non installé") from e

    try:
        reader = PdfReader(io.BytesIO(body))
        pages = [(page.extract_text() or "") for page in reader.pages[:12]]
    except Exception as e:
        raise FetchError(f"PDF illisible : {type(e).__name__}") from e

    text = _tidy("\n".join(pages))
    if not text.strip():
        # Cas fréquent : la carte est un scan, donc une image dans un PDF.
        # Sans valeur ici ; le scan de carte saura la lire.
        raise FetchError("PDF sans couche texte (probablement un scan)")
    return text


def _from_html(body: bytes, encoding: str | None) -> str:
    """Extrait le texte visible d'une page HTML, hors navigation et scripts."""
    try:
        soup = BeautifulSoup(body, "html.parser", from_encoding=encoding)
    except Exception as e:
        raise FetchError(f"HTML illisible : {type(e).__name__}") from e

    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    text = _tidy(soup.get_text(separator="\n"))
    if len(text.strip()) < 80:
        raise FetchError("page sans texte exploitable")
    return text


# Un prix : « 24 € », « 24€ », « 24,50 € », « € 24 ». C'est le marqueur le plus
# fiable d'une vraie liste de plats — une page qui PARLE de sa carte sans la
# lister n'en contient aucun.
_PRICE = re.compile(r"(?:\d{1,3}(?:[.,]\d{2})?\s*€)|(?:€\s*\d{1,3}(?:[.,]\d{2})?)")


def looks_like_menu(text: str, min_prices: int = 4) -> tuple[bool, int]:
    """
    Le texte contient-il vraisemblablement une liste de plats ?

    Heuristique gratuite, à passer AVANT tout appel au modèle : beaucoup de
    pages « carte » ne font que décrire la cuisine du chef, la liste réelle
    étant rendue en JavaScript ou déportée dans un PDF. Les envoyer au modèle
    coûte un appel pour s'entendre répondre « ce n'est pas une carte ».

    Ce n'est PAS un signal de scoring : uniquement un filtre de récolte. Le
    jugement reste entièrement dans menu_score.py (D-014).

    Returns:
        (verdict, nombre de prix détectés)
    """
    found = len(_PRICE.findall(text or ""))
    return found >= min_prices, found


def _tidy(text: str) -> str:
    """Normalise les blancs et borne la longueur envoyée au modèle."""
    text = _SPACE_RUN.sub(" ", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    text = _BLANK_RUN.sub("\n\n", text).strip()
    return text[:MAX_CHARS]
