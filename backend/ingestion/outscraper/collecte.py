# backend/ingestion/outscraper/collecte.py
#
# COLLECTE COMPLÈTE EN UN SEUL PASSAGE (D-028, D-029, D-030).
#
# Un seul point d'entrée qui enchaîne les deux appels et l'import :
#
#     fiches   →  google_maps_search   →  JSON brut  →  importeur  →  base
#     photos   →  google_maps_photos   →  JSON brut  →  importeur  →  base
#                    (tag="menu")
#
# POURQUOI LA RÉPONSE BRUTE EST ÉCRITE SUR DISQUE AVANT L'IMPORT.
# Chaque appel consomme du quota, donc de l'argent. Si la logique d'import doit
# être corrigée plus tard — et elle l'a déjà été, une réponse réelle ayant
# révélé que `working_hours` arrive en dictionnaire et `reservation_links` en
# liste — on réimporte le fichier sans repayer. Une requête facturée ne doit
# jamais être perdue parce qu'un parseur avait un défaut.
#
# C'est aussi ce qui rend la collecte auditable : le fichier brut est la preuve
# de ce que le fournisseur a réellement renvoyé, indépendamment de ce que notre
# code en a fait.
#
# RECHERCHES INDIVIDUELLES, UNE PAR RESTAURANT. C'est la condition pour que
# `menu_link` soit renseigné : une recherche groupée le laisse à `null`, ce que
# confirment les exemples de la documentation du fournisseur.

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

from backend import config
from backend.ingestion.external.importer import importer

# Garde-fou de facturation. Le fournisseur NE BLOQUE PAS au-delà de son offre
# gratuite : sa documentation annonce que « la tâche sera terminée » et qu'une
# facture suivra. Le filet est donc de notre côté.
QUOTA_GRATUIT = 500
PLAFOND_DEFAUT = 450

# Taille des lots. Au-delà de 10 requêtes, le SDK bascule en mode asynchrone :
# il sait attendre seul, mais une erreur y est moins lisible.
TAILLE_LOT = 10

# Photos demandées par restaurant.
#
# CINQ, sur le jugement terrain de l'utilisateur : la plupart des cartes tiennent
# en cinq clichés ou moins, et les cas comme Amarvi — douze pages téléversées par
# le restaurateur — sont rares. En demander quinze pour n'en analyser que cinq
# quadruplerait la dépense sans gain sur la majorité des restaurants.
#
# LE RISQUE ASSUMÉ, et le garde-fou qui va avec : à cinq, on ne sait pas si le
# restaurant en avait davantage. Un retour de EXACTEMENT cinq photos est donc
# marqué comme possiblement tronqué (`photos_saturees`), ce qui abaissera la
# confiance de l'indicateur menu au lieu de laisser passer un comptage partiel
# en silence. Une carte tronquée donne un `dish_count` trop bas, donc un score
# trop favorable (D-031).
PHOTOS_DEFAUT = 5


def _client():
    """Client du fournisseur. Clé par l'environnement uniquement (D-016)."""
    cle = os.environ.get("OUTSCRAPER_API_KEY", "").strip()
    if not cle:
        raise RuntimeError(
            "OUTSCRAPER_API_KEY absente de l'environnement. "
            "Ajoutez-la dans .env (non versionné) avant de lancer."
        )
    try:
        from outscraper import ApiClient
    except ImportError as e:
        raise RuntimeError("Paquet `outscraper` absent : pip install outscraper") from e
    return ApiClient(api_key=cle)


def _requete(resto: dict) -> str:
    """
    Formule identifiant un restaurant sans ambiguïté.

    L'adresse lève l'essentiel des homonymes ; à défaut la ville, puis les
    coordonnées, toujours présentes. « Paris, France » est ajouté quand rien
    n'y renvoie, pour éviter qu'une recherche parte à l'autre bout du monde.
    """
    parties = [resto["name"]]
    if resto.get("address"):
        parties.append(resto["address"])
    elif resto.get("city"):
        parties.append(resto["city"])
    else:
        parties.append(f"{resto['lat']:.5f},{resto['lng']:.5f}")
    texte = ", ".join(parties)
    if "Paris" not in texte:
        texte += ", Paris, France"
    return texte


