# backend/ingestion/google/places_photos.py
# Récupération des photos de restaurants via l'API Google Places (New).
#
# POURQUOI CETTE VOIE ET PAS LE SCRAPING (D-021)
#
# Google Maps affiche des milliers de photos de cartes postées par les clients.
# Les récupérer par scraping supposerait de contourner la détection de robots :
# techniquement fragile (Google la fait évoluer en permanence), juridiquement
# intenable pour un produit, et indéfendable en soutenance.
#
# L'API Place Photos expose LES MÊMES photos, officiellement. Elle est payante
# et limitée, mais elle ne casse pas et elle se documente.
#
# CE QU'ON STOCKE : uniquement les OBSERVATIONS dérivées (nombre de plats,
# cuisines, langues). Jamais les photos elles-mêmes — elles appartiennent à
# leurs auteurs, et les CGU Google interdisent la mise en cache durable.

import requests

from backend import config

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
PHOTO_URL = "https://places.googleapis.com/v1/{photo_name}/media"


class PlacesError(RuntimeError):
    """Erreur d'appel à l'API Places (clé absente, quota, facturation…)."""


def _require_key() -> str:
    if not config.GOOGLE_API_KEY:
        raise PlacesError(
            "GOOGLE_API_KEY absente. Créer une clé sur console.cloud.google.com "
            "avec l'API 'Places API (New)' activée ET la facturation configurée "
            "(l'endpoint Photos est facturé). Renseigner la clé dans .env."
        )
    return config.GOOGLE_API_KEY


def find_place_id(name: str, lat: float, lng: float, radius_m: int = 120) -> str | None:
    """
    Retrouve le `place_id` Google d'un restaurant connu par son nom OSM
    et ses coordonnées.

    Le biais de localisation est volontairement serré (120 m par défaut) : les
    noms de restaurants sont très répétitifs ("Le Bistrot", "Chez Marie") et un
    rayon large produirait de faux appariements — pire qu'une absence de résultat.

    Returns:
        Le place_id, ou None si aucune correspondance fiable.
    """
    key = _require_key()

    response = requests.post(
        SEARCH_URL,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            # Le field mask est obligatoire sur l'API New et conditionne la
            # facturation : ne demander que ce qui est utilisé.
            "X-Goog-FieldMask": "places.id,places.displayName,places.location",
        },
        json={
            "textQuery": name,
            "locationBias": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": float(radius_m),
                }
            },
            "maxResultCount": 1,
            "languageCode": "fr",
        },
        timeout=30,
    )

    if response.status_code != 200:
        raise PlacesError(f"searchText {response.status_code}: {response.text[:200]}")

    places = response.json().get("places", [])
    return places[0]["id"] if places else None


def list_photos(place_id: str, limit: int = 10) -> list[dict]:
    """
    Liste les photos disponibles d'un lieu.

    Returns:
        [{"name": "places/X/photos/Y", "width": int, "height": int}, …]
    """
    key = _require_key()

    response = requests.get(
        DETAILS_URL.format(place_id=place_id),
        headers={
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "photos",
        },
        timeout=30,
    )

    if response.status_code != 200:
        raise PlacesError(f"details {response.status_code}: {response.text[:200]}")

    photos = response.json().get("photos", [])
    return [
        {
            "name": p["name"],
            "width": p.get("widthPx"),
            "height": p.get("heightPx"),
        }
        for p in photos[:limit]
    ]


def fetch_photo(photo_name: str, max_width: int = 1200) -> bytes:
    """
    Télécharge une photo.

    `max_width` à 1200 px : suffisant pour lire une carte, et évite de payer
    le transfert d'images de 4000 px dont le modèle n'a pas besoin.

    ATTENTION : le contenu retourné est destiné à être analysé puis JETÉ.
    Ne jamais l'écrire durablement sur disque ni en base (CGU Google + droit
    d'auteur des contributeurs).
    """
    key = _require_key()

    response = requests.get(
        PHOTO_URL.format(photo_name=photo_name),
        params={"maxWidthPx": max_width, "key": key},
        timeout=60,
    )

    if response.status_code != 200:
        raise PlacesError(f"photo {response.status_code}: {response.text[:200]}")

    return response.content
