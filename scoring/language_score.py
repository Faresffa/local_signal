# scoring/language_score.py
# Score binaire basé sur la langue des avis d'un restaurant

from langdetect import detect, LangDetectException


def detect_language(text: str) -> str:
    """
    Détecte la langue d'un texte.

    Args:
        text: Texte à analyser

    Returns:
        Code ISO 639-1 de la langue détectée (ex: 'fr', 'en')
        Retourne 'unknown' si la détection échoue
    """
    try:
        return detect(text)
    except LangDetectException:
        return "unknown"


def score_language(reviews: list[dict], target_lang: str = "fr") -> int:
    """
    Score binaire : 1 si la majorité des avis sont dans la langue cible, 0 sinon.

    L'idée : un restaurant dont les avis sont majoritairement en français est
    probablement un restaurant "local" (non touristique), ce qui est ce que
    l'application cherche à identifier.

    Args:
        reviews: Liste de dicts avec clé 'text' (et optionnellement 'lang')
        target_lang: Code langue cible (défaut: 'fr')

    Returns:
        1 si majorité des avis en langue cible, 0 sinon
    """
    if not reviews:
        return 0

    target_count = 0
    total = len(reviews)

    for review in reviews:
        # Utiliser la langue pré-renseignée si disponible (données mockées)
        lang = review.get("lang")
        if not lang:
            lang = detect_language(review.get("text", ""))

        if lang == target_lang:
            target_count += 1

    # Majorité = plus de 50%
    return 1 if target_count > total / 2 else 0
