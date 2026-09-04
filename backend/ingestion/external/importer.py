# backend/ingestion/external/importer.py
#
# IMPORT D'UN JEU DE DONNÉES EXTERNE (D-029).
#
# Ce module avale un fichier CSV ou JSON produit par n'importe quel collecteur
# — Outscraper, un outil libre lancé par l'utilisateur, un export manuel — et
# range son contenu dans la base en le rattachant aux restaurants déjà connus
# d'OpenStreetMap.
#
# POURQUOI IL EST AGNOSTIQUE À LA SOURCE. Le projet a essayé plusieurs voies
# pour obtenir les cartes (D-023, D-025, D-028) et aucune n'a suffi seule. Plutôt
# que d'écrire un importeur par fournisseur, on définit ici UN contrat d'entrée :
# des colonnes attendues, des synonymes tolérés, et un appariement géographique.
# Changer de collecteur ne demande alors aucune modification de code.
#
# CE QU'IL NE FAIT PAS. Il ne collecte rien. Il n'interroge aucun service. Il lit
# un fichier que quelqu'un d'autre a produit. La collecte et l'import sont deux
# responsabilités distinctes, et les garder séparées permet de tracer l'origine
# de chaque donnée — exigence de traçabilité du mémoire.
#
# APPARIEMENT PAR LA DISTANCE, JAMAIS PAR LE NOM SEUL. « Alliance » existe deux
# fois dans la base, à deux adresses. Rattacher une carte au mauvais restaurant
# corromprait l'indicateur qui pèse 0,40 dans la formule. Un enregistrement dont
# la position ne correspond à aucun restaurant connu est REJETÉ, pas deviné.

import argparse
import csv
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from backend import config
from backend.core.scoring.geo_score import haversine

# Distance maximale entre le restaurant connu et l'enregistrement importé.
# 150 m : assez large pour absorber l'imprécision d'un géocodage, assez étroit
# pour ne pas confondre deux établissements d'une même rue.
RAYON_APPARIEMENT_M = 150

# Synonymes tolérés pour chaque champ. Les collecteurs ne nomment pas leurs
# colonnes de la même façon ; plutôt que d'imposer un format, on reconnaît les
# appellations courantes. La première trouvée gagne.
CHAMPS = {
    "name": ["name", "title", "nom", "business_name", "place_name"],
    "lat": ["lat", "latitude", "y"],
    "lng": ["lng", "lon", "longitude", "x"],
    "phone": ["phone", "phone_number", "telephone", "tel"],
    "website": ["site", "website", "web", "url"],
    "address": ["full_address", "address", "adresse", "street_address", "street"],
    # `working_hours_old_format` D'ABORD : c'est une chaine lisible. Le champ
    # `working_hours`, lui, arrive en dictionnaire jour par jour et serait stocke
    # comme une representation Python illisible.
    "opening_hours": ["working_hours_old_format", "opening_hours", "hours",
                      "horaires", "working_hours"],
    # « reservation_links » au pluriel et « booking_appointment_link » sont les
    # appellations reelles verifiees dans la sortie d'Outscraper.
    "reservation_url": ["booking_appointment_link", "reservation_links",
                        "reservation_url", "reservations_link", "booking_link",
                        "reserve_url"],
    "rating": ["rating", "note", "average_rating", "stars"],
    "review_count": ["reviews", "review_count", "reviews_count", "user_ratings_total"],
    "menu_url": ["menu_link", "menu_url", "menu"],
    "google_place_id": ["place_id", "google_id", "google_place_id", "cid"],
    # `photos_data` est le nom reel du champ. Surtout PAS « photo » : ce champ-la
    # porte la photo principale de l'etablissement, qui n'est pas une carte.
    "menu_photo_urls": ["photos_data", "menu_photos", "photos_menu",
                        "menu_photo_urls", "photos"],
    # Fourchette de prix affichee par Google (« $ » a « $$$$ »). Notre colonne
    # `price` est vide sur 100 % des restaurants : OpenStreetMap n'expose aucun
    # prix. Ceci ne le remplace pas — c'est une fourchette, pas un montant —
    # mais c'est le seul indice de prix disponible sans lire une carte.
    "price_range": ["range", "price_range", "price_level"],
    "photos_count": ["photos_count", "photo_count"],
}

# Nombre de photos de carte conservées par restaurant. Au-delà, on n'apprend
# plus rien : une carte tient en quelques clichés, et chaque image supplémentaire
# coûte un appel au modèle de vision lors de l'extraction.
MAX_PHOTOS = 5


def _valeur(ligne: dict, champ: str):
    """Lit un champ en essayant ses synonymes, insensible à la casse."""
    minuscules = {k.lower().strip(): v for k, v in ligne.items() if k}
    for cle in CHAMPS[champ]:
        v = minuscules.get(cle)
        if v in (None, "", "null", "None", [], {}):
            continue
        # Une liste (ex: `reservation_links`) : on garde le premier element.
        if isinstance(v, list):
            return v[0] if v else None
        # Un dictionnaire n'a rien a faire dans une colonne texte : on le
        # serialise en JSON plutot que d'y ecrire une repr Python.
        if isinstance(v, dict):
            return json.dumps(v, ensure_ascii=False)
        return v
    return None


