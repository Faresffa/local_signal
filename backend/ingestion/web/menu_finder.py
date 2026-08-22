# backend/ingestion/web/menu_finder.py
# Trouve l'URL de la carte d'un restaurant (D-023).
#
# Deux voies, par ordre de fiabilité décroissante :
#
#   1. Le tag OSM `website:menu` — déclaratif, pointe directement sur la carte.
#      Fiable, mais rare : environ 3 % des restaurants des zones d'étude.
#   2. Le site web du restaurant — on cherche un lien « carte » / « menu » sur
#      la page d'accueil. Moins sûr, mais porte la couverture à ~30 %.
#
# LIMITE STRUCTURELLE, à écrire dans le mémoire : les deux voies ne trouvent que
# des restaurants qui ont une présence web. Or l'absence de site est justement
# ce qui rend invisibles les restaurants que le projet cherche à révéler (D-001).
# Cette source amorce donc mieux la classe « piège » que la classe « local » —
# exactement le même biais que D-021, et la même réponse : c'est un amorçage,
# le scan utilisateur reste la voie du produit (D-004).

import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = "LocalSignal/0.1 (projet académique HETIC)"

# Intitulés de lien qui désignent une carte. Volontairement large sur le
# français, complété par l'anglais que beaucoup de sites parisiens utilisent.
_MENU_WORDS = re.compile(
    r"\b(la[- ]?carte|notre[- ]?carte|carte|menus?|nos[- ]?menus?|"
    r"food[- ]?menu|our[- ]?menu)\b",
    re.IGNORECASE,
)

# Chemins d'URL qui trahissent une page de carte même sans intitulé explicite.
_MENU_PATH = re.compile(r"/(la-)?(carte|menu|menus)(/|\.|$|#)", re.IGNORECASE)

# Pièges classiques : « menu » au sens navigation, ou lien de commande en ligne.
_REJECT = re.compile(
    r"(menu[- ]?principal|main[- ]?menu|menu[- ]?burger|skip[- ]?to)",
    re.IGNORECASE,
)


def resolve(menu_url: str, website: str, timeout: int = 15) -> tuple[str, str] | None:
    """
    Détermine l'URL de la carte d'un restaurant.

    Args:
        menu_url: valeur du tag OSM `website:menu`, souvent vide
        website:  site officiel du restaurant, souvent vide aussi
        timeout:  délai réseau pour le crawl, en secondes

    Returns:
        (url, origine) où origine vaut 'osm' ou 'crawl', ou None si rien
        n'a été trouvé — auquel cas le restaurant reste sans carte et son
        poids menu est redistribué (D-012).
    """
    if menu_url and _is_http(menu_url):
        return menu_url.strip(), "osm"

    if website and _is_http(website):
        found = _crawl_for_menu(website.strip(), timeout)
        if found:
            return found, "crawl"

    return None


def _is_http(url: str) -> bool:
    """Écarte les valeurs OSM malformées (tel:, mailto:, texte libre)."""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _crawl_for_menu(website: str, timeout: int) -> str | None:
    """
    Cherche un lien vers la carte sur la page d'accueil du restaurant.

    Une seule page est chargée, jamais de parcours en profondeur : le but est
    d'amorcer un jeu de données, pas d'aspirer des sites. C'est aussi ce qui
    garde le coût à zéro et le comportement prévisible.
    """
    try:
        response = requests.get(
            website, headers={"User-Agent": USER_AGENT}, timeout=timeout
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
    except (requests.RequestException, Exception):
        return None

    home = response.url  # après redirections
    candidates = []

    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        label = " ".join(link.get_text(" ", strip=True).split())
        if _REJECT.search(label):
            continue

        absolute = urljoin(home, href)
        if not _is_http(absolute):
            continue

        # Un lien sortant (réseau social, plateforme de livraison) n'est pas
        # la carte officielle du restaurant.
        if urlparse(absolute).netloc != urlparse(home).netloc:
            continue

        score = 0
        if _MENU_PATH.search(urlparse(absolute).path):
            score += 2
        if label and _MENU_WORDS.search(label):
            score += 2
        if absolute.lower().endswith(".pdf"):
            score += 1  # une carte en PDF est presque toujours la vraie carte

        if score:
            candidates.append((score, absolute))

    if not candidates:
        return None

    # Le meilleur score l'emporte ; à égalité, l'URL la plus courte, qui est
    # en pratique la page de carte principale plutôt qu'une sous-carte.
    candidates.sort(key=lambda c: (-c[0], len(c[1])))
    return candidates[0][1]
