# backend/ingestion/menu_scan/providers/ollama_provider.py
#
# FOURNISSEUR LOCAL — modèle de langue exécuté sur la machine (D-032).
#
# Troisième fournisseur, aux côtés de Groq et Claude (D-017). Il ne reçoit pas
# d'image : l'OCR a déjà relevé le texte, et il ne lui reste que les deux champs
# qui demandent du sens.
#
# POURQUOI DU TEXTE ET NON UNE IMAGE, à mémoire graphique égale. Un modèle de
# vision de trois milliards de paramètres dépense la moitié de sa capacité dans
# l'encodeur visuel ; un modèle de texte de sept milliards consacre la sienne
# entière à la langue. Or l'OCR fait déjà le travail visuel, et il le fait bien.
# À 6 Go de mémoire, le second comprend nettement mieux une carte que le premier
# ne la lit.
#
# CE QU'IL FAIT, ET RIEN DE PLUS. Deux champs :
#
#     cuisines          quelle cuisine la carte propose-t-elle
#     vernacular_ratio  quelle part des plats garde son nom d'origine
#
# Les quatre autres observations sont calculées par du code déterministe dans
# `ocr_local.py`. Un nombre de plats compté par une expression régulière est
# reproductible ; le même nombre rendu par un modèle ne l'est pas. C'est D-014
# poussé un cran plus loin : là où du code suffit, le modèle n'a rien à faire.
#
# AUCUN QUOTA, AUCUNE FACTURE. C'est la raison d'être de ce fournisseur : le
# palier gratuit distant plafonnait à 68 pages par jour, soit seize jours pour
# le Quartier latin.

import json
import re

import requests

from backend import config

_URL = "http://localhost:11434/api/generate"

# Le modèle ne voit que ces deux champs. Lui en demander davantage l'inviterait
# à deviner ce que le code calcule déjà mieux.
_INSTRUCTIONS = """Tu analyses le texte d'une carte de restaurant, relevé par OCR.

Le texte peut contenir des erreurs de reconnaissance : ignore-les.

Réponds UNIQUEMENT par un objet JSON, sans aucun texte autour :

{"cuisines": ["..."], "languages": ["fr"], "vernacular_ratio": 0.0}

- cuisines : les cuisines proposées, en français, en minuscules.
  Une seule entrée si la carte est monocuisine. Exemples : ["italienne"],
  ["française", "thaïlandaise"].
- languages : codes ISO 639-1 des langues dans lesquelles la carte est RÉDIGÉE.
  Un nom de plat étranger dans une carte française ne fait pas une carte
  bilingue : il faut que les descriptions soient réellement traduites.
- vernacular_ratio : proportion entre 0.0 et 1.0 des plats dont le nom est
  conservé dans la langue d'origine de la cuisine plutôt que traduit en
  descriptif générique. « Vitello tonnato » est vernaculaire ; « Veau sauce
  thon » ne l'est pas. Pour une carte française en France, les noms de plats
  traditionnels comme « blanquette » comptent comme vernaculaires.

TEXTE DE LA CARTE :
"""


def _extraire_json(brut: str) -> dict | None:
    """
    Isole l'objet JSON d'une réponse qui peut le noyer.

    Un modèle local préfixe volontiers sa sortie d'une phrase ou l'entoure de
    balises de code, malgré la consigne. Plutôt que d'échouer, on découpe entre
    la première accolade ouvrante et la dernière fermante.
    """
    if not brut:
        return None
    brut = re.sub(r"<think>.*?</think>", "", brut, flags=re.S)
    brut = re.sub(r"```(?:json)?", "", brut)
    debut, fin = brut.find("{"), brut.rfind("}")
    if debut == -1 or fin <= debut:
        return None
    try:
        return json.loads(brut[debut:fin + 1])
    except json.JSONDecodeError:
        return None


def disponible() -> bool:
    """Le serveur local répond-il ?"""
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def analyser_texte(texte: str, modele: str = None, timeout: int = 180) -> dict | None:
    """
    Fait lire le texte d'une carte et rend les deux champs sémantiques.

    Args:
        texte: relevé OCR de la carte, pages agrégées.
        modele: nom du modèle Ollama. Défaut : `config.OLLAMA_MODEL`.

    Returns:
        dict avec `cuisines`, `languages`, `vernacular_ratio`, ou None si la
        lecture échoue — auquel cas le moteur redistribue le poids (D-012).
    """
    texte = (texte or "").strip()
    if len(texte) < 20:
        return None

    # Une carte très longue n'apporte rien de plus après quelques milliers de
    # caractères, et allonge inutilement le temps de réponse.
    if len(texte) > 6000:
        texte = texte[:6000]

    charge = {
        "model": modele or config.OLLAMA_MODEL,
        "prompt": _INSTRUCTIONS + texte,
        "stream": False,
        "format": "json",  # Ollama contraint la sortie à du JSON valide
        "options": {
            # Extraction factuelle : aucune variabilité souhaitée. C'est ce qui
            # rend deux lectures de la même carte identiques, donc le score
            # reproductible.
            "temperature": 0.0,
            "num_predict": 400,
        },
    }

    try:
        r = requests.post(_URL, json=charge, timeout=timeout)
        r.raise_for_status()
        brut = r.json().get("response", "")
    except Exception:
        return None

    donnees = _extraire_json(brut)
    if not isinstance(donnees, dict):
        return None

    # Normalisation : le modèle rend parfois une chaîne là où on attend une
    # liste, ou un pourcentage là où on attend une proportion.
    cuisines = donnees.get("cuisines") or []
    if isinstance(cuisines, str):
        cuisines = [cuisines]
    langues = donnees.get("languages") or []
    if isinstance(langues, str):
        langues = [langues]

    try:
        ratio = float(donnees.get("vernacular_ratio", 0.0))
    except (TypeError, ValueError):
        ratio = 0.0
    if ratio > 1.0:
        ratio = ratio / 100.0  # un pourcentage rendu au lieu d'une proportion

    return {
        "cuisines": [str(c).strip().lower() for c in cuisines if str(c).strip()],
        "languages": [str(l).strip().lower()[:2] for l in langues if str(l).strip()],
        "vernacular_ratio": round(max(0.0, min(1.0, ratio)), 3),
    }
