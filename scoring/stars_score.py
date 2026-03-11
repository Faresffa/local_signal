# scoring/stars_score.py
# Score basé sur la note moyenne (étoiles) d'un restaurant


def score_stars(rating: float, max_rating: float = 5.0) -> float:
    """
    Normalise la note étoiles d'un restaurant en un score entre 0 et 1.

    Args:
        rating: Note du restaurant (ex: 4.2)
        max_rating: Note maximale possible (défaut: 5.0)

    Returns:
        Score entre 0.0 et 1.0
        Ex: 4.2 étoiles → 4.2/5.0 = 0.84
    """
    if rating is None or rating <= 0:
        return 0.0
    return min(rating / max_rating, 1.0)
