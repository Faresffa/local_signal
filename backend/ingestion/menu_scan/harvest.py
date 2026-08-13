# backend/ingestion/menu_scan/harvest.py
# Amorçage du signal menu : trouve la photo de carte parmi les photos d'un
# restaurant, l'extrait, et enregistre les observations (D-021).
#
#   python -m backend.ingestion.menu_scan.harvest quartier-latin --limit 20
#
# PIPELINE EN DEUX TEMPS, pour une raison de coût :
#   1. TRI        — un appel court par photo : « est-ce une carte ? » (~2 s)
#   2. EXTRACTION — l'analyse complète, uniquement sur la photo retenue (~7 s)
#
# PARALLÉLISME (D-023) — tout le temps passé ici est de l'attente réseau, pas du
# calcul. Deux niveaux :
#   - les photos d'un même restaurant sont triées simultanément ;
#   - plusieurs restaurants sont traités en parallèle.
# En séquentiel, 468 restaurants prenaient 3 à 4 heures. Ici, ~20 minutes.
#
# CE QUI EST STOCKÉ : uniquement les observations dérivées. Les photos sont
# analysées en mémoire puis jetées (CGU Google + droit d'auteur des auteurs).

import argparse
import base64
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Écriture en base sérialisée : SQLite n'accepte pas d'écritures concurrentes.
_db_lock = threading.Lock()
_print_lock = threading.Lock()


def _log(message: str) -> None:
    """Affichage sérialisé — sinon les lignes des threads s'entremêlent."""
    with _print_lock:
        print(message, flush=True)


def is_menu_photo(image_bytes: bytes, filename: str = "photo.jpg") -> bool:
    """
    Tri rapide : cette photo montre-t-elle une carte ?

    Volontairement binaire et très court. Toute erreur ici coûte peu : un faux
    négatif fait passer à la photo suivante, un faux positif est rattrapé par
    `readable=False` à l'extraction.
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
    except groq.APIStatusError:
        return False

    answer = (response.choices[0].message.content or "").upper()
    # Le modèle raisonne avant de répondre : on cherche le verdict en fin de
    # réponse. « NON » est testé en premier car « OUI » peut apparaître dans le
    # raisonnement d'une réponse finalement négative.
    tail = answer[-200:]
    if "NON" in tail:
        return False
    return "OUI" in tail


def _fetch_and_triage(photo: dict) -> tuple[bytes, bool] | None:
    """Télécharge une photo et la trie. Retourne None en cas d'échec réseau."""
    try:
        image = fetch_photo(photo["name"])
    except PlacesError:
        return None
    return image, is_menu_photo(image)


def harvest_restaurant(resto: dict, max_photos: int = 10, photo_workers: int = 5) -> dict | None:
    """
    Cherche et extrait la carte d'un restaurant.

    Les photos sont téléchargées et triées **en parallèle**, puis on retient la
    première candidate dans l'ordre d'origine — les premières photos renvoyées
    par Google sont les plus représentatives, donc les plus susceptibles d'être
    la carte officielle plutôt qu'un cliché de passage.

    Returns:
        {"analysis": MenuAnalysis, "score": float} ou None si aucune carte.
    """
    place_id = find_place_id(resto["name"], resto["lat"], resto["lng"])
    if not place_id:
        return None

    photos = list_photos(place_id, limit=max_photos)
    if not photos:
        return None

    # Tri parallèle de toutes les photos.
    results: dict[int, tuple[bytes, bool]] = {}
    with ThreadPoolExecutor(max_workers=photo_workers) as pool:
        futures = {pool.submit(_fetch_and_triage, p): i for i, p in enumerate(photos)}
        for future in as_completed(futures):
            outcome = future.result()
            if outcome is not None:
                results[futures[future]] = outcome

    # Extraction sur les candidates, dans l'ordre d'origine.
    for index in sorted(results):
        image, is_menu = results[index]
        if not is_menu:
            continue

        analysis = analyze_menu_image(image, "menu.jpg")
        if not analysis.readable:
            continue  # le tri s'était trompé, on poursuit

        scored = score_menu(analysis.to_menu_signal())
        with _db_lock:
            repo.save_menu_scan(
                restaurant_id=resto["id"],
                provider=f"{config.VISION_PROVIDER}+places",
                observations=analysis.model_dump(),
                menu_score=scored["score"],
                readable=True,
            )
        return {"analysis": analysis, "score": scored["score"]}

    return None


