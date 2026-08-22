# backend/ingestion/web/harvest_web.py
# Amorçage du signal menu depuis le web — sans clé, sans coût Google (D-023).
#
#   python -m backend.ingestion.web.harvest_web quartier-latin --limit 20
#   python -m backend.ingestion.web.harvest_web quartier-latin --dry-run
#
# PIPELINE :
#   1. RÉSOLUTION — tag OSM `website:menu`, sinon lien « carte » sur le site
#   2. RÉCUPÉRATION — texte de la page HTML ou du PDF
#   3. EXTRACTION — observations factuelles par le modèle (D-014)
#   4. SCORE — menu_score.py, déterministe, inchangé
#
# `--dry-run` s'arrête après l'étape 2 : il mesure la couverture réelle sans
# consommer un seul appel au modèle. À lancer en premier, toujours.
#
# PARALLÉLISME — comme pour la récolte photo (D-021), le temps passé ici est de
# l'attente réseau. Les restaurants sont traités en parallèle ; les écritures
# SQLite et l'affichage sont sérialisés par verrou, SQLite n'acceptant pas
# d'écritures concurrentes.
#
# CE QUI EST STOCKÉ : les observations dérivées et l'URL d'origine. Jamais le
# contenu de la page, qui appartient au restaurant.

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.core.scoring.menu_score import score_menu
from backend.db import repository as repo
from backend.db.models import get_connection, init_db
from backend.ingestion.menu_scan.text_client import analyze_menu_text
from backend.ingestion.osm.overpass import ZONES
from backend.ingestion.web.fetcher import FetchError, fetch_text, looks_like_menu
from backend.ingestion.web import menu_finder

_db_lock = threading.Lock()
_print_lock = threading.Lock()

# Le parallélisme utile ici n'est pas celui du réseau mais celui du quota :
# le tier gratuit Groq plafonne à 8 000 tokens/minute et une carte en consomme
# la moitié. Au-delà de 2 workers, tous les appels se heurtent au 429 et
# attendent — plus de threads ne fait qu'allonger la file. `--workers` permet
# de monter sur un compte payant.
MAX_WORKERS = 2


def _log(message: str) -> None:
    """Affichage sérialisé — sinon les lignes des threads s'entremêlent."""
    with _print_lock:
        print(message, flush=True)


