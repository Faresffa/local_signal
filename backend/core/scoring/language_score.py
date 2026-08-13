# backend/core/scoring/language_score.py
# Signal « langue des avis » — proxy de la clientèle réelle d'un restaurant.
#
# Un restaurant dont les avis sont majoritairement rédigés dans la langue locale
# est probablement fréquenté par des habitants ; un restaurant dont les avis sont
# majoritairement en anglais est probablement fréquenté par des voyageurs.
#
# Historique (D-003) : ce score était binaire — 1 si plus de 50 % des avis étaient
# dans la langue cible, 0 sinon. Deux défauts rédhibitoires :
#   1. Effet de seuil : 49 % et 0 % donnaient le même score.
#   2. Faux positifs : 2 avis sur 2 en français donnaient le score maximal.
# Et surtout, l'absence d'avis produisait un 0, ce qui punissait exactement les
# restaurants invisibles que le projet veut mettre en avant (D-001).

from langdetect import detect, LangDetectException

from backend import config


def detect_language(text: str) -> str:
    """
    Détecte la langue d'un texte.

    Returns:
        Code ISO 639-1 (ex: 'fr', 'en'), ou 'unknown' si la détection échoue.
    """
    try:
        return detect(text)
    except LangDetectException:
        return "unknown"


def count_local_reviews(reviews: list[dict], target_lang: str) -> tuple[int, int]:
    """
    Compte les avis rédigés dans la langue cible.

    Utilise la clé 'lang' si elle est pré-renseignée (données mockées), sinon
    lance la détection automatique.

    Returns:
        (nombre d'avis en langue cible, nombre total d'avis)
    """
    total = len(reviews)
    local = 0

    for review in reviews:
        lang = review.get("lang")
        if not lang:
            lang = detect_language(review.get("text", ""))
        if lang == target_lang:
            local += 1

    return local, total


def score_language(
    reviews: list[dict],
    target_lang: str = None,
    alpha: float = None,
    prior: float = None,
) -> float:
    """
    Score continu (0 à 1) de « localité » d'après la langue des avis,
    lissé vers un a priori en fonction du volume de preuves.

        score = (n_locaux + α × prior) / (n_total + α)

    Le lissage résout les deux problèmes du score binaire :

    | Cas                | Ancien score | Nouveau score |
    |--------------------|--------------|---------------|
    | 2 avis  / 2 locaux | 1.00         | 0.50          |
    | 45 avis / 40 locaux| 1.00         | 0.86          |
    | 0 avis             | 0.00         | prior (0.50)  |

    Le dernier cas est le plus important : un restaurant sans avis n'est plus
    pénalisé, il est simplement ramené à l'a priori — c'est-à-dire *incertain*.
    C'est la traduction directe de la contrainte D-001.

    Args:
        reviews: liste de dicts avec clé 'text' (et optionnellement 'lang')
        target_lang: code langue cible (défaut: config.TARGET_LANGUAGE)
        alpha: force du lissage (défaut: config.LANGUAGE_SMOOTHING_ALPHA)
        prior: a priori en l'absence d'avis (défaut: config.LANGUAGE_PRIOR)

    Returns:
        Score entre 0.0 et 1.0
    """
    if target_lang is None:
        target_lang = config.TARGET_LANGUAGE
    if alpha is None:
        alpha = config.LANGUAGE_SMOOTHING_ALPHA
    if prior is None:
        prior = config.LANGUAGE_PRIOR

    local, total = count_local_reviews(reviews or [], target_lang)

    return (local + alpha * prior) / (total + alpha)


def language_confidence(reviews: list[dict]) -> float:
    """
    Quantité de preuves disponibles, entre 0 et 1.

    Sous-produit du lissage (D-003) : permet à l'interface d'afficher
    « score provisoire » plutôt que de simuler une précision qu'on n'a pas (D-009).

    Returns:
        0.0 (aucun avis) à 1.0 (au moins LANGUAGE_CONFIDENCE_FULL avis)
    """
    total = len(reviews or [])
    return min(total / config.LANGUAGE_CONFIDENCE_FULL, 1.0)
