# backend/ingestion/menu_scan/harvest.py
# Amorçage du signal menu : trouve la photo de carte parmi les photos d'un
# restaurant, l'extrait, et enregistre les observations (D-021).
#
#   python -m backend.ingestion.menu_scan.harvest quartier-latin --limit 50
#
# PIPELINE EN DEUX TEMPS, pour une raison de coût :
#
#   1. TRI      — un appel court par photo : « est-ce une carte ? » (oui/non).
#                 Réponse d'un mot, donc rapide et peu coûteux.
#   2. EXTRACTION — l'analyse complète ne tourne que sur la photo retenue.
#
# Sans ce tri, il faudrait lancer l'extraction complète sur toutes les photos
# de tous les restaurants : dix fois le coût et le temps, pour le même résultat.
#
# CE QUI EST STOCKÉ : uniquement les observations dérivées. Les photos sont
# analysées en mémoire puis jetées (CGU Google + droit d'auteur des auteurs).

import argparse
import base64
import sys
import time

import groq

from backend import config
from backend.core.scoring.menu_score import score_menu
from backend.db import repository as repo
from backend.db.models import get_connection
from backend.ingestion.google.places_photos import (
    PlacesError, fetch_photo, find_place_id, list_photos,
)
from backend.ingestion.menu_scan.client import analyze_menu_image
from backend.ingestion.menu_scan.providers.base import media_type

TRIAGE_PROMPT = (
    "Cette photo montre-t-elle une CARTE ou un MENU de restaurant, "
    "c'est-à-dire une liste de plats lisible ? "
    "Réponds par un seul mot : OUI ou NON. "
    "Réponds NON pour une photo de plat, de salle, de façade ou de personnes."
)


def is_menu_photo(image_bytes: bytes, filename: str = "photo.jpg") -> bool:
    """
    Tri rapide : cette photo montre-t-elle une carte ?

    Volontairement binaire et très court. Toute erreur ici coûte peu :
    un faux négatif fait passer à la photo suivante, un faux positif est
    rattrapé par `readable=False` à l'extraction.
    """
    client = groq.Groq(api_key=config.GROQ_API_KEY)
    encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

    try:
        response = client.chat.completions.create(
            model=config.GROQ_VISION_MODEL,
            max_completion_tokens=800,
            temperature=0.0,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": TRIAGE_PROMPT},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{media_type(filename)};base64,{encoded}"
                    }},
                ],
            }],
        )
    except groq.APIStatusError as e:
        print(f"    [tri] erreur {e.status_code}", file=sys.stderr)
        return False

    answer = (response.choices[0].message.content or "").upper()
    # Le modèle raisonne avant de répondre : on cherche le verdict, pas une
    # égalité stricte. "NON" est testé en premier car "OUI" peut apparaître
    # dans le raisonnement d'une réponse finalement négative.
    tail = answer[-200:]
    if "NON" in tail:
        return False
    return "OUI" in tail


def harvest_restaurant(resto: dict, max_photos: int = 8) -> dict | None:
    """
    Cherche et extrait la carte d'un restaurant.

    Returns:
        Le résultat d'extraction, ou None si aucune carte n'a été trouvée.
    """
    place_id = find_place_id(resto["name"], resto["lat"], resto["lng"])
    if not place_id:
        return None

    photos = list_photos(place_id, limit=max_photos)
    if not photos:
        return None

    for photo in photos:
        try:
            image = fetch_photo(photo["name"])
        except PlacesError as e:
            print(f"    photo indisponible : {e}", file=sys.stderr)
            continue

        if not is_menu_photo(image):
            continue

        # Photo retenue : extraction complète.
        analysis = analyze_menu_image(image, "menu.jpg")
        if not analysis.readable:
            continue  # le tri s'était trompé, on poursuit

        signal = analysis.to_menu_signal()
        scored = score_menu(signal)

        repo.save_menu_scan(
            restaurant_id=resto["id"],
            provider=f"{config.VISION_PROVIDER}+places",
            observations=analysis.model_dump(),
            menu_score=scored["score"],
            readable=True,
        )
        return {"analysis": analysis, "score": scored["score"]}

    return None


def harvest_zone(zone: str, limit: int = None, skip_done: bool = True) -> dict:
    """
    Parcourt les restaurants d'une zone et amorce leur signal menu.

    Args:
        limit: nombre maximum de restaurants à traiter (contrôle du budget)
        skip_done: ignorer ceux qui ont déjà une carte exploitable
    """
    conn = get_connection()
    sql = """
        SELECT r.* FROM restaurants r
         WHERE r.zone = ?
    """
    if skip_done:
        sql += """
           AND NOT EXISTS (
               SELECT 1 FROM menus m
                WHERE m.restaurant_id = r.id AND m.readable = 1
           )
        """
    sql += " ORDER BY r.name"
    if limit:
        sql += f" LIMIT {int(limit)}"

    restaurants = [dict(r) for r in conn.execute(sql, (zone,))]
    conn.close()

    print(f"[Harvest] {len(restaurants)} restaurants à traiter dans '{zone}'.\n")

    found = failed = 0
    for i, resto in enumerate(restaurants, 1):
        print(f"[{i}/{len(restaurants)}] {resto['name'][:40]}")
        try:
            result = harvest_restaurant(resto)
        except PlacesError as e:
            print(f"    ARRÊT : {e}")
            break
        except Exception as e:  # noqa: BLE001 — un restaurant ne doit pas tuer le lot
            print(f"    erreur : {type(e).__name__}: {e}")
            failed += 1
            continue

        if result:
            a = result["analysis"]
            found += 1
            print(
                f"    carte trouvée — {a.dish_count} plats, "
                f"{', '.join(a.cuisines) or '?'}, score {result['score']}"
            )
        else:
            print("    aucune carte exploitable")

        # Respiration : ni Places ni Groq n'apprécient les rafales.
        time.sleep(1)

    return {"traites": len(restaurants), "cartes": found, "erreurs": failed}


def main():
    parser = argparse.ArgumentParser(
        description="Amorce le signal menu depuis les photos Google Places."
    )
    parser.add_argument("zone", nargs="?", default="quartier-latin")
    parser.add_argument("--limit", type=int, default=None,
                        help="nombre maximum de restaurants (contrôle du budget)")
    parser.add_argument("--all", action="store_true",
                        help="retraiter aussi ceux qui ont déjà une carte")
    args = parser.parse_args()

    stats = harvest_zone(args.zone, limit=args.limit, skip_done=not args.all)

    print(f"\n[OK] {stats['cartes']} cartes extraites sur {stats['traites']} "
          f"restaurants ({stats['erreurs']} erreurs).")
    print("     Relancer le scoring pour prendre en compte les nouvelles cartes :")
    print(f"     python -m backend.ingestion.osm.load {args.zone}")


if __name__ == "__main__":
    main()
