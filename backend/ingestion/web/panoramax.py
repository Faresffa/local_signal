# backend/ingestion/web/panoramax.py
#
# PHOTO DE FAÇADE POUR LES RESTAURANTS SANS SITE (D-067).
#
# Un restaurant sans site web n'a pas de `og:image` (og_image.py) : jusqu'ici
# il restait sur l'illustration générée. Or ce sont justement les restaurants
# invisibles que le projet veut montrer (CLAUDE.md §2).
#
# PANORAMAX est la base libre de photos de rue de la communauté OpenStreetMap
# France et de l'IGN — l'équivalent ouvert de Street View. Son API publique
# sait chercher les photos ORIENTÉES VERS un point (`place_position`) : on
# obtient la façade du restaurant, pas un bout de trottoir au hasard.
# Mesuré sur 8 restaurants sans site tirés au hasard : 6 photos trouvées.
#
# LICENCE. Les photos sont sous CC-BY-SA 4.0 (ou plus ouvert) : leur réutilisation
# est permise À CONDITION de citer l'auteur. On stocke donc l'auteur dans
# `photo_credit`, et les interfaces l'affichent avec la photo.
#
# ON STOCKE L'URL, JAMAIS L'IMAGE (D-021, D-025) — même règle qu'og_image.py.
#
# PRIORITÉ. Une photo publiée par le restaurant lui-même passe avant une photo
# de rue : ce collecteur ne touche qu'aux fiches sans photo affichable. Lancer
# og_image.py d'abord.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.ingestion.web.panoramax --limite 20 --a-blanc
#     python -m backend.ingestion.web.panoramax

import argparse
import json
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend import config
from backend.ingestion.web.og_image import PHOTO_EXPIREE

API = "https://api.panoramax.xyz/api/search"
AGENT = "LocalSignalBot/1.0 (projet de memoire HETIC; photos de facade Panoramax)"
DELAI_S = 20

# Distance entre la caméra et le restaurant, en mètres. En dessous de 3 m la
# photo est prise devant la porte (souvent floue ou masquée) ; au-delà de 25 m
# la façade n'est plus reconnaissable. Paramètre de lecture, pas de calibration.
DISTANCE = "3-25"

# Écart toléré entre la direction de la caméra et le restaurant, en degrés.
TOLERANCE_ANGLE = 30

# Recherches de secours, de la plus fidèle à la plus large — toujours avec la
# caméra TOURNÉE VERS le restaurant :
#   1. façade proche (DISTANCE, 30°) ;
#   2. façade plus lointaine, angle plus large.
# Le troisième palier d'origine (« n'importe quelle photo de la rue à 40 m »)
# a été retiré le 5 octobre 2026 : il montrait la chaussée, pas le restaurant
# (retour utilisateur). Mieux vaut l'illustration qu'une photo hors sujet.
PALIERS = [
    {"place_distance": DISTANCE, "place_fov_tolerance": TOLERANCE_ANGLE},
    {"place_distance": "2-60", "place_fov_tolerance": 90},
]

# On demande plusieurs photos par palier pour pouvoir écarter les panoramas.
CANDIDATES_PAR_PALIER = 10

# PANORAMAS 360° ÉCARTÉS (retour utilisateur, capture du 5 octobre 2026).
# Affichée à plat, une photo 360° est une bande déformée où l'on voit surtout
# la route et le casque du contributeur. On les reconnaît à leur champ de vision
# (≥ 180°) ou, quand il n'est pas renseigné, à leur format équirectangulaire :
# une image deux fois plus large que haute.
CHAMP_MAX_DEG = 180
RATIO_PANORAMA = 1.95


def est_panorama(photo: dict) -> bool:
    orientation = photo.get("properties", {}).get("pers:interior_orientation") or {}
    champ = orientation.get("field_of_view")
    if champ is not None and champ >= CHAMP_MAX_DEG:
        return True
    largeur, hauteur = (orientation.get("sensor_array_dimensions") or [0, 0])[:2]
    return bool(hauteur) and largeur / hauteur >= RATIO_PANORAMA


def _requete(params: dict) -> list[dict]:
    url = f"{API}?{urllib.parse.urlencode({**params, 'limit': CANDIDATES_PAR_PALIER})}"
    requete = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(requete, timeout=DELAI_S) as reponse:
        return json.load(reponse).get("features", [])


