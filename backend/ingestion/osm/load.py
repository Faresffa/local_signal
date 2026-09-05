# backend/ingestion/osm/load.py
# Import des restaurants OSM en base, puis calcul du Local Signal.
#
#   python -m backend.ingestion.osm.load quartier-latin
#
# Sépare volontairement les deux étapes (D-008) :
#   1. IMPORT  — faits OSM, réimportables sans rien écraser du reste
#   2. SCORING — Local Signal statique, recalculable indépendamment
#
# L'import préserve les colonnes de vérité terrain (`label`, `label_sources`,
# `human_validated`) : un réimport OSM ne doit JAMAIS effacer un travail de
# labellisation qui a coûté des heures.

import json
import sys
from datetime import datetime

from backend.core.scoring.engine import compute_local_signal
from backend.core.scoring.geo_score import tourist_pressure
from backend.db.models import get_connection, init_db
from backend.ingestion.osm.overpass import ZONES, fetch_restaurants


def import_zone(zone: str) -> int:
    """Importe les restaurants d'une zone. Retourne le nombre importé."""
    print(f"[OSM] Interrogation d'Overpass pour '{zone}'…")
    restaurants = fetch_restaurants(zone)
    print(f"[OSM] {len(restaurants)} restaurants nommés reçus.")

    conn = get_connection()
    cursor = conn.cursor()

    for r in restaurants:
        # ON CONFLICT ne met à jour que les faits OSM. Les colonnes de vérité
        # terrain et de scoring sont volontairement absentes du DO UPDATE.
        cursor.execute("""
            INSERT INTO restaurants (
                id, osm_type, osm_id, name, lat, lng, cuisine, address, city,
                zone, website, menu_url, phone, opening_hours, price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                lat = excluded.lat,
                lng = excluded.lng,
                cuisine = excluded.cuisine,
                address = excluded.address,
                city = excluded.city,
                website = excluded.website,
                menu_url = excluded.menu_url,
                phone = excluded.phone,
                opening_hours = excluded.opening_hours
        """, (
            r["id"], r["osm_type"], r["osm_id"], r["name"], r["lat"], r["lng"],
            r["cuisine"], r["address"], r["city"], r["zone"],
            r["website"], r["menu_url"], r["phone"], r["opening_hours"], r["price"],
        ))

    conn.commit()
    conn.close()
    return len(restaurants)


def load_tourist_sites(zone: str) -> int:
    """
    Importe les sites touristiques majeurs de la zone depuis OSM.

    Sert la pénalité de zone touristique (D-002). Les tags retenus
    (`tourism=attraction`, `historic=monument`…) sont ceux qui désignent des
    lieux à forte fréquentation de passage — pas n'importe quel bâtiment ancien.
    """
    import requests
    from backend.ingestion.osm.overpass import OVERPASS_URL, USER_AGENT

    south, west, north, east = ZONES[zone]
    bbox = f"{south},{west},{north},{east}"
    query = (
        f"[out:json][timeout:180];("
        f'nwr["tourism"="attraction"]({bbox});'
        f'nwr["tourism"="museum"]({bbox});'
        f'nwr["historic"="monument"]({bbox});'
        f'nwr["amenity"="place_of_worship"]["heritage"]({bbox});'
        f");out center tags;"
    )

    print(f"[OSM] Sites touristiques de '{zone}'…")
    # Overpass renvoie 429 (trop de requetes) ou 504 (surcharge) quand on
    # l'interroge coup sur coup, notamment sur une grande zone comme Paris.
    # Reprise avec attente croissante plutot que d'echouer sec — meme logique
    # que fetch_restaurants.
    import time
    response = None
    for tentative in range(5):
        response = requests.post(
            OVERPASS_URL, data={"data": query},
            headers={"User-Agent": USER_AGENT}, timeout=240,
        )
        if response.status_code not in (429, 504):
            break
        attente = 20 * (tentative + 1)
        print(f"[OSM] Overpass surcharge ({response.status_code}), "
              f"nouvelle tentative dans {attente} s…")
        time.sleep(attente)
    response.raise_for_status()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tourist_sites WHERE zone = ?", (zone,))

    count = 0
    for el in response.json().get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lng = el.get("lon") or el.get("center", {}).get("lng") or el.get("center", {}).get("lon")
        if not name or lat is None or lng is None:
            continue
        cursor.execute(
            "INSERT INTO tourist_sites (name, lat, lng, zone, source) VALUES (?,?,?,?,?)",
            (name, lat, lng, zone, "osm"),
        )
        count += 1

    conn.commit()
    conn.close()
    print(f"[OSM] {count} sites touristiques importés.")
    return count


