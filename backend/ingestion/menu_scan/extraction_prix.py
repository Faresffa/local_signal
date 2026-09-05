# backend/ingestion/menu_scan/extraction_prix.py
#
# EXTRACTION DES PRIX DEPUIS LE TEXTE DES CARTES (D-033).
#
# L'indicateur prix pèse 0,15 et valait zéro sur les 468 restaurants du
# Quartier latin. Deux causes s'additionnaient :
#
#   1. OpenStreetMap n'expose aucun prix — mesuré, 0 sur 468 ;
#   2. la lecture des cartes COMPTAIT les prix pour en déduire le nombre de
#      plats, puis jetait les montants.
#
# La fourchette affichée par la plateforme cartographique (« $ » à « $$$$ »)
# aurait pu servir de substitut, mais elle est vide : `range` et `prices`
# valent `None` sur les 457 fiches collectées. L'OCR reste donc la seule
# source, et elle suffit — 296 textes sur 318 contiennent des montants.
#
# CE QUI VALIDE LA MÉTHODE. La distribution des nombres relevés sur l'ensemble
# des cartes est celle de prix de plats parisiens, pas celle de nombres au
# hasard :
#
#     10 €  132 fois        16 €  162 fois
#     12 €  165 fois        18 €  122 fois
#     15 €  148 fois        20 €   92 fois
#
# Pic entre 12 et 18, décroissance au-delà de 20, quasi rien sous 10. Une
# extraction qui capterait du bruit donnerait une distribution plate.
#
# LA MÉDIANE, ET NON LA MOYENNE. Une carte mêle des desserts à 6 € et des
# plateaux à 90 € ; la moyenne suivrait les extrêmes, la médiane décrit le prix
# d'un plat ordinaire — ce que l'indicateur compare à la médiane du voisinage.

import argparse
import json
import re
import sqlite3
import statistics
import sys

from backend import config

# Un montant sur une carte : avec décimale, ou entier seul sur sa ligne.
_AVEC_DECIMALE = re.compile(r"(?<![\d,.])(\d{1,3})[.,](\d{1,2})(?![\d])")
_ENTIER_SEUL = re.compile(r"^\s*(\d{1,3})\s*$", re.M)

# Bornes d'un prix de plat, en euros.
#
# 5 en bas : sous ce seuil il s'agit d'une boisson, d'un supplément ou d'un
# nombre qui n'est pas un prix. La distribution mesurée le confirme — entre 1 et
# 9 €, on relève au plus 14 occurrences par valeur, contre 130 à 165 entre 10
# et 18 €.
#
# 199 en haut : au-delà ce n'est plus un plat mais une année, un code postal ou
# un fragment de numéro de téléphone.
PRIX_MIN = 5.0
PRIX_MAX = 199.0

# En deçà, la médiane ne veut rien dire : un seul montant relevé peut être le
# prix d'un menu entier comme celui d'un supplément.
MONTANTS_MINIMUM = 3


def extraire_montants(texte: str) -> list[float]:
    """
    Relève tous les montants plausibles d'un texte de carte.

    Returns:
        Liste triée des montants retenus, en euros.
    """
    if not texte:
        return []

    montants = []
    for m in _AVEC_DECIMALE.finditer(texte):
        try:
            montants.append(float(f"{m.group(1)}.{m.group(2)}"))
        except ValueError:
            continue
    for m in _ENTIER_SEUL.finditer(texte):
        try:
            montants.append(float(m.group(1)))
        except ValueError:
            continue

    return sorted(v for v in montants if PRIX_MIN <= v <= PRIX_MAX)


def resumer(montants: list[float]) -> dict | None:
    """
    Résume une liste de montants en indicateurs de prix.

    Returns:
        None si les montants sont trop peu nombreux pour signifier quelque
        chose — l'indicateur sera alors indisponible et le moteur redistribuera
        son poids (D-012), ce qui vaut mieux qu'un prix inventé.
    """
    if len(montants) < MONTANTS_MINIMUM:
        return None

    return {
        "median": round(statistics.median(montants), 2),
        "min": montants[0],
        "max": montants[-1],
        "n": len(montants),
        # L'amplitude distingue une carte resserrée d'une carte fourre-tout.
        # Conservée sans être exploitée aujourd'hui : elle pourra fonder un
        # indicateur, et ce qui est obtenu se garde.
        "amplitude": round(montants[-1] - montants[0], 2),
        "montants": montants,
    }


def traiter_zone(zone: str, a_blanc: bool = False) -> dict:
    """Relit les textes OCR déjà en base et en tire les prix."""
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row

    lignes = list(conn.execute("""
        SELECT m.restaurant_id, m.ocr_text, r.name
          FROM menus m
          JOIN restaurants r ON r.id = m.restaurant_id
         WHERE r.zone = ? AND m.ocr_text IS NOT NULL AND trim(m.ocr_text) <> ''
    """, (zone,)))

    print(f"[Prix] {len(lignes)} textes de carte a relire dans '{zone}'.\n")

    retenus, trop_peu = 0, 0
    curseur = conn.cursor()
    apercu = []

    for l in lignes:
        resume = resumer(extraire_montants(l["ocr_text"]))
        if resume is None:
            trop_peu += 1
            continue

        if not a_blanc:
            curseur.execute(
                "UPDATE restaurants SET price = ?, price_detail = ? WHERE id = ?",
                (resume["median"], json.dumps(resume, ensure_ascii=False),
                 l["restaurant_id"]),
            )
        retenus += 1
        if len(apercu) < 12:
            apercu.append((l["name"], resume))

    if not a_blanc:
        conn.commit()

    for nom, r in apercu:
        print(f"  {nom[:26]:28s} mediane {r['median']:6.2f} EUR   "
              f"({r['n']:3d} prix, de {r['min']:.0f} a {r['max']:.0f})")

    # Vue d'ensemble : une médiane de quartier aberrante signalerait une
    # extraction défaillante avant même le calcul du score.
    medianes = [r[0] for r in conn.execute(
        "SELECT price FROM restaurants WHERE zone = ? AND price IS NOT NULL", (zone,))]
    conn.close()

    return {"lus": len(lignes), "retenus": retenus, "trop_peu": trop_peu,
            "mediane_quartier": round(statistics.median(medianes), 2) if medianes else None}


def main():
    parser = argparse.ArgumentParser(
        description="Extrait les prix depuis le texte OCR des cartes (D-033).")
    parser.add_argument("--zone", default="quartier-latin")
    parser.add_argument("--dry-run", action="store_true",
                        help="montre sans rien ecrire en base")
    args = parser.parse_args()

    res = traiter_zone(args.zone, a_blanc=args.dry_run)

    mode = "  (A BLANC)" if args.dry_run else ""
    print(f"\n{'='*60}{mode}")
    print(f"  textes relus            : {res['lus']}")
    print(f"  prix retenus            : {res['retenus']}")
    print(f"  trop peu de montants    : {res['trop_peu']}")
    print(f"  mediane du quartier     : {res['mediane_quartier']} EUR")
    print(f"{'='*60}")
    if not args.dry_run:
        print("\nEtape suivante — recalculer les scores :")
        print(f"  python -m backend.ingestion.osm.load {args.zone} --score-only")


if __name__ == "__main__":
    main()