def chercher(lat: float, lng: float) -> dict | None:
    """Meilleure photo plate tournée vers ce point, ou None."""
    for palier in PALIERS:
        for photo in _requete({"place_position": f"{lng},{lat}", **palier}):
            url = (photo.get("assets", {}).get("sd") or {}).get("href")
            if not url or est_panorama(photo):
                continue
            auteurs = [p.get("name") for p in photo.get("providers", []) if p.get("name")]
            licence = photo.get("properties", {}).get("license") or "CC-BY-SA-4.0"
            credit = f"{auteurs[0] if auteurs else 'contributeur'} · Panoramax · {licence}"
            return {"url": url, "credit": credit}
    return None


def traiter(ligne: dict) -> dict:
    try:
        trouve = chercher(ligne["lat"], ligne["lng"])
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        return {**ligne, "photo": None, "motif": f"erreur ({type(e).__name__})"}
    return {**ligne, "photo": trouve, "motif": "ok" if trouve else "aucune photo"}


def candidats(conn: sqlite3.Connection, zone: str | None, limite: int | None,
              refaire: bool = False) -> list[dict]:
    """
    Restaurants géolocalisés sans photo affichable. Avec `refaire`, aussi ceux
    qui ont déjà une photo Panoramax — pour la remplacer après un changement
    de règle de sélection (jamais une photo du site ou du restaurateur).
    """
    sql = """
        SELECT id, name, lat, lng FROM restaurants
         WHERE lat IS NOT NULL AND lng IS NOT NULL
           AND (photo_url IS NULL OR trim(photo_url) = '' OR photo_url LIKE ?
    """ + (" OR photo_source = 'panoramax'" if refaire else "") + ")"
    params: list = [PHOTO_EXPIREE]
    if zone:
        sql += " AND zone = ?"
        params.append(zone)
    sql += " ORDER BY local_signal DESC NULLS LAST"
    if limite:
        sql += " LIMIT ?"
        params.append(limite)
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params)]


def main() -> None:
    analyseur = argparse.ArgumentParser(
        description="Photos de facade Panoramax pour les restaurants sans photo (D-067)."
    )
    analyseur.add_argument("--zone", default=None)
    analyseur.add_argument("--limite", type=int, default=None)
    analyseur.add_argument("--parallele", type=int, default=4,
                           help="requetes simultanees — service public, rester modeste")
    analyseur.add_argument("--a-blanc", action="store_true")
    analyseur.add_argument("--refaire", action="store_true",
                           help="reprend aussi les photos Panoramax deja posees")
    args = analyseur.parse_args()

    from backend.db.models import init_db
    init_db()  # garantit les colonnes photo_source / photo_credit

    conn = sqlite3.connect(config.DB_PATH)
    lignes = candidats(conn, args.zone, args.limite, refaire=args.refaire)
    print(f"[panoramax] {len(lignes)} restaurants sans photo affichable")
    if not lignes:
        return

    depart = time.monotonic()
    trouvees = 0
    motifs: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=args.parallele) as executeur:
        futurs = [executeur.submit(traiter, l) for l in lignes]
        for i, futur in enumerate(as_completed(futurs), 1):
            r = futur.result()
            motifs[r["motif"]] = motifs.get(r["motif"], 0) + 1
            if r["photo"]:
                trouvees += 1
                if not args.a_blanc:
                    conn.execute(
                        "UPDATE restaurants SET photo_url = ?, photo_source = 'panoramax',"
                        " photo_credit = ? WHERE id = ?",
                        (r["photo"]["url"], r["photo"]["credit"], r["id"]),
                    )
                if trouvees <= 5:
                    print(f"  ok {r['name'][:30]:32s} {r['photo']['credit']}")
            elif args.refaire and r["motif"] == "aucune photo" and not args.a_blanc:
                # Une photo Panoramax qui ne passe plus la règle est retirée :
                # l'illustration reprend sa place (seules les photos Panoramax
                # sont touchées, jamais celles du site ou du restaurateur).
                conn.execute(
                    "UPDATE restaurants SET photo_url = NULL, photo_source = NULL,"
                    " photo_credit = NULL WHERE id = ? AND photo_source = 'panoramax'",
                    (r["id"],),
                )
            if i % 500 == 0:
                if not args.a_blanc:
                    conn.commit()
                print(f"  ... {i}/{len(lignes)} — {trouvees} trouvees")

    if not args.a_blanc:
        conn.commit()
    conn.close()

    print()
    print("=" * 62 + (" (A BLANC — rien ecrit)" if args.a_blanc else ""))
    print(f"  candidats       : {len(lignes)}")
    print(f"  photos retenues : {trouvees}  ({100 * trouvees / len(lignes):.0f} %)")
    print(f"  duree           : {(time.monotonic() - depart) / 60:.1f} min")
    for motif, n in sorted(motifs.items(), key=lambda x: -x[1]):
        print(f"    {n:>5d}  {motif}")
    print("=" * 62)


if __name__ == "__main__":
    main()
