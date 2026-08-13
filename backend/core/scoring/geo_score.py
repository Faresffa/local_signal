# backend/core/scoring/geo_score.py
# Signaux géographiques.
#
# Deux usages de nature DIFFÉRENTE, à ne jamais confondre (D-008) :
#
#   - score_tourist_zone : STATIQUE. Propriété du restaurant — se trouve-t-il dans
#     une zone à forte densité d'attrape-touristes ? Entre dans le Local Signal.
#
#   - score_geo_user : DYNAMIQUE. Propriété de la requête — à quelle distance est-il
#     de l'utilisateur *maintenant* ? N'entre pas dans le Local Signal, car la
#     distance à l'utilisateur ne dit rien sur l'authenticité d'un restaurant.

import math

from backend import config


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


def score_tourist_zone(
    restaurant_lat: float,
    restaurant_lng: float,
    tourist_sites: list[dict],
    radius: float = None,
    max_penalty: float = None,
) -> float:
    """
    Signal STATIQUE (0 à 1) : le restaurant échappe-t-il aux zones à forte densité
    d'attrape-touristes ? 1.0 = hors zone touristique, 0.0 = au pied du monument.

    ATTENTION — ce critère a été INVERSÉ (D-002). Il récompensait auparavant la
    proximité aux sites touristiques, avec le poids le plus élevé de la formule,
    ce qui contredisait frontalement l'intention du produit.

    Justification de l'inversion (argument économique, repris tel quel au mémoire) :

        Un restaurant adossé à un monument joue un JEU À UN COUP — ses clients ne
        reviendront jamais. Il n'a donc aucune incitation économique à la qualité :
        sa réputation auprès d'un client donné n'a pas de valeur future.
        Un restaurant de quartier vit de ses HABITUÉS — la relation est répétée,
        la qualité devient sa condition de survie.
        L'authenticité corrèle avec le taux de retour des clients, et la distance
        aux sites touristiques en est un proxy mesurable.

    Implémenté comme une pénalité de ZONE (rayon court), et non comme une
    récompense linéaire à l'éloignement : sinon l'algorithme recommanderait des
    zones industrielles au seul motif qu'elles sont loin de tout.

    Args:
        radius: rayon de la zone pénalisée en mètres (défaut: config)
        max_penalty: pénalité au contact du site (défaut: config)

    Returns:
        Score entre 0.0 et 1.0 — neutre (1.0) au-delà du rayon.
    """
    if radius is None:
        radius = config.TOURIST_ZONE_RADIUS
    if max_penalty is None:
        max_penalty = config.TOURIST_PENALTY_MAX

    dist = distance_to_nearest_tourist_site(restaurant_lat, restaurant_lng, tourist_sites)

    # Hors zone : aucune pénalité. S'éloigner davantage n'apporte aucun bonus.
    if dist >= radius:
        return 1.0

    penalty = max_penalty * (1.0 - dist / radius)
    return max(0.0, 1.0 - penalty)


def score_geo_user(
    restaurant_lat: float,
    restaurant_lng: float,
    user_lat: float,
    user_lng: float,
    max_distance: float = None,
) -> float:
    """
    Signal DYNAMIQUE (0 à 1) : proximité à l'utilisateur au moment de la requête.
    Plus le restaurant est proche → score élevé. Au-delà de max_distance → 0.

    N'entre PAS dans le Local Signal (D-008) : c'est une propriété de la requête,
    pas du restaurant.

    Returns:
        Score entre 0.0 et 1.0
    """
    if max_distance is None:
        max_distance = config.MAX_DISTANCE_USER

    dist = haversine(restaurant_lat, restaurant_lng, user_lat, user_lng)
    if dist >= max_distance:
        return 0.0
    return 1.0 - (dist / max_distance)
