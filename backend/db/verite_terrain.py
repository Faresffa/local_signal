# backend/db/verite_terrain.py
#
# CONSTITUTION DU JEU LABELLISÉ (LS-08).
#
# POURQUOI CE FICHIER EXISTE. Sans vérité terrain, les quatre pondérations du
# Local Signal sont posées à la main, et « pourquoi 0,30 ? » est la première
# question du jury (CLAUDE.md §10). Aucune autre tâche du projet ne débloque
# celle-ci : c'est le chemin critique.
#
# L'ÉCHANTILLON EST DÉJÀ TIRÉ, ET C'EST IMPORTANT. Les restaurants sont pris
# dans l'ordre `substr(hex(id), -6)` — le même que celui de la collecte d'avis
# (D-040). Trois conséquences :
#
#   1. L'ordre est ALÉATOIRE vis-à-vis du nombre d'avis, donc de la notoriété.
#      Trier par popularité aurait rempli l'échantillon de restaurants
#      touristiques : le paradoxe de l'invisibilité, reconstitué dans le jeu
#      censé le mesurer (D-001).
#   2. Il est REPRODUCTIBLE. Deux exécutions rendent la même liste, et
#      l'échantillon peut être étendu de 150 à 200 sans rien invalider — les
#      150 premiers restent les 150 premiers.
#   3. Il RECOUPE la collecte d'avis déjà payée : 35 des 42 restaurants
#      collectés tombent dans les 150 premiers.
#
# CE QUE LE FICHIER NE CONTIENT PAS, ET POURQUOI C'EST LA RÈGLE CENTRALE.
#
#   ni le Local Signal      ni le signal menu        ni la langue des avis
#   ni les plats relevés    ni le prix extrait       ni la pression touristique
#
# Labelliser en regardant la carte reviendrait à étiqueter « touristique » ce
# que notre propre indicateur menu appelle « touristique », puis à mesurer que
# l'indicateur prédit bien l'étiquette. Le résultat serait garanti d'avance et
# ne vaudrait rien. Le panel juge sur ce qu'un visiteur voit dans la rue — la
# devanture, l'emplacement, l'allure — pas sur nos calculs.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.verite_terrain --taille 150
#     python -m backend.db.verite_terrain --importer docs/data/verite-terrain.csv

import argparse
import csv
import sqlite3
from pathlib import Path
from urllib.parse import quote_plus

from backend import config
from backend.db.models import get_connection

SORTIE = Path("docs/data")

# Les trois étiquettes, et une échappatoire. « Je ne sais pas » n'est PAS un
# aveu de faiblesse : forcer un choix sur un restaurant qu'on n'arrive pas à
# juger fabrique du bruit qu'on prendra ensuite pour du signal.
ETIQUETTES = ("local", "mixte", "touristique", "je ne sais pas")

# Chevauchement entre deux annotateurs, pour mesurer leur accord (kappa de
# Cohen). Sans cette mesure, on ne sait pas si l'étiquette décrit le
# restaurant ou celui qui l'a posée — et le jury le demandera.
CHEVAUCHEMENT = 50


def echantillon(conn: sqlite3.Connection, zone: str, taille: int) -> list[dict]:
    """Les `taille` premiers restaurants de la zone, dans l'ordre fixe."""
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute("""
        SELECT id, name, address, lat, lng
          FROM restaurants
         WHERE zone = ?
      ORDER BY substr(hex(id), -6), id
         LIMIT ?
    """, (zone, taille))]


def _lien(resto: dict) -> str:
    """Lien Google Maps — la devanture et la rue, pas la fiche complète."""
    requete = quote_plus(f"{resto['name']} {resto.get('address') or ''}".strip())
    return f"https://www.google.com/maps/search/{requete}"