def _cibles(conn: sqlite3.Connection, zone: str, limite: int, colonne_temoin: str):
    """
    Restaurants à interroger : ceux dont la colonne témoin est encore vide.

    On ne réinterroge jamais un restaurant déjà renseigné — chaque requête
    coûte du quota, et une donnée acquise n'a pas à être rachetée.
    """
    conn.row_factory = sqlite3.Row
    sql = (
        f"SELECT id, name, address, city, lat, lng FROM restaurants "
        f"WHERE (\"{colonne_temoin}\" IS NULL OR trim(cast(\"{colonne_temoin}\" as text)) = '')"
    )
    params = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)
    sql += " ORDER BY name"
    if limite:
        sql += " LIMIT ?"
        params.append(limite)
    return [dict(r) for r in conn.execute(sql, params)]


def _appeler_par_lots(client, restos, appel, etiquette):
    """
    Découpe en lots, appelle, et rassemble les enregistrements bruts.

    Un lot qui échoue n'interrompt pas la collecte : on le signale et on passe
    au suivant. Perdre dix restaurants ne doit pas coûter les quatre cent
    cinquante-huit autres.
    """
    brut = []
    for debut in range(0, len(restos), TAILLE_LOT):
        lot = restos[debut:debut + TAILLE_LOT]
        numero = debut // TAILLE_LOT + 1
        total = (len(restos) + TAILLE_LOT - 1) // TAILLE_LOT
        print(f"[{etiquette}] Lot {numero}/{total} — {len(lot)} requetes...", flush=True)

        try:
            reponses = appel([_requete(r) for r in lot])
        except Exception as e:
            print(f"   [ERREUR] {type(e).__name__}: {e}")
            continue

        # La réponse est une liste de blocs, un par requête. Chaque bloc peut
        # contenir zéro ou plusieurs lieux ; on les aplatit.
        for bloc in reponses or []:
            if isinstance(bloc, dict):
                brut.append(bloc)
            elif isinstance(bloc, list):
                brut.extend(x for x in bloc if isinstance(x, dict))

        if debut + TAILLE_LOT < len(restos):
            time.sleep(1.0)

    return brut


def collecter(
    zone: str = "quartier-latin",
    limite: int = None,
    plafond: int = PLAFOND_DEFAUT,
    photos: int = PHOTOS_DEFAUT,
    sans_photos: bool = False,
    langue: str = "fr",
    region: str = "FR",
    dossier: Path = None,
) -> dict:
    """
    Enchaîne fiches, photos et import. Écrit les réponses brutes sur disque.
    """
    dossier = dossier or Path("data/collecte")
    dossier.mkdir(parents=True, exist_ok=True)
    horodatage = datetime.now().strftime("%Y%m%d-%H%M%S")

    conn = sqlite3.connect(config.DB_PATH)
    resultats = {}

    try:
        # --- Passe 1 : les fiches -------------------------------------------
        # Témoin `external_at` : un restaurant déjà enrichi n'est pas réinterrogé.
        cibles = _cibles(conn, zone, limite, "external_at")
        print(f"\n[Fiches] {len(cibles)} restaurants a interroger dans '{zone}'.")

        if len(cibles) > plafond:
            raise RuntimeError(
                f"{len(cibles)} requetes, au-dela du plafond de {plafond}. "
                f"L'offre gratuite couvre {QUOTA_GRATUIT} elements par mois et le "
                f"fournisseur NE BLOQUE PAS au-dela : il facture. "
                f"Utilisez --limit, ou --max en connaissance de cause."
            )

        if cibles:
            client = _client()
            brut = _appeler_par_lots(
                client, cibles,
                lambda qs: client.google_maps_search(
                    qs, limit=1, language=langue, region=region),
                "Fiches",
            )

            fichier = dossier / f"fiches-{zone}-{horodatage}.json"
            fichier.write_text(json.dumps(brut, ensure_ascii=False, indent=1),
                               encoding="utf-8")
            print(f"[Fiches] {len(brut)} enregistrements -> {fichier}")

            resultats["fiches"] = importer(conn, fichier, zone=zone,
                                           source="outscraper-search")

        # --- Passe 2 : les photos de carte ----------------------------------
        if not sans_photos:
            cibles_p = _cibles(conn, zone, limite, "menu_photo_urls")
            print(f"\n[Photos] {len(cibles_p)} restaurants sans photo de carte.")

            if len(cibles_p) > plafond:
                print(f"[Photos] Au-dela du plafond de {plafond} : passe ignoree. "
                      f"Relancez avec --limit.")
            elif cibles_p:
                client = _client()
                brut_p = _appeler_par_lots(
                    client, cibles_p,
                    lambda qs: client.google_maps_photos(
                        qs, photosLimit=photos, limit=1, tag="menu",
                        language=langue, region=region),
                    "Photos",
                )

                fichier_p = dossier / f"photos-{zone}-{horodatage}.json"
                fichier_p.write_text(json.dumps(brut_p, ensure_ascii=False, indent=1),
                                     encoding="utf-8")
                print(f"[Photos] {len(brut_p)} enregistrements -> {fichier_p}")

                resultats["photos"] = importer(conn, fichier_p, zone=zone,
                                               source="outscraper-photos")
    finally:
        conn.close()

    return resultats


