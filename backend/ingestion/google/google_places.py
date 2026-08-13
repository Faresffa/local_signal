# api/google_places.py
# Client pour l'API Google Places (Nearby Search)
# En mode mock par défaut — retourne les données locales

import requests
from backend import config
from backend.data.mock_data import MOCK_RESTAURANTS


def search_nearby(
    lat: float,
    lng: float,
    radius: int = 1500,
    restaurant_type: str = "restaurant",
    keyword: str = None,
) -> list[dict]:
    """
    Recherche des restaurants à proximité via l'API Google Places Nearby Search.

    En mode mock (config.USE_MOCK_DATA=True ou pas de clé API),
    retourne les restaurants mockés.

    Args:
        lat, lng: Centre de la recherche
        radius: Rayon en mètres (défaut: 1500m)
        restaurant_type: Type d'établissement
        keyword: Mot-clé optionnel

    Returns:
        Liste de restaurants (format unifié)
    """
    # --- Mode Mock ---
    if config.USE_MOCK_DATA or not config.GOOGLE_API_KEY:
        return MOCK_RESTAURANTS

    # --- Mode API Réelle ---
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": restaurant_type,
        "key": config.GOOGLE_API_KEY,
    }
    if keyword:
        params["keyword"] = keyword

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        restaurants = []
        for place in data.get("results", []):
            restaurants.append({
                "id": place.get("place_id", ""),
                "name": place.get("name", ""),
                "lat": place["geometry"]["location"]["lat"],
                "lng": place["geometry"]["location"]["lng"],
                "address": place.get("vicinity", ""),
                "price": place.get("price_level", 2) * 15,
                "type": _extract_type(place.get("types", [])),
                "ambiance": "Moderne",
                "city": "Paris",
                "reservation": True,
                "image": place.get("photos", [{}])[0].get("photo_reference", ""),
                "horaires": [("11:00", "14:30"), ("18:30", "22:00")],
                "reviews": [],
            })

        return restaurants

    except requests.RequestException as e:
        print(f"[Google Places API] Erreur: {e}. Fallback sur données mockées.")
        return MOCK_RESTAURANTS


def _extract_type(types: list[str]) -> str:
    """Convertit les types Google en catégories locales."""
    mapping = {
        "restaurant": "Française",
        "meal_delivery": "Asiatique",
        "meal_takeaway": "Asiatique",
        "cafe": "Française",
        "bakery": "Française",
    }
    for t in types:
        if t in mapping:
            return mapping[t]
    return "Française"
