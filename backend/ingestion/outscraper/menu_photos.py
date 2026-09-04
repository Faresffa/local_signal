# backend/ingestion/outscraper/menu_photos.py
#
# RÉCOLTE DES PHOTOS DE CARTE, CATÉGORIE « MENU » (D-028).
#
# Voie B, et la meilleure des deux. La voie A (`menu_links.py`) rend une URL
# qu'il faut ensuite aller lire sur le site du restaurant — or chaque site est
# construit différemment : HTML, PDF, image, page rendue en JavaScript. Mesuré
# sur le Quartier latin, cette voie aboutit à 27 cartes sur 153 sites, soit
# 17,6 %. Le reste se perd dans la diversité des sites.
#
# Ici on prend le problème par l'autre bout : les clients photographient la
# carte, Google range ces photos sous un onglet « Menu », et Outscraper expose
# ce filtre via le paramètre `tag="menu"`. On obtient donc directement des
# images de carte, sans traverser le site du restaurant.
#
# C'est ce que l'API officielle de Google ne permet PAS : son objet `Photo` ne
# porte aucune catégorie — champs `name`, `widthPx`, `heightPx`,
# `authorAttributions`, `flagContentUri`, `googleMapsUri`, et rien d'autre.
# Vérifié dans sa documentation.
#
# CE QUI EST CONSERVÉ, ET CE QUI NE L'EST PAS. Les photos sont des œuvres de
# leurs auteurs. On les analyse puis on les JETTE : seules les observations
# dérivées entrent en base — cuisines, nombre de plats, langues, ratio
# vernaculaire. Aucune image n'est stockée, aucune n'est réaffichée. Même
# posture que D-021 et D-025.
#
# STATUT JURIDIQUE — voir l'en-tête de `menu_links.py`. Usage autorisé par le
# directeur de mémoire au titre d'un travail de recherche non commercial ; le
# module est isolé pour pouvoir disparaître quand le projet deviendra un
# produit.

import argparse
import os
import sqlite3
import sys
import time

from backend import config
from backend.core.scoring.geo_score import haversine

# Même contrôle d'appariement que pour les liens : une recherche par nom est
# ambiguë, et rattacher une carte au mauvais restaurant corromprait l'indicateur
# qui pèse 0,40.
RAYON_APPARIEMENT_M = 200

# Photos demandées par restaurant. Volontairement bas.
#
# Le quota gratuit d'Outscraper compte 500 PHOTOS par mois, indépendamment des
# 500 établissements. Demander 3 photos pour 468 restaurants dépasserait
# largement. Une seule photo de la catégorie « menu » suffit à lancer la
# lecture ; si elle est illisible, on relance ciblé sur les échecs plutôt que
# de payer d'avance pour tout le monde.
PHOTOS_PAR_RESTAURANT = 1

# 10 et pas davantage : au-dela de 10 requetes, le SDK bascule en mode
# asynchrone (`len(queries) > 10` dans `google_maps_photos`). Il sait attendre
# tout seul — il interroge l'archive toutes les 5 secondes pendant une heure —
# mais le mode synchrone reste plus previsible pour un premier essai, et une
# erreur y est immediatement lisible plutot que noyee dans une attente.
TAILLE_LOT = 10

# Garde-fou de facturation. Outscraper NE BLOQUE PAS au-delà du gratuit : sa
# documentation dit que « la tâche sera terminée » et qu'une facture suivra.
# Le filet est donc de notre côté.
PLAFOND_GRATUIT = 500
PLAFOND_DEFAUT = 450


def _client():
    """Client Outscraper. Clé par l'environnement uniquement (D-016)."""
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
    """Recherche identifiant le restaurant, la plus discriminante possible."""
    parties = [resto["name"]]
    if resto.get("address"):
        parties.append(resto["address"])
    elif resto.get("city"):
        parties.append(resto["city"])
    else:
        parties.append(f"{resto['lat']:.5f},{resto['lng']:.5f}")
    return ", ".join(parties)