def _process(resto: dict, index: int, total: int) -> str:
    """Traite un restaurant et retourne son issue : 'carte', 'aucune', 'erreur'."""
    try:
        result = harvest_restaurant(resto)
    except PlacesError as e:
        _log(f"[{index}/{total}] {resto['name'][:34]:36s} ARRÊT — {e}")
        raise
    except Exception as e:  # noqa: BLE001 — un restaurant ne doit pas tuer le lot
        _log(f"[{index}/{total}] {resto['name'][:34]:36s} erreur : {type(e).__name__}")
        return "erreur"

    if result:
        a = result["analysis"]
        _log(
            f"[{index}/{total}] {resto['name'][:34]:36s} CARTE — "
            f"{a.dish_count} plats, {', '.join(a.cuisines) or '?'}, "
            f"score {result['score']}"
        )
        return "carte"

    _log(f"[{index}/{total}] {resto['name'][:34]:36s} aucune carte")
    return "aucune"


def harvest_zone(
    zone: str,
    limit: int = None,
    skip_done: bool = True,
    workers: int = 6,
) -> dict:
    """
    Parcourt les restaurants d'une zone et amorce leur signal menu.

    Args:
        limit: nombre maximum de restaurants (contrôle du budget)
        skip_done: ignorer ceux qui ont déjà une carte exploitable
        workers: restaurants traités en parallèle. Au-delà de ~8, Groq et Google
                 commencent à limiter le débit et on perd le bénéfice.
    """
    conn = get_connection()
    sql = "SELECT r.* FROM restaurants r WHERE r.zone = ?"
    if skip_done:
        sql += """
           AND NOT EXISTS (SELECT 1 FROM menus m
                            WHERE m.restaurant_id = r.id AND m.readable = 1)
        """
    sql += " ORDER BY r.name"
    if limit:
        sql += f" LIMIT {int(limit)}"

    restaurants = [dict(r) for r in conn.execute(sql, (zone,))]
    conn.close()

    total = len(restaurants)
    print(f"[Harvest] {total} restaurants dans '{zone}', {workers} en parallèle.\n")

    counts = {"carte": 0, "aucune": 0, "erreur": 0}
    stopped = False

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_process, r, i, total): r
            for i, r in enumerate(restaurants, 1)
        }
        for future in as_completed(futures):
            try:
                counts[future.result()] += 1
            except PlacesError:
                stopped = True
                break

    if stopped:
        print("\n[ARRÊT] Erreur d'API Google — vérifier la clé, les quotas "
              "ou la facturation.")

    return {"traites": sum(counts.values()), "cartes": counts["carte"],
            "aucune": counts["aucune"], "erreurs": counts["erreur"]}


def main():
    parser = argparse.ArgumentParser(
        description="Amorce le signal menu depuis les photos Google Places."
    )
    parser.add_argument("zone", nargs="?", default="quartier-latin")
    parser.add_argument("--limit", type=int, default=None,
                        help="nombre maximum de restaurants (contrôle du budget)")
    parser.add_argument("--workers", type=int, default=6,
                        help="restaurants traités en parallèle (défaut 6)")
    parser.add_argument("--all", action="store_true",
                        help="retraiter aussi ceux qui ont déjà une carte")
    args = parser.parse_args()

    stats = harvest_zone(
        args.zone, limit=args.limit,
        skip_done=not args.all, workers=args.workers,
    )

    rendement = (stats["cartes"] / stats["traites"] * 100) if stats["traites"] else 0
    print(f"\n[OK] {stats['cartes']} cartes sur {stats['traites']} restaurants "
          f"({rendement:.0f} % de rendement, {stats['erreurs']} erreurs).")
    print("     Relancer le scoring pour prendre en compte les nouvelles cartes :")
    print(f"     python -m backend.ingestion.osm.load {args.zone}")


if __name__ == "__main__":
    main()
