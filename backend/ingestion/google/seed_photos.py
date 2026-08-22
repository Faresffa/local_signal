# backend/ingestion/google/seed_photos.py
# Associe à chaque restaurant sa première photo Google Places (D-025).
#
#   python -m backend.ingestion.google.seed_photos quartier-latin --limit 5
#   python -m backend.ingestion.google.seed_photos quartier-latin --dry-run
#
# POURQUOI UN SCRIPT SÉPARÉ, ET PAS UN APPEL À L'AFFICHAGE
#
# Résoudre un restaurant coûte DEUX appels facturés : une recherche textuelle
# pour obtenir le `place_id`, puis un détail pour lister ses photos. Les faire
# au moment du rendu signifierait 2 × 50 appels à chaque page de résultats —
# le quota gratuit mensuel serait consommé en une vingtaine de recherches.
#
# Ici, ces deux appels sont faits UNE FOIS par restaurant et leur résultat est
# stocké. Le `place_id` et le nom de ressource de la photo sont des
# identifiants, pas du contenu : les conserver ne pose pas de difficulté.
# Ensuite, seul le téléchargement de l'image reste à faire à l'affichage.
#
# COÛT RÉEL — chaque SKU offre 1 000 requêtes par mois. Une zone de moins de
# 500 restaurants tient donc dans le quota gratuit, à condition de ne pas
# relancer le script en boucle : il saute d'office les restaurants déjà résolus.

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend import config
from backend.db.models import get_connection, init_db
from backend.ingestion.google.places_photos import (
    PlacesError, fetch_photo, find_place_id, list_photos,
)
from backend.ingestion.osm.overpass import ZONES

_db_lock = threading.Lock()
_print_lock = threading.Lock()

MAX_WORKERS = 4  # l'API Places tolère mieux que le tier gratuit d'un LLM


def _log(message: str) -> None:
    with _print_lock:
        print(message, flush=True)


def pending(zone: str, limit: int | None, refresh: bool) -> list[dict]:
    """
    Restaurants restant à résoudre.

    Ceux qui portent déjà un `photo_ref` sont écartés : chaque relance
    inutile consomme deux appels facturés pour un résultat déjà connu.
    """
    clause = "" if refresh else "AND (photo_ref IS NULL OR photo_ref = '')"
    conn = get_connection()
    rows = conn.execute(
        f"SELECT id, name, lat, lng FROM restaurants WHERE zone = ? {clause} ORDER BY local_signal DESC",
        (zone,),
    ).fetchall()
    conn.close()

    result = [dict(r) for r in rows]
    return result[:limit] if limit else result


def resolve_one(resto: dict, download: bool) -> dict:
    """
    Résout un restaurant. Ne lève jamais : un échec est un résultat.

    Returns:
        {"status": 'ok' | 'no_place' | 'no_photo' | 'error', ...}
    """
    name = resto["name"]

    try:
        place_id = find_place_id(name, resto["lat"], resto["lng"])
    except PlacesError as e:
        _log(f"  ✗  {name[:32]:34} {str(e)[:70]}")
        return {"status": "error", "name": name}

    if not place_id:
        _log(f"  ·  {name[:32]:34} aucune correspondance Google")
        return {"status": "no_place", "name": name}

    try:
        photos = list_photos(place_id, limit=1)
    except PlacesError as e:
        _log(f"  ✗  {name[:32]:34} {str(e)[:70]}")
        return {"status": "error", "name": name}

    if not photos:
        with _db_lock:
            _store(resto["id"], place_id, None)
        _log(f"  ·  {name[:32]:34} fiche sans photo")
        return {"status": "no_photo", "name": name}

    photo_ref = photos[0].get("name")

    with _db_lock:
        _store(resto["id"], place_id, photo_ref)

    if download and config.PHOTO_CACHE_ENABLED:
        try:
            from backend.ingestion.google import photo_cache

            path = photo_cache.store(resto["id"], photo_ref)
            _log(f"  ✓  {name[:32]:34} {path.stat().st_size // 1024} Ko")
            return {"status": "ok", "name": name}
        except Exception as e:
            _log(f"  ✗  {name[:32]:34} téléchargement : {type(e).__name__}")
            return {"status": "error", "name": name}

    _log(f"  ✓  {name[:32]:34} référence enregistrée")
    return {"status": "ok", "name": name}


def _store(restaurant_id: str, place_id: str, photo_ref: str | None) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE restaurants SET google_place_id = ?, photo_ref = ? WHERE id = ?",
        (place_id, photo_ref or "", restaurant_id),
    )
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Associe à chaque restaurant sa première photo Google Places (D-025).",
    )
    parser.add_argument("zone", choices=sorted(ZONES))
    parser.add_argument("--limit", type=int, help="nombre de restaurants à traiter")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="compte ce qui serait appelé, sans consommer un seul appel",
    )
    parser.add_argument(
        "--refresh", action="store_true",
        help="retraite aussi les restaurants déjà résolus (re-facturé)",
    )
    parser.add_argument(
        "--no-download", action="store_true",
        help="enregistre les références sans télécharger les images",
    )
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    args = parser.parse_args()

    init_db()
    targets = pending(args.zone, args.limit, args.refresh)

    if not targets:
        print(
            f"Rien à résoudre pour '{args.zone}' — tous les restaurants ont déjà "
            f"une photo.\nUtiliser --refresh pour les retraiter (appels re-facturés)."
        )
        return 0

    if args.dry_run:
        print(
            f"[Photos] {len(targets)} restaurants à résoudre pour '{args.zone}'.\n"
            f"[Photos] Coût estimé : {len(targets)} recherches + {len(targets)} "
            f"détails{'' if args.no_download else f' + {len(targets)} images'}.\n"
            f"[Photos] Quota gratuit : 1 000 par SKU et par mois.\n\n"
            f"Relancer sans --dry-run pour exécuter."
        )
        return 0

    if not config.GOOGLE_API_KEY:
        print(
            "GOOGLE_API_KEY absente. La renseigner dans .env, avec « Places API "
            "(New) » activée et la facturation configurée."
        )
        return 1

    download = not args.no_download
    mode = "cache local" if (download and config.PHOTO_CACHE_ENABLED) else "références seules"
    print(f"[Photos] {len(targets)} restaurants — zone '{args.zone}' — mode : {mode}\n")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(resolve_one, t, download): t for t in targets}
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as e:
                name = futures[future]["name"]
                _log(f"  ✗  {name[:32]:34} inattendu : {type(e).__name__}")
                results.append({"status": "error", "name": name})

    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    print(f"\n{'=' * 62}")
    print(f"[Photos] Traités              : {len(results)}")
    print(f"[Photos] Sans correspondance  : {counts.get('no_place', 0)}")
    print(f"[Photos] Fiche sans photo     : {counts.get('no_photo', 0)}")
    print(f"[Photos] Erreurs              : {counts.get('error', 0)}")
    print(f"[Photos] Photos disponibles   : {counts.get('ok', 0)}")

    if config.PHOTO_CACHE_ENABLED:
        print(
            "\nRAPPEL (D-025) : les images sont conservées en local pour la\n"
            "démonstration. Les CGU Google interdisent cette mise en cache et les\n"
            "photos appartiennent à leurs auteurs — le dossier est gitignoré, il ne\n"
            "doit être ni versionné ni redistribué. Repasser PHOTO_CACHE_ENABLED à\n"
            "false rétablit le relais en direct sans autre changement."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