def _tourist_flag(ligne: dict):
    """
    Lit `about.Crowd.Tourists` — Google indique lui-meme si un lieu attire une
    clientele touristique.

    HORS SCORING, et ce n'est pas negociable. S'en servir comme entree du calcul
    serait circulaire : on utiliserait le jugement de Google pour predire ce que
    le projet pretend mesurer independamment. En revanche c'est une VALIDATION
    EXTERNE de premier ordre — si le Local Signal note plus bas les restaurants
    que Google marque « Tourists », c'est une confirmation qui ne depend d'aucun
    label humain. Voir D-030.

    Returns:
        1, 0, ou None si l'information est absente.
    """
    about = ligne.get("about") or ligne.get("About")
    if isinstance(about, str):
        try:
            about = json.loads(about)
        except json.JSONDecodeError:
            return None
    if not isinstance(about, dict):
        return None
    # Les cles d'`about` sont rendues DANS LA LANGUE DEMANDEE : en francais,
    # « Crowd » devient « Clientele » et « Tourists » devient « Touristes ».
    # Mesure sur un vrai retour : 6 restaurants sur 10 portaient « Touristes ».
    foule = None
    for cle in ("Clientèle", "Clientele", "Crowd", "crowd"):
        v = about.get(cle)
        if isinstance(v, dict):
            foule = v
            break
    if foule is None:
        return None

    for cle in ("Touristes", "Tourists", "touristes", "tourists"):
        if cle in foule:
            return int(bool(foule[cle]))

    # La clientele est decrite MAIS les touristes n'y figurent pas : c'est une
    # information, pas une absence. Un lieu decrit comme « Etudiants, Groupes »
    # sans « Touristes » est bien signale comme non touristique.
    return 0


def _photos(brut) -> list[str]:
    """
    Normalise le champ photos, qui arrive sous des formes très variables :
    liste JSON, chaîne séparée par des virgules, ou liste d'objets.
    """
    if brut is None:
        return []
    if isinstance(brut, str):
        brut = brut.strip()
        if brut.startswith("["):
            try:
                brut = json.loads(brut)
            except json.JSONDecodeError:
                brut = [p.strip() for p in brut.split(",")]
        else:
            brut = [p.strip() for p in brut.split(",")]

    urls = []
    for element in brut if isinstance(brut, list) else [brut]:
        if isinstance(element, str) and element.startswith("http"):
            urls.append(element)
            continue
        if not isinstance(element, dict):
            continue

        # On VERIFIE l'etiquette plutot que de faire confiance au filtre de la
        # requete. Une photo qui n'est pas une carte gaspillerait un appel au
        # modele de vision et pourrait polluer l'indicateur qui pese 0,40.
        tags = element.get("photo_tags")
        if isinstance(tags, list) and tags:
            if not any("menu" in str(x).lower() for x in tags):
                continue

        # `photo_url_big` d'abord : une carte se lit d'autant mieux que la
        # resolution est haute, et la vision est facturee a l'appel, pas au pixel.
        for cle in ("photo_url_big", "original_photo_url", "photo_url",
                    "image_url", "url", "src"):
            v = element.get(cle)
            if isinstance(v, str) and v.startswith("http"):
                urls.append(v)
                break
    return urls[:MAX_PHOTOS]


def _lire(chemin: Path) -> list[dict]:
    """Lit un CSV ou un JSON, sans imposer de structure au-delà du plat."""
    texte = chemin.read_text(encoding="utf-8-sig")

    if chemin.suffix.lower() == ".json":
        donnees = json.loads(texte)
        # Un export encapsule souvent les lignes sous une cle : on descend
        # jusqu'a trouver la premiere liste d'objets.
        while isinstance(donnees, dict):
            listes = [v for v in donnees.values() if isinstance(v, list)]
            if not listes:
                return []
            donnees = listes[0]
        # Certains collecteurs rendent une liste de listes (un bloc par requete).
        if donnees and isinstance(donnees[0], list):
            donnees = [x for bloc in donnees for x in bloc]
        return [d for d in donnees if isinstance(d, dict)]

    return list(csv.DictReader(texte.splitlines()))