def exporter(zone: str, taille: int) -> Path:
    conn = get_connection()
    lot = echantillon(conn, zone, taille)
    conn.close()

    SORTIE.mkdir(parents=True, exist_ok=True)
    chemin = SORTIE / f"verite-terrain-{zone}.csv"

    with chemin.open("w", encoding="utf-8-sig", newline="") as f:
        # utf-8-sig : sans le BOM, Excel massacre les accents à l'ouverture.
        plume = csv.writer(f, delimiter=";")
        # DEUX VOIES DANS LE MEME FICHIER.
        #
        # `etiquette_*` est le jugement de l'annotateur : ce qu'il conclut en
        # regardant la devanture, la rue et l'allure du lieu. C'est la voie
        # principale, parce que c'est la seule qui couvre les restaurants
        # invisibles — ceux que le projet existe pour trouver.
        #
        # `presse_locale` / `guide_touristique` capturent la couverture
        # differentielle quand elle existe (docs/data/README.md). Sonde faite
        # sur trois restaurants de l'echantillon : aucun n'apparait dans la
        # presse food francophone, seulement dans des agregateurs. Attendu, et
        # c'est le probleme — un restaurant de quartier n'est dans aucun guide,
        # par definition. Cette voie ne peut donc pas etre la source principale
        # des etiquettes sans reintroduire le biais de notoriete (D-001) dans
        # le jeu cense le mesurer. On la garde comme PREUVE quand elle existe.
        plume.writerow([
            "rang", "id", "nom", "adresse", "lien",
            "annotateur_1", "etiquette_1", "confiance_1",
            "annotateur_2", "etiquette_2", "confiance_2",
            "arbitrage", "presse_locale", "guide_touristique", "remarque",
        ])
        for rang, r in enumerate(lot, 1):
            # Le second passage ne couvre que le chevauchement : annoter deux
            # fois les 150 doublerait le travail pour un gain nul au-delà de
            # ce qu'il faut pour estimer l'accord.
            double = rang <= CHEVAUCHEMENT
            plume.writerow([
                rang, r["id"], r["name"], r.get("address") or "", _lien(r),
                "", "", "",
                "" if double else "—", "" if double else "—", "" if double else "—",
                "", "", "", "",
            ])

    print(f"[Verite terrain] {chemin}  ({len(lot)} restaurants)")
    print(f"   {CHEVAUCHEMENT} premiers a annoter DEUX fois (accord inter-annotateurs)")
    print(f"   etiquettes acceptees : {', '.join(ETIQUETTES)}")
    print("\n   AUCUN de nos calculs n'est dans ce fichier. C'est voulu :")
    print("   labelliser en voyant la carte rendrait l'evaluation circulaire.")
    return chemin


def importer(chemin: str) -> dict:
    """
    Relit le fichier annoté et écrit les étiquettes en base.

    L'arbitrage prime, puis l'accord des deux annotateurs, puis l'annotateur
    unique. Un désaccord non arbitré n'entre PAS en base : une étiquette dont
    on sait qu'elle est contestée fausserait la calibration sans qu'on s'en
    aperçoive.
    """
    conn = get_connection()
    ecrits = desaccords = vides = 0

    with open(chemin, encoding="utf-8-sig", newline="") as f:
        for ligne in csv.DictReader(f, delimiter=";"):
            e1 = (ligne.get("etiquette_1") or "").strip().lower()
            e2 = (ligne.get("etiquette_2") or "").strip().lower()
            arb = (ligne.get("arbitrage") or "").strip().lower()

            if arb in ETIQUETTES[:3]:
                final, source = arb, "arbitrage"
            elif e1 in ETIQUETTES[:3] and e2 in ETIQUETTES[:3]:
                if e1 != e2:
                    desaccords += 1
                    continue
                final, source = e1, "accord"
            elif e1 in ETIQUETTES[:3] and e2 in ("", "—"):
                final, source = e1, "annotateur unique"
            else:
                vides += 1
                continue

            conn.execute(
                "UPDATE restaurants SET label = ?, label_sources = ?, "
                "human_validated = 1 WHERE id = ?",
                (final, source, ligne["id"]),
            )
            ecrits += 1

    conn.commit()
    conn.close()

    print(f"[Verite terrain] {ecrits} etiquettes ecrites")
    if desaccords:
        print(f"   {desaccords} desaccords NON arbitres — ignores, a trancher")
    if vides:
        print(f"   {vides} lignes sans etiquette exploitable")
    return {"ecrits": ecrits, "desaccords": desaccords, "vides": vides}


def main() -> None:
    a = argparse.ArgumentParser(description="Jeu labellise (LS-08).")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--taille", type=int, default=150,
                   help="taille de l'echantillon (minimum du protocole : 150)")
    a.add_argument("--importer", metavar="CSV",
                   help="relire un fichier annote et ecrire les etiquettes")
    args = a.parse_args()

    if args.importer:
        importer(args.importer)
    else:
        exporter(args.zone, args.taille)


if __name__ == "__main__":
    main()