def _bilan(conn_path: str, zone: str):
    """Ce que la base contient après collecte — la seule mesure qui compte."""
    c = sqlite3.connect(conn_path)
    q = lambda w: c.execute(
        f"SELECT count(*) FROM restaurants WHERE zone=? AND {w}", (zone,)).fetchone()[0]
    total = c.execute("SELECT count(*) FROM restaurants WHERE zone=?", (zone,)).fetchone()[0]

    print(f"\n{'='*64}")
    print(f"  ETAT DE LA BASE — zone '{zone}' ({total} restaurants)")
    print(f"{'='*64}")
    for libelle, condition in [
        ("enrichis", "external_at IS NOT NULL"),
        ("avec lien de carte", "coalesce(trim(menu_url),'') <> ''"),
        ("avec photo de carte", "menu_photo_urls IS NOT NULL"),
        ("avec lien de reservation", "reservation_url IS NOT NULL"),
        ("marques « Tourists »", "tourist_flag = 1"),
        ("marques non touristiques", "tourist_flag = 0"),
    ]:
        n = q(condition)
        print(f"  {libelle:28s} {n:5d}  ({100*n/total:5.1f}%)")
    c.close()


def main():
    parser = argparse.ArgumentParser(
        description="Collecte fiches + photos de carte et importe en base (D-028).",
    )
    parser.add_argument("--zone", default="quartier-latin")
    parser.add_argument("--limit", type=int, default=None,
                        help="nombre maximal de restaurants interroges — borne la depense")
    parser.add_argument("--max", type=int, default=PLAFOND_DEFAUT,
                        help=f"plafond de securite (defaut {PLAFOND_DEFAUT}, quota gratuit {QUOTA_GRATUIT})")
    parser.add_argument("--photos", type=int, default=PHOTOS_DEFAUT,
                        help=f"photos de carte par restaurant (defaut {PHOTOS_DEFAUT})")
    parser.add_argument("--sans-photos", action="store_true",
                        help="ne faire que la passe des fiches")
    args = parser.parse_args()

    try:
        res = collecter(zone=args.zone, limite=args.limit, plafond=args.max,
                        photos=args.photos, sans_photos=args.sans_photos)
    except RuntimeError as e:
        print(f"\n[ERREUR] {e}", file=sys.stderr)
        sys.exit(1)

    for passe, r in res.items():
        print(f"\n[{passe}] lus={r['lus']} apparies={r['apparies']} "
              f"rejetes={r['rejetes']} photos={r['avec_photos']} menus={r['avec_menu']}")

    _bilan(config.DB_PATH, args.zone)
    print("\nEtape suivante — lire les cartes recoltees :")
    print("  python -m backend.ingestion.menu_scan.harvest")


if __name__ == "__main__":
    main()
