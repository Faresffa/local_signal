# backend/ingestion/outscraper/menu_links.py
#
# RÉCOLTE DES LIENS DE CARTE VIA OUTSCRAPER (D-028).
#
# Ce module ne récupère QUE des URL — jamais du contenu Google. L'URL obtenue
# est celle du site du restaurant lui-même (souvent un CDN : Webflow, Wix,
# Squarespace). C'est ce lien qui alimente ensuite le récolteur web existant
# (`backend/ingestion/web/`), lequel va chercher la carte à la source.
#
# POURQUOI CE DÉTOUR. L'API Places officielle de Google n'expose AUCUN champ
# menu, et ses objets `Photo` ne portent aucune catégorie : impossible de
# demander « la photo de la carte ». Vérifié dans la documentation officielle.
# Le tag OpenStreetMap `website:menu` est importé depuis D-023 et donne 0/468
# sur le Quartier latin. Il ne restait donc aucune voie directe.
#
# STATUT JURIDIQUE — à lire avant toute réutilisation. Outscraper obtient ce
# champ en moissonnant l'interface Google Maps, ce que les CGU de Google
# interdisent. L'usage a été explicitement autorisé par le directeur de mémoire
# le 2 septembre 2026, au motif d'un travail de recherche sans finalité
# commerciale.
#
# CE MODULE EST DONC ISOLÉ À DESSEIN. Le projet est destiné à être poursuivi
# comme produit (CLAUDE.md §1) et l'argument non commercial tombera à ce
# moment-là. Tout ce qui dépend d'Outscraper vit ici et nulle part ailleurs :
# le jour où il faut le retirer, on supprime ce fichier et le reste du pipeline
# continue de fonctionner sur les liens déjà en base et sur le tag OSM.

import argparse
import os
import sqlite3
import sys
import time

from backend import config
from backend.core.scoring.geo_score import haversine

# Distance maximale entre le restaurant que nous connaissons et celui que
# renvoie la recherche. Une recherche par nom est ambiguë — « Le Cèdre » existe
# dans plusieurs villes — et rattacher une carte au mauvais établissement
# corromprait le signal le plus lourd de la formule (menu, 0,40). Mieux vaut
# jeter un lien douteux que polluer la base.
RAYON_APPARIEMENT_M = 200

# Nombre de requêtes envoyées en un appel. Chaque élément de la liste est une
# recherche INDÉPENDANTE : c'est la condition pour que `menu_link` soit renvoyé.
# Une recherche générale (« restaurants Paris ») ne le fournit pas.
TAILLE_LOT = 25

# PLAFOND DUR — garde-fou de facturation.
#
# Outscraper NE BLOQUE PAS au-dela de l'offre gratuite : selon leur propre
# documentation, « la tache sera terminee, et si l'usage depasse vos credits,
# vous recevrez simplement une facture ». Il n'y a donc aucun filet de leur
# cote. Celui-ci est le notre.
#
# 450 laisse 50 requetes de marge sous les 500 gratuits mensuels : de quoi
# absorber un essai rate ou un lot relance sans jamais toucher la facturation.
PLAFOND_GRATUIT = 500
PLAFOND_DEFAUT = 450


def _client():
    """
    Client Outscraper.

    La clé vient de l'environnement uniquement (D-016) : `config.py` est
    versionné et ne doit jamais porter de secret.
    """
    cle = os.environ.get("OUTSCRAPER_API_KEY", "").strip()
    if not cle:
        raise RuntimeError(
            "OUTSCRAPER_API_KEY absente de l'environnement.\n"
            "Ajoutez-la dans .env (non versionné) ou exportez-la avant de lancer."
        )

    try:
        from outscraper import ApiClient
    except ImportError as e:
        raise RuntimeError(
            "Le paquet `outscraper` n'est pas installé : pip install outscraper"
        ) from e

    return ApiClient(api_key=cle)


def _requete(resto: dict) -> str:
    """
    Formule la recherche pour un restaurant.

    Le nom seul est trop ambigu. L'adresse, quand OSM la connaît, lève
    l'essentiel des homonymes ; à défaut on retombe sur la ville, puis sur les
    coordonnées, qui sont toujours présentes.
    """
    parties = [resto["name"]]
    if resto.get("address"):
        parties.append(resto["address"])
    elif resto.get("city"):
        parties.append(resto["city"])
    else:
        parties.append(f"{resto['lat']:.5f},{resto['lng']:.5f}")
    return ", ".join(parties)


def _apparie(resto: dict, place: dict) -> tuple[bool, float]:
    """
    Le lieu renvoyé est-il bien notre restaurant ?

    Contrôle par la distance, et non par le nom : les graphies divergent
    (« Le Cèdre » / « Restaurant Le Cedre ») alors que les coordonnées, elles,
    ne mentent pas.

    Returns:
        (accepté, distance en mètres). Distance infinie si le lieu ne porte
        aucune coordonnée exploitable.
    """
    try:
        lat = float(place.get("latitude"))
        lng = float(place.get("longitude"))
    except (TypeError, ValueError):
        return False, float("inf")

    d = haversine(resto["lat"], resto["lng"], lat, lng)
    return d <= RAYON_APPARIEMENT_M, d