def _urls_photos(bloc) -> list[str]:
    """
    Extrait les URL d'images de la réponse.

    La forme exacte varie selon les versions du service : parfois une liste de
    chaînes, parfois des objets portant `photo_url`, `image_url` ou `url`. On
    accepte les trois plutôt que de dépendre d'une forme précise qui changerait
    sans prévenir.
    """
    urls = []

    def visiter(x):
        if isinstance(x, str) and x.startswith("http"):
            urls.append(x)
        elif isinstance(x, dict):
            for cle in ("photo_url", "image_url", "url", "src"):
                v = x.get(cle)
                if isinstance(v, str) and v.startswith("http"):
                    urls.append(v)
                    return
            for v in x.values():
                visiter(v)
        elif isinstance(x, list):
            for v in x:
                visiter(v)

    visiter(bloc)
    # Dédoublonnage en conservant l'ordre : la première photo de la catégorie
    # est celle que Google juge la plus représentative.
    vues, uniques = set(), []
    for u in urls:
        if u not in vues:
            vues.add(u)
            uniques.append(u)
    return uniques


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
    Récupère l'URL d'une photo de carte par restaurant et la range dans
    `menu_url`, d'où le pipeline d'extraction la reprendra.

    N'interroge jamais un restaurant qui a déjà un `menu_url` : chaque requête
    consomme du quota.
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
    print(f"[Photos] {total} restaurants en base, {len(restos)} sans carte connue.")

    if len(restos) > plafond:
        raise RuntimeError(
            f"{len(restos)} restaurants a interroger, au-dela du plafond de {plafond}. "
            f"L'offre gratuite couvre {PLAFOND_GRATUIT} photos par mois, et Outscraper "
            f"NE BLOQUE PAS au-dela : il facture. Utilisez --limit, ou --max en "
            f"connaissance de cause."
        )

    if a_blanc:
        print(f"\n--- A BLANC : aucune requete, tag='menu', "
              f"{PHOTOS_PAR_RESTAURANT} photo(s) par restaurant ---")
        for r in restos[:15]:
            print(f"   {_requete(r)}")
        if len(restos) > 15:
            print(f"   ... et {len(restos) - 15} autres")
        return {"interroges": 0, "trouves": 0, "a_blanc": True}

    if not restos:
        return {"interroges": 0, "trouves": 0}

    client = _client()
    trouves = sans_photo = 0
    curseur = conn.cursor()

    for debut in range(0, len(restos), TAILLE_LOT):
        lot = restos[debut:debut + TAILLE_LOT]
        print(f"\n[Photos] Lot {debut // TAILLE_LOT + 1} — {len(lot)} restaurants...")

        try:
            # `tag="menu"` est la clé de toute cette voie : Google range sous cet
            # onglet les photos que son propre modele identifie comme des cartes.
            # C'est ce filtre que l'API officielle de Google n'expose pas.
            reponses = client.google_maps_photos(
                [_requete(r) for r in lot],
                photosLimit=PHOTOS_PAR_RESTAURANT,
                limit=1,
                tag="menu",
                language=langue,
                region=region,
            )
        except Exception as e:
            print(f"   [ERREUR] {type(e).__name__}: {e}")
            print("   Lot abandonne, on poursuit.")
            continue

        for resto, bloc in zip(lot, reponses):
            urls = _urls_photos(bloc)
            if not urls:
                sans_photo += 1
                continue

            curseur.execute(
                "UPDATE restaurants SET menu_url = ? WHERE id = ?",
                (urls[0], resto["id"]),
            )
            trouves += 1
            print(f"   [OK] {resto['name'][:32]:34s} -> {urls[0][:54]}")

        conn.commit()
        if debut + TAILLE_LOT < len(restos):
            time.sleep(1.0)

    return {"interroges": len(restos), "trouves": trouves, "sans_photo": sans_photo}


def main():
    parser = argparse.ArgumentParser(
        description="Recolte les photos de carte (tag 'menu') via Outscraper (D-028).",
    )
    parser.add_argument("--zone", default=None)
    parser.add_argument("--limit", type=int, default=None,
                        help="nombre maximal de restaurants interroges")
    parser.add_argument("--dry-run", action="store_true",
                        help="affiche les requetes sans rien envoyer")
    parser.add_argument("--max", type=int, default=PLAFOND_DEFAUT,
                        help=f"plafond de securite (defaut {PLAFOND_DEFAUT})")
    parser.add_argument("--language", default="fr")
    parser.add_argument("--region", default="FR")
    args = parser.parse_args()

    conn = sqlite3.connect(config.DB_PATH)
    try:
        res = recolter(conn, zone=args.zone, limite=args.limit, a_blanc=args.dry_run,
                       langue=args.language, region=args.region, plafond=args.max)
    except RuntimeError as e:
        print(f"\n[ERREUR] {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    if res.get("a_blanc"):
        return

    print(f"\n{'='*64}")
    print(f"  interroges          : {res['interroges']}")
    print(f"  photos de carte     : {res['trouves']}")
    print(f"  sans photo 'menu'   : {res.get('sans_photo', 0)}")
    print(f"{'='*64}")
    print("\nEtape suivante — lire ces images :")
    print("  python -m backend.ingestion.menu_scan.harvest")


if __name__ == "__main__":
    main()