def score_zone(zone: str) -> int:
    """
    Calcule et stocke le Local Signal de tous les restaurants d'une zone.

    C'est le batch de recalcul décrit en D-008 : le score statique est calculé
    ici, une fois, et lu tel quel par les requêtes utilisateur.
    """
    conn = get_connection()

    restaurants = [dict(r) for r in conn.execute(
        "SELECT * FROM restaurants WHERE zone = ?", (zone,)
    )]
    sites = [dict(s) for s in conn.execute(
        "SELECT name, lat, lng FROM tourist_sites WHERE zone = ?", (zone,)
    )]

    if not restaurants:
        print(f"[Scoring] Aucun restaurant en base pour '{zone}'.")
        conn.close()
        return 0

    print(f"[Scoring] {len(restaurants)} restaurants, {len(sites)} sites touristiques…")

    # Rattachement des cartes déjà extraites (D-021). Un restaurant sans carte
    # garde `menu = None` : son poids est redistribué, pas mis à zéro (D-012).
    menus = {
        row["restaurant_id"]: json.loads(row["observations_json"])
        for row in conn.execute("""
            SELECT m.restaurant_id, m.observations_json
              FROM menus m
              JOIN (SELECT restaurant_id, MAX(scanned_at) AS latest
                      FROM menus WHERE readable = 1
                     GROUP BY restaurant_id) last
                ON m.restaurant_id = last.restaurant_id
               AND m.scanned_at = last.latest
        """)
    }
    with_menu = 0

    for r in restaurants:
        r["reviews"] = []             # pas d'avis : le lissage gère (D-003)
        r["type"] = r.get("cuisine")   # `price_score` compare à cuisine égale

        obs = menus.get(r["id"])
        # La requête ne rend QUE des cartes lisibles (`WHERE readable = 1`).
        # Revérifier la clé dans le JSON était redondant et faux : les
        # observations produites par la voie OCR ne la portaient pas, et
        # 318 cartes sur 338 étaient ignorées en silence.
        if obs:
            r["menu"] = {
                "cuisines": obs.get("cuisines", []),
                "dish_count": obs.get("dish_count"),
                "languages": obs.get("languages", []),
                "vernacular_ratio": obs.get("vernacular_ratio"),
                "has_tourist_menu": obs.get("has_tourist_menu", False),
                "has_dish_photos": obs.get("has_dish_photos", False),
            }
            with_menu += 1

    print(f"[Scoring] {with_menu} restaurants disposent d'une carte extraite.")

    # Cohorte de pression touristique, calculée une seule fois pour tout le lot
    # (D-027). C'est ici — en lot, hors du chemin d'une requête — que le rang en
    # percentile prend son sens : tous les restaurants de la zone sont classés
    # les uns par rapport aux autres, et le résultat est figé en base.
    cohort_pressures = [
        tourist_pressure(r["lat"], r["lng"], sites) for r in restaurants
    ]
    print(
        f"[Scoring] Pression touristique : "
        f"min {min(cohort_pressures):.2f}  "
        f"mediane {sorted(cohort_pressures)[len(cohort_pressures)//2]:.2f}  "
        f"max {max(cohort_pressures):.2f}"
        if cohort_pressures else "[Scoring] Aucun restaurant."
    )

    now = datetime.now().isoformat(timespec="seconds")
    cursor = conn.cursor()

    for r in restaurants:
        result = compute_local_signal(
            r, sites, peers=restaurants, cohort_pressures=cohort_pressures
        )
        cursor.execute("""
            UPDATE restaurants
               SET local_signal = ?, confidence = ?, signals_json = ?, scored_at = ?
             WHERE id = ?
        """, (
            result["local_signal"],
            result["confidence"],
            json.dumps(result["signals"], ensure_ascii=False),
            now,
            r["id"],
        ))

    conn.commit()
    conn.close()
    return len(restaurants)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    flags = {a for a in sys.argv[1:] if a.startswith("-")}

    zone = args[0] if args else "quartier-latin"
    if zone not in ZONES:
        print(f"Zone inconnue : '{zone}'. Disponibles : {', '.join(ZONES)}")
        raise SystemExit(1)

    init_db()

    # `--score-only` recalcule à partir de ce qui est déjà en base, sans toucher
    # au réseau. Indispensable après une récolte de cartes (D-023) : le score
    # change, pas les faits OSM. Sans ce mode, un simple recalcul dépendait de
    # la disponibilité d'Overpass — un 504 de leur côté empêchait de scorer des
    # données pourtant déjà locales.
    if "--score-only" in flags:
        scored = score_zone(zone)
        print(f"\n[OK] {scored} restaurants rescorés pour '{zone}' (sans appel réseau).")
    else:
        n = import_zone(zone)
        load_tourist_sites(zone)
        scored = score_zone(zone)
        print(f"\n[OK] {n} restaurants importés, {scored} scorés pour '{zone}'.")

    print("     Les scores sont PROVISOIRES tant que les pondérations ne sont")
    print("     pas calibrées sur le jeu labellisé (D-006).")


if __name__ == "__main__":
    main()
