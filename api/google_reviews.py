# api/google_reviews.py
# Client pour l'API Google Reviews (Place Details)
# En mode mock par défaut — retourne les avis pré-renseignés

import requests
import config


def get_reviews(place_id: str, restaurant: dict = None) -> list[dict]:
    """
    Récupère les avis d'un restaurant via l'API Google Place Details.

    En mode mock, retourne les avis pré-renseignés dans le dict restaurant.

    Args:
        place_id: ID Google Places du restaurant
        restaurant: Dict restaurant (pour mode mock)

    Returns:
        Liste de dicts avec clés 'text' et optionnellement 'lang'
    """
    # --- Mode Mock ---
    if config.USE_MOCK_DATA or not config.GOOGLE_API_KEY:
        if restaurant and "reviews" in restaurant:
            return restaurant["reviews"]
        return []

    # --- Mode API Réelle ---
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "reviews",
        "key": config.GOOGLE_API_KEY,
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        reviews = []
        for review in data.get("result", {}).get("reviews", []):
            reviews.append({
                "text": review.get("text", ""),
                "lang": review.get("language", ""),
            })

        return reviews

    except requests.RequestException as e:
        print(f"[Google Reviews API] Erreur: {e}. Retour liste vide.")
        return []
