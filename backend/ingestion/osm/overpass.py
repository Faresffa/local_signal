# backend/ingestion/osm/overpass.py
# Ingestion des restaurants depuis OpenStreetMap via l'API Overpass.
#
# C'est le référentiel de lieux du projet (D-005) : libre, gratuit, sans clé,
# et sans clause interdisant de construire une base durable — contrairement à
# Google Places. Les restaurants y portent déjà des tags `cuisine`, `addr:*`,
# `opening_hours`, `phone`, `website`.
#
# Aucune authentification requise. L'API est un service communautaire : rester
# raisonnable sur la fréquence des appels et mettre en cache les résultats.

import time

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "LocalSignal/0.1 (projet académique HETIC)"

# Zones d'étude. Une zone = (sud, ouest, nord, est) en degrés décimaux.
#
# Le Quartier latin est le terrain d'évaluation retenu (docs/data/README.md) :
# le local et le touristique y sont géographiquement IMBRIQUÉS — rue de la
# Huchette est un cas d'école d'attrape-touristes, et de vrais bistrots de
# quartier existent à 400 m. Si les deux classes étaient séparées dans l'espace,
# la distance seule suffirait à les distinguer et le modèle ne prouverait rien.
ZONES = {
    "quartier-latin": (48.8400, 2.3380, 48.8535, 2.3560),
    "montreuil": (48.8480, 2.4050, 48.8720, 2.4650),
}


def build_query(bbox: tuple[float, float, float, float]) -> str:
    """Construit la requête Overpass QL pour les restaurants d'une zone."""
    south, west, north, east = bbox
    return (
        f"[out:json][timeout:60];"
        f'nwr["amenity"="restaurant"]({south},{west},{north},{east});'
        f"out center tags;"
    )


def fetch_restaurants(zone: str = "quartier-latin", retries: int = 3) -> list[dict]:
    """
    Récupère les restaurants d'une zone depuis Overpass.

    Args:
        zone: clé de ZONES, ou bbox explicite
        retries: nombre de tentatives (Overpass renvoie souvent 429 en heure pleine)

    Returns:
        Liste de restaurants au format interne du projet.

    Raises:
        ValueError: si la zone est inconnue
        requests.RequestException: si l'API reste inaccessible après les tentatives
    """
    if zone not in ZONES:
        raise ValueError(
            f"Zone inconnue : '{zone}'. Zones disponibles : {', '.join(ZONES)}"
        )

    query = build_query(ZONES[zone])
    last_error = None

    for attempt in range(retries):
        try:
            response = requests.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=90,
            )
            response.raise_for_status()
            return _parse(response.json(), zone)
        except requests.RequestException as e:
            last_error = e
            if attempt < retries - 1:
                # Backoff : Overpass est un service communautaire, on ne le martèle pas.
                time.sleep(5 * (attempt + 1))

    raise last_error


def _parse(payload: dict, zone: str) -> list[dict]:
    """Convertit la réponse Overpass au format interne."""
    restaurants = []

    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name:
            continue  # un restaurant sans nom n'est pas exploitable

        # Les nœuds portent lat/lon ; les ways et relations un `center`.
        lat = element.get("lat") or element.get("center", {}).get("lat")
        lng = element.get("lon") or element.get("center", {}).get("lon")
        if lat is None or lng is None:
            continue

        restaurants.append({
            "id": f"osm_{element['type'][0]}{element['id']}",
            "osm_type": element["type"],
            "osm_id": element["id"],
            "name": name,
            "lat": lat,
            "lng": lng,
            "cuisine": tags.get("cuisine", ""),
            "address": _address(tags),
            "city": tags.get("addr:city", ""),
            "zone": zone,
            "website": tags.get("website") or tags.get("contact:website", ""),
            "phone": tags.get("phone") or tags.get("contact:phone", ""),
            "opening_hours": tags.get("opening_hours", ""),
            # URL de carte déclarée dans OSM (D-023). Rare — environ 3 % des
            # restaurants — mais c'est la seule source de menu à la fois
            # gratuite, licite et directement exploitable. `website:menu` est
            # le tag de fait ; les deux autres sont des variantes marginales.
            "menu_url": (
                tags.get("website:menu")
                or tags.get("menu:url")
                or tags.get("url:menu", "")
            ),
            # Signaux exploitables directement par le scoring :
            "outdoor_seating": tags.get("outdoor_seating", ""),
            "takeaway": tags.get("takeaway", ""),
            # `price` reste vide : OSM ne le porte pas de façon fiable.
            # Il viendra du scan de carte (D-004).
            "price": None,
        })

    return restaurants


def _address(tags: dict) -> str:
    """Reconstitue une adresse lisible depuis les tags addr:*."""
    parts = [
        " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")])),
        " ".join(filter(None, [tags.get("addr:postcode"), tags.get("addr:city")])),
    ]
    return ", ".join(p for p in parts if p.strip())