def recolter(
    conn: sqlite3.Connection,
    zone: str = None,
    limite: int = None,
    a_blanc: bool = False,
    langue: str = "fr",
    region: str = "FR",
    plafond: int = PLAFOND_DEFAUT,
) -> dict:
    """
    Récolte les liens de carte des restaurants qui n'en ont pas encore.

    N'interroge JAMAIS un restaurant dont `menu_url` est déjà renseigné : chaque
    requête est facturée, et un lien déjà connu n'a pas besoin d'être racheté.

    Args:
        limite: nombre maximal de restaurants interrogés. Sert à borner la
            dépense pendant les essais.
        a_blanc: n'appelle rien, affiche seulement ce qui serait demandé.

    Returns:
        Compteurs de l'exécution.
    """
    conn.row_factory = sqlite3.Row

    sql = """
        SELECT id, name, address, city, lat, lng
          FROM restaurants
         WHERE (menu_url IS NULL OR trim(menu_url) = '')
    """
    params = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)
    sql += " ORDER BY name"
    if limite:
        sql += " LIMIT ?"
        params.append(limite)

    restos = [dict(r) for r in conn.execute(sql, params)]

    total = conn.execute("SELECT count(*) FROM restaurants").fetchone()[0]
    deja = conn.execute(
        "SELECT count(*) FROM restaurants WHERE menu_url IS NOT NULL AND trim(menu_url) <> ''"
    ).fetchone()[0]

    print(f"[Outscraper] {total} restaurants en base, {deja} ont deja un lien de carte.")
    print(f"[Outscraper] {len(restos)} a interroger.")

    # Garde-fou de facturation, appliqué AVANT tout appel.
    if len(restos) > plafond:
        raise RuntimeError(
            f"{len(restos)} restaurants à interroger, au-delà du plafond de {plafond}. "
            f"L'offre gratuite couvre {PLAFOND_GRATUIT} établissements par mois, et "
            f"Outscraper NE BLOQUE PAS au-delà : il facture. "
            f"Relancez avec --limit pour borner, ou --max pour relever le plafond "
            f"en connaissance de cause."
        )

    if a_blanc:
        print("\n--- A BLANC : aucune requete envoyee ---")
        for r in restos[:15]:
            print(f"   {_requete(r)}")
        if len(restos) > 15:
            print(f"   ... et {len(restos) - 15} autres")
        return {"interroges": 0, "trouves": 0, "rejetes": 0, "a_blanc": True}

    if not restos:
        return {"interroges": 0, "trouves": 0, "rejetes": 0}

    client = _client()
    trouves = rejetes = sans_lien = 0
    curseur = conn.cursor()

    for debut in range(0, len(restos), TAILLE_LOT):
        lot = restos[debut:debut + TAILLE_LOT]
        requetes = [_requete(r) for r in lot]

        print(f"\n[Outscraper] Lot {debut // TAILLE_LOT + 1} — {len(lot)} requetes...")

        try:
            # `limit=1` : on ne veut que la meilleure correspondance de chaque
            # recherche. Demander plus multiplierait le cout sans rien apporter,
            # puisque l'appariement se fait ensuite sur la distance.
            reponses = client.google_maps_search(
                requetes, limit=1, language=langue, region=region
            )
        except Exception as e:
            print(f"   [ERREUR] {type(e).__name__}: {e}")
            print("   Lot abandonne, on poursuit avec le suivant.")
            continue

        for resto, resultats in zip(lot, reponses):
            if not resultats:
                sans_lien += 1
                continue

            place = resultats[0]
            ok, distance = _apparie(resto, place)

            if not ok:
                rejetes += 1
                print(f"   [REJET] {resto['name'][:34]:34s} a {distance:.0f} m — "
                      f"trouve « {str(place.get('name'))[:28]} »")
                continue

            lien = (place.get("menu_link") or "").strip()
            if not lien:
                sans_lien += 1
                continue

            curseur.execute(
                "UPDATE restaurants SET menu_url = ? WHERE id = ?",
                (lien, resto["id"]),
            )
            trouves += 1
            print(f"   [OK]    {resto['name'][:34]:34s} ({distance:3.0f} m) -> {lien[:52]}")

        conn.commit()

        # Politesse envers le service, et marge sur ses limites de debit.
        if debut + TAILLE_LOT < len(restos):
            time.sleep(1.0)

    return {
        "interroges": len(restos),
        "trouves": trouves,
        "rejetes": rejetes,
        "sans_lien": sans_lien,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Recolte les liens de carte via Outscraper (D-028).",
    )
    parser.add_argument("--zone", default=None, help="limiter a une zone")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="nombre maximal de restaurants interroges — borne la depense",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="affiche les requetes sans rien envoyer ni facturer",
    )
    parser.add_argument(
        "--max", type=int, default=PLAFOND_DEFAUT,
        help=f"plafond de securite (defaut {PLAFOND_DEFAUT}, offre gratuite {PLAFOND_GRATUIT}/mois)",
    )
    parser.add_argument("--language", default="fr")
    parser.add_argument("--region", default="FR")
    args = parser.parse_args()

    conn = sqlite3.connect(config.DB_PATH)
    try:
        res = recolter(
            conn,
            zone=args.zone,
            limite=args.limit,
            a_blanc=args.dry_run,
            langue=args.language,
            region=args.region,
            plafond=args.max,
        )
    except RuntimeError as e:
        print(f"\n[ERREUR] {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    if res.get("a_blanc"):
        return

    print(f"\n{'='*66}")
    print(f"  interroges : {res['interroges']}")
    print(f"  liens trouves : {res['trouves']}")
    print(f"  rejetes (mauvais lieu) : {res['rejetes']}")
    print(f"  sans lien de carte : {res.get('sans_lien', 0)}")
    print(f"{'='*66}")
    print("\nEtape suivante — aller chercher les cartes a ces adresses :")
    print("  python -m backend.ingestion.web.harvest_web")


if __name__ == "__main__":
    main()
