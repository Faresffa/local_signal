# scoring/engine.py
# Orchestrateur du scoring — combine les 4 scores en un score final

from scoring.geo_score import score_geo_tourist, score_geo_user
from scoring.language_score import score_language
from scoring.stars_score import score_stars
import config


def compute_score(
    restaurant: dict,
    user_lat: float,
    user_lng: float,
    tourist_sites: list[dict],
    target_lang: str = None,
    weights: dict = None,
) -> dict:
    """
    Calcule le score final d'un restaurant en combinant les 4 critères.

    Args:
        restaurant: Dict avec clés 'lat', 'lng', 'reviews', 'rating'
        user_lat, user_lng: Position de l'utilisateur
        tourist_sites: Liste de sites touristiques [{lat, lng, name}]
        target_lang: Langue cible (défaut: config.TARGET_LANGUAGE)
        weights: Dict de pondérations (défaut: depuis config.py)

    Returns:
        Dict avec les scores individuels et le score final (0-100)
    """
    if target_lang is None:
        target_lang = config.TARGET_LANGUAGE

    if weights is None:
        weights = {
            "geo_tourist": config.WEIGHT_GEO_TOURIST,
            "geo_user": config.WEIGHT_GEO_USER,
            "language": config.WEIGHT_LANGUAGE,
            "stars": config.WEIGHT_STARS,
        }

    # --- Score 1 : Distance au site touristique le plus proche ---
    s_geo_tourist = score_geo_tourist(
        restaurant["lat"],
        restaurant["lng"],
        tourist_sites,
        max_distance=config.MAX_DISTANCE_TOURIST,
    )

    # --- Score 2 : Distance à l'utilisateur ---
    s_geo_user = score_geo_user(
        restaurant["lat"],
        restaurant["lng"],
        user_lat,
        user_lng,
        max_distance=config.MAX_DISTANCE_USER,
    )

    # --- Score 3 : Langue des avis ---
    s_lang = score_language(
        restaurant.get("reviews", []),
        target_lang=target_lang,
    )

    # --- Score 4 : Note étoiles ---
    s_stars = score_stars(restaurant.get("rating", 0))

    # --- Score final pondéré (0-100) ---
    final = (
        s_geo_tourist * weights["geo_tourist"]
        + s_geo_user * weights["geo_user"]
        + s_lang * weights["language"]
        + s_stars * weights["stars"]
    ) * 100

    return {
        "score_geo_tourist": round(s_geo_tourist, 4),
        "score_geo_user": round(s_geo_user, 4),
        "score_language": s_lang,
        "score_stars": round(s_stars, 4),
        "score_final": round(final, 2),
    }


def score_all_restaurants(
    restaurants: list[dict],
    user_lat: float,
    user_lng: float,
    tourist_sites: list[dict],
    target_lang: str = None,
) -> list[dict]:
    """
    Calcule le score de tous les restaurants et les retourne triés (meilleur en premier).

    Returns:
        Liste de restaurants enrichis d'une clé 'scoring', triée par score final décroissant.
    """
    scored = []
    for resto in restaurants:
        scores = compute_score(resto, user_lat, user_lng, tourist_sites, target_lang)
        enriched = {**resto, "scoring": scores}
        scored.append(enriched)

    scored.sort(key=lambda r: r["scoring"]["score_final"], reverse=True)
    return scored
