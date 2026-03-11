# scoring/geo_score.py
# Calcul de distances géographiques via la formule de Haversine

import math


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcule la distance en mètres entre deux points GPS (lat/lng).
    Utilise la formule de Haversine (précision suffisante pour <100km).

    Args:
        lat1, lng1: Coordonnées du point A (ex: restaurant)
        lat2, lng2: Coordonnées du point B (ex: site touristique)

    Returns:
        Distance en mètres (float)
    """
    R = 6_371_000  # Rayon de la Terre en mètres

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (math.sin(delta_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def distance_to_nearest_tourist_site(
    restaurant_lat: float,
    restaurant_lng: float,
    tourist_sites: list[dict],
) -> float:
    """
    Retourne la distance (en mètres) au site touristique le plus proche.

    Args:
        restaurant_lat, restaurant_lng: Coordonnées du restaurant
        tourist_sites: Liste de dicts avec clés 'lat' et 'lng'

    Returns:
        Distance minimale en mètres
    """
    if not tourist_sites:
        return float("inf")

    distances = [
        haversine(restaurant_lat, restaurant_lng, site["lat"], site["lng"])
        for site in tourist_sites
    ]
    return min(distances)


def score_geo_tourist(
    restaurant_lat: float,
    restaurant_lng: float,
    tourist_sites: list[dict],
    max_distance: float = 2000,
) -> float:
    """
    Score normalisé (0 à 1) basé sur la proximité au site touristique le plus proche.
    Plus le restaurant est proche → score élevé.
    Au-delà de max_distance → score = 0.

    Returns:
        Score entre 0.0 et 1.0
    """
    dist = distance_to_nearest_tourist_site(restaurant_lat, restaurant_lng, tourist_sites)
    if dist >= max_distance:
        return 0.0
    return 1.0 - (dist / max_distance)


def score_geo_user(
    restaurant_lat: float,
    restaurant_lng: float,
    user_lat: float,
    user_lng: float,
    max_distance: float = 5000,
) -> float:
    """
    Score normalisé (0 à 1) basé sur la proximité à l'utilisateur.
    Plus le restaurant est proche de l'utilisateur → score élevé.
    Au-delà de max_distance → score = 0.

    Returns:
        Score entre 0.0 et 1.0
    """
    dist = haversine(restaurant_lat, restaurant_lng, user_lat, user_lng)
    if dist >= max_distance:
        return 0.0
    return 1.0 - (dist / max_distance)
