# backend/core/scoring/price_score.py
# Signal « anomalie de prix » — répond directement au « se faire scam » du besoin
# initial, et ne dépend d'aucun avis (D-001).
#
# Principe : un restaurant n'est pas suspect parce qu'il est cher dans l'absolu,
# mais parce qu'il est cher PAR RAPPORT À SES VOISINS qui servent la même cuisine.
# Un prix nettement au-dessus de la médiane du quartier, à cuisine comparable,
# signale une rente de situation — typiquement une rente touristique.
#
# Comparer à la médiane du quartier, et non à une moyenne nationale, neutralise
# automatiquement l'effet « quartier cher » : dans le 6e arrondissement tout est
# cher, ce qui compte est l'écart au voisinage immédiat.

import statistics

from backend import config


def neighborhood_median_price(
    restaurant: dict,
    peers: list[dict],
    same_cuisine_only: bool = True,
) -> float | None:
    """
    Prix médian des restaurants comparables.

    Args:
        restaurant: le restaurant évalué
        peers: les autres restaurants de la zone
        same_cuisine_only: restreindre aux restaurants du même type de cuisine

    Returns:
        Médiane, ou None si le nombre de comparables est insuffisant pour
        que la statistique ait un sens (config.PRICE_PEERS_MIN).
    """
    if not peers:
        return None

    candidates = [
        p for p in peers
        if p.get("id") != restaurant.get("id") and p.get("price")
    ]

    if same_cuisine_only:
        cuisine = restaurant.get("type")
        same = [p for p in candidates if p.get("type") == cuisine]
        # On ne restreint à la même cuisine que s'il reste assez de comparables ;
        # sinon on élargit à tout le quartier plutôt que de perdre le signal.
        if len(same) >= config.PRICE_PEERS_MIN:
            candidates = same

    if len(candidates) < config.PRICE_PEERS_MIN:
        return None

    return statistics.median(p["price"] for p in candidates)


def score_price(restaurant: dict, peers: list[dict]) -> dict:
    """
    Score (0 à 1) d'après l'écart de prix au voisinage comparable.

    - prix ≤ médiane            → 1.0  (aucune anomalie)
    - prix ≥ médiane × RATIO_MAX → 0.0  (anomalie forte)
    - linéaire entre les deux

    Un prix INFÉRIEUR à la médiane n'est pas récompensé au-delà de 1.0 : être
    bon marché n'est pas en soi une preuve d'authenticité, et surpondérer cela
    ferait remonter la restauration rapide bas de gamme.

    Returns:
        {"score": float | None, "available": bool, "details": {...}}
        None si le voisinage ne fournit pas assez de comparables (D-012).
    """
    price = restaurant.get("price")
    if not price or price <= 0:
        return {"score": None, "available": False, "details": {}}

    median = neighborhood_median_price(restaurant, peers)
    if median is None or median <= 0:
        return {"score": None, "available": False, "details": {}}

    ratio = price / median

    if ratio <= 1.0:
        score = 1.0
    elif ratio >= config.PRICE_RATIO_MAX:
        score = 0.0
    else:
        span = config.PRICE_RATIO_MAX - 1.0
        score = 1.0 - (ratio - 1.0) / span

    return {
        "score": round(score, 4),
        "available": True,
        "details": {
            "price": price,
            "median_price": round(median, 2),
            "ratio": round(ratio, 3),
            # Écart en %, positif = plus cher que le quartier. Sert à l'explication (D-009).
            "delta_percent": round((ratio - 1.0) * 100, 1),
        },
    }