def candidates(zone: str, limit: int | None = None) -> list[dict]:
    """
    Restaurants de la zone susceptibles d'avoir une carte en ligne.

    Ceux qui n'ont ni tag `website:menu` ni site web sont écartés d'emblée :
    aucun appel réseau ne sert à rien pour eux. C'est la majorité — et c'est
    le fait central que cette méthode ne peut pas contourner (D-001).
    """
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, name, website, menu_url
          FROM restaurants
         WHERE zone = ?
           AND (
                (menu_url IS NOT NULL AND menu_url != '')
             OR (website  IS NOT NULL AND website  != '')
           )
      ORDER BY (menu_url IS NULL OR menu_url = ''), name
    """, (zone,)).fetchall()
    conn.close()

    result = [dict(r) for r in rows]
    return result[:limit] if limit else result


def harvest_one(resto: dict, provider: str | None, dry_run: bool) -> dict:
    """
    Traite un restaurant. Ne lève jamais : un échec est un résultat.

    Returns:
        {"status": ..., "name": ..., "detail": ...} — `status` vaut
        'scored', 'unreadable', 'no_menu', 'fetch_failed' ou 'found'.
    """
    name = resto["name"]

    resolved = menu_finder.resolve(resto.get("menu_url") or "", resto.get("website") or "")
    if not resolved:
        _log(f"  ·  {name[:34]:36} aucun lien de carte trouvé")
        return {"status": "no_menu", "name": name, "detail": ""}

    url, origin = resolved

    try:
        text, fmt = fetch_text(url)
    except FetchError as e:
        _log(f"  ✗  {name[:34]:36} {e}")
        return {"status": "fetch_failed", "name": name, "detail": str(e)}

    # Filtre gratuit avant tout appel facturé : une page sans aucun prix ne
    # contient pas de liste de plats, quoi qu'annonce son titre.
    plausible, n_prices = looks_like_menu(text)

    if dry_run:
        verdict = f"{n_prices} prix" if plausible else f"SANS PRIX ({n_prices})"
        _log(f"  →  {name[:34]:36} [{origin}/{fmt}] {len(text)} car. · {verdict}")
        return {
            "status": "found" if plausible else "no_dishes",
            "name": name,
            "detail": url,
        }

    if not plausible:
        _log(f"  ·  {name[:34]:36} page sans liste de plats ({n_prices} prix)")
        return {"status": "no_dishes", "name": name, "detail": url}

    analysis = analyze_menu_text(text, provider=provider)
    signal = analysis.to_menu_signal()

    if signal is None:
        # Page inexploitable : on enregistre quand même, pour ne pas la
        # retenter indéfiniment et pour garder la trace de l'échec.
        with _db_lock:
            repo.save_menu_scan(
                resto["id"], f"web-{origin}", analysis.model_dump(),
                None, False, source_url=url,
            )
        _log(f"  ✗  {name[:34]:36} pas une carte — {analysis.notes[:40]}")
        return {"status": "unreadable", "name": name, "detail": analysis.notes}

    scored = score_menu(signal)

    with _db_lock:
        repo.save_menu_scan(
            resto["id"], f"web-{origin}", analysis.model_dump(),
            scored["score"], True, source_url=url,
        )

    _log(
        f"  ✓  {name[:34]:36} score {scored['score']:.2f}  "
        f"{analysis.dish_count} plats  {'/'.join(analysis.languages) or '?'}  [{origin}/{fmt}]"
    )
    return {"status": "scored", "name": name, "detail": scored["score"]}


def main():
    parser = argparse.ArgumentParser(
        description="Amorce le signal menu depuis le web (D-023).",
    )
    parser.add_argument("zone", choices=sorted(ZONES), help="zone à traiter")
    parser.add_argument("--limit", type=int, help="nombre de restaurants à traiter")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="mesure la couverture sans appeler le modèle (aucun coût)",
    )
    parser.add_argument(
        "--provider", choices=["groq", "claude"],
        help="forcer un fournisseur d'extraction (défaut : config.VISION_PROVIDER)",
    )
    parser.add_argument(
        "--workers", type=int, default=MAX_WORKERS,
        help=f"restaurants traités en parallèle (défaut : {MAX_WORKERS})",
    )
    args = parser.parse_args()

    init_db()
    targets = candidates(args.zone, args.limit)

    if not targets:
        print(
            f"Aucun restaurant de '{args.zone}' n'a de site web ni de tag "
            f"website:menu.\nLancer d'abord :\n"
            f"  python -m backend.ingestion.osm.load {args.zone}"
        )
        return 1

    with_tag = sum(1 for t in targets if (t.get("menu_url") or "").strip())
    mode = "SIMULATION (aucun appel au modèle)" if args.dry_run else "RÉCOLTE"

    print(f"[Web] {mode} — zone '{args.zone}'")
    print(f"[Web] {len(targets)} restaurants à tenter, dont {with_tag} avec un tag OSM website:menu\n")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(harvest_one, t, args.provider, args.dry_run): t
            for t in targets
        }
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as e:
                name = futures[future]["name"]
                _log(f"  ✗  {name[:34]:36} erreur inattendue : {type(e).__name__}: {e}")
                results.append({"status": "fetch_failed", "name": name, "detail": str(e)})

    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    print(f"\n{'=' * 70}")
    print(f"[Web] Tentés             : {len(results)}")
    print(f"[Web] Sans lien de carte : {counts.get('no_menu', 0)}")
    print(f"[Web] Récupération KO    : {counts.get('fetch_failed', 0)}")
    print(f"[Web] Page sans plats    : {counts.get('no_dishes', 0)}")
    if args.dry_run:
        found = counts.get("found", 0)
        print(f"[Web] Cartes plausibles  : {found}")
        print(
            f"\nCouverture réelle : {found} cartes sur {len(results)} tentatives "
            f"({100 * found / max(len(results), 1):.1f} %).\n"
            f"Relancer sans --dry-run pour extraire et scorer — seules ces "
            f"{found} déclencheront un appel au modèle."
        )
    else:
        print(f"[Web] Pages hors sujet   : {counts.get('unreadable', 0)}")
        print(f"[Web] Cartes scorées     : {counts.get('scored', 0)}")
        print(
            f"\nRecalculer le Local Signal pour intégrer ces cartes :\n"
            f"  python -m backend.ingestion.osm.load {args.zone}"
        )

    print(
        "\nRAPPEL (D-023) : cette voie ne couvre que les restaurants ayant une\n"
        "présence web. Le biais est mesurable via menus.provider ('web-osm',\n"
        "'web-crawl') — il doit être rapporté, pas ignoré."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
