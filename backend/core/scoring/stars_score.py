# backend/core/scoring/stars_score.py
# Note moyenne (étoiles).
#
# ATTENTION — ce signal NE PARTICIPE PLUS AU CLASSEMENT (D-007).
#
# Trois raisons cumulatives :
#   1. Il contredit l'intention affichée du produit : le README dit explicitement
#      que l'objectif n'est PAS de recommander les meilleurs restaurants selon
#      leur note.
#   2. Son pouvoir discriminant est nul : les notes réelles s'écrasent toutes
#      entre 3.8 et 4.8 — le critère ajoute du bruit, pas de l'information.
#   3. Il dépend de la popularité, ce qui viole la contrainte D-001.
#
# La fonction est conservée car la note reste AFFICHÉE à l'utilisateur comme
# simple information. Ne pas la réintroduire dans le Local Signal sans une
# nouvelle entrée dans docs/DECISIONS.md.


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