def importer(
    conn: sqlite3.Connection,
    chemin: Path,
    zone: str = None,
    source: str = None,
    a_blanc: bool = False,
) -> dict:
    """
    Rattache chaque ligne du fichier à un restaurant connu, puis enrichit.

    N'ÉCRASE JAMAIS un fait OpenStreetMap existant. Les champs OSM ne sont
    complétés que s'ils sont vides ; les champs d'enrichissement (note, avis,
    photos, réservation) sont propres à cette voie et toujours remplacés.
    """
    conn.row_factory = sqlite3.Row

    sql = "SELECT id, name, lat, lng FROM restaurants"
    params = []
    if zone:
        sql += " WHERE zone = ?"
        params.append(zone)
    connus = [dict(r) for r in conn.execute(sql, params)]

    lignes = _lire(chemin)
    print(f"[Import] {len(lignes)} enregistrements lus depuis {chemin.name}")
    print(f"[Import] {len(connus)} restaurants connus" + (f" dans '{zone}'" if zone else ""))

    apparies = rejetes = sans_position = 0
    avec_photos = avec_menu = 0
    maintenant = datetime.now().isoformat(timespec="seconds")
    curseur = conn.cursor()

    for ligne in lignes:
        try:
            lat = float(_valeur(ligne, "lat"))
            lng = float(_valeur(ligne, "lng"))
        except (TypeError, ValueError):
            sans_position += 1
            continue

        # Le plus proche l'emporte, sous reserve du rayon.
        meilleur, distance = None, float("inf")
        for r in connus:
            d = haversine(lat, lng, r["lat"], r["lng"])
            if d < distance:
                meilleur, distance = r, d

        if meilleur is None or distance > RAYON_APPARIEMENT_M:
            rejetes += 1
            continue

        photos = _photos(_valeur(ligne, "menu_photo_urls"))
        menu = _valeur(ligne, "menu_url")

        if a_blanc:
            apparies += 1
            if photos:
                avec_photos += 1
            if menu:
                avec_menu += 1
            if apparies <= 10:
                print(f"   {meilleur['name'][:30]:32s} ({distance:3.0f} m)  "
                      f"photos={len(photos)}  menu={'oui' if menu else 'non'}")
            continue

        # Les faits OSM ne sont COMPLÉTÉS que s'ils manquent — jamais écrasés.
        # Un import externe ne doit pas pouvoir dégrader une donnée vérifiée.
        curseur.execute("""
            UPDATE restaurants SET
                phone           = CASE WHEN coalesce(trim(phone),'')         = '' THEN ? ELSE phone END,
                website         = CASE WHEN coalesce(trim(website),'')       = '' THEN ? ELSE website END,
                address         = CASE WHEN coalesce(trim(address),'')       = '' THEN ? ELSE address END,
                opening_hours   = CASE WHEN coalesce(trim(opening_hours),'') = '' THEN ? ELSE opening_hours END,
                menu_url        = CASE WHEN coalesce(trim(menu_url),'')      = '' THEN ? ELSE menu_url END,
                google_place_id = coalesce(google_place_id, ?),
                reservation_url = ?,
                rating          = ?,
                review_count    = ?,
                menu_photo_urls = ?,
                price_range     = ?,
                photos_count    = ?,
                tourist_flag    = ?,
                external_source = ?,
                external_at     = ?
             WHERE id = ?
        """, (
            _valeur(ligne, "phone"),
            _valeur(ligne, "website"),
            _valeur(ligne, "address"),
            _valeur(ligne, "opening_hours"),
            menu,
            _valeur(ligne, "google_place_id"),
            _valeur(ligne, "reservation_url"),
            _valeur(ligne, "rating"),
            _valeur(ligne, "review_count"),
            json.dumps(photos, ensure_ascii=False) if photos else None,
            _valeur(ligne, "price_range"),
            _valeur(ligne, "photos_count"),
            _tourist_flag(ligne),
            source or chemin.stem,
            maintenant,
            meilleur["id"],
        ))

        apparies += 1
        if photos:
            avec_photos += 1
        if menu:
            avec_menu += 1

    if not a_blanc:
        conn.commit()

    return {
        "lus": len(lignes),
        "apparies": apparies,
        "rejetes": rejetes,
        "sans_position": sans_position,
        "avec_photos": avec_photos,
        "avec_menu": avec_menu,
        "a_blanc": a_blanc,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Importe un jeu de donnees externe (CSV ou JSON) dans la base (D-029).",
    )
    parser.add_argument("fichier", help="chemin du CSV ou JSON a importer")
    parser.add_argument("--zone", default=None, help="restreindre l'appariement a une zone")
    parser.add_argument("--source", default=None, help="nom du collecteur, pour l'audit")
    parser.add_argument("--dry-run", action="store_true",
                        help="montre ce qui serait importe sans rien ecrire")
    args = parser.parse_args()

    chemin = Path(args.fichier)
    if not chemin.exists():
        print(f"[ERREUR] Fichier introuvable : {chemin}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(config.DB_PATH)
    try:
        res = importer(conn, chemin, zone=args.zone, source=args.source,
                       a_blanc=args.dry_run)
    finally:
        conn.close()

    mode = " (A BLANC — rien ecrit)" if res["a_blanc"] else ""
    print(f"\n{'='*62}{mode}")
    print(f"  enregistrements lus     : {res['lus']}")
    print(f"  apparies a un restaurant: {res['apparies']}")
    print(f"  rejetes (hors rayon)    : {res['rejetes']}")
    print(f"  sans coordonnees        : {res['sans_position']}")
    print(f"  avec photos de carte    : {res['avec_photos']}")
    print(f"  avec lien de carte      : {res['avec_menu']}")
    print(f"{'='*62}")
    if not res["a_blanc"] and res["avec_photos"]:
        print("\nEtape suivante — lire les cartes recoltees :")
        print("  python -m backend.ingestion.menu_scan.harvest")


if __name__ == "__main__":
    main()
