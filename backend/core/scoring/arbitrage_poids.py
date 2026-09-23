# backend/core/scoring/arbitrage_poids.py
#
# CHOISIR UNE PONDÉRATION ENTRE CELLE QU'ON A ET CELLE QUE LA CALIBRATION DONNE.
#
# LE PROBLÈME. `recalibration.py` rend 0,13 / 0,87 / 0,00 / 0,00 : la langue
# absorbe presque tout, le prix et la zone tombent à zéro. Ces poids prédisent
# mieux le classement de référence (+0,470 contre +0,277), et pourtant les
# appliquer casserait le produit — un restaurant sans avis n'aurait plus de
# score du tout, ce qui est exactement le cas que le projet existe pour traiter
# (D-001).
#
# ON NE CHOISIT DONC PAS ENTRE « SUIVRE LA CALIBRATION » ET « L'IGNORER ».
# On construit une pondération intermédiaire, avec deux réglages explicites :
#
#   MÉLANGE (alpha)   0 = on garde les poids actuels
#                     1 = on prend ceux de la calibration
#                     entre les deux : une moyenne pondérée
#
#   PLANCHER          aucun indicateur ne descend en dessous. Ce qui reste est
#                     réparti selon le mélange, puis le tout est renormalisé.
#
# POURQUOI UN PLANCHER, ET CE QUE ÇA COÛTE. Un poids nul retire l'indicateur du
# calcul. Or trois raisons de ne pas le faire sur la foi de 230 restaurants :
#
#   1. L'échantillon de calibration est biaisé vers les établissements bien
#      documentés (médiane 915 avis Google contre 264 pour les écartés, D-046).
#      Un indicateur inutile ICI peut être utile ailleurs.
#   2. Un indicateur à zéro ne peut plus jamais remonter : on cesse de le
#      mesurer, donc on cesse de pouvoir constater qu'il servait.
#   3. La vérité terrain est agentique, pas humaine (D-045). Elle vaut comme
#      référence, pas comme oracle.
#
# Le plancher est donc une assurance, et comme toute assurance il a un prix :
# une corrélation un peu plus basse. Ce module AFFICHE ce prix pour chaque
# réglage, au lieu de le laisser deviner.
#
# CE QU'IL N'ÉCRIT PAS : `config.py`. Il rend un tableau, on choisit, et le
# choix se consigne dans `DECISIONS.md`.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.core.scoring.arbitrage_poids --zone quartier-latin
#     python -m backend.core.scoring.arbitrage_poids --melange 0.6 --plancher 0.20

import argparse

import numpy as np
from scipy.stats import spearmanr

from backend import config
from backend.core.scoring.calibration import INDICATEURS, LIBELLES, poids_normalises
from backend.core.scoring.recalibration import (
    composite, jeu_continu, moindres_carres,
)
from backend.db.models import get_connection


def combiner(actuels: dict, derives: dict, melange: float,
             plancher: float) -> dict:
    """
    Pondération intermédiaire, bornée par le bas puis renormalisée.

    L'ordre compte. On mélange D'ABORD, on applique le plancher ENSUITE : le
    plancher est une contrainte de sécurité, pas un ingrédient du compromis.
    Dans l'autre sens, relever un poids avant de mélanger le diluerait, et le
    plancher ne serait plus garanti à l'arrivée.
    """
    if plancher * len(INDICATEURS) > 1.0:
        raise ValueError(
            f"plancher {plancher} impossible pour {len(INDICATEURS)} indicateurs")

    melanges = {nom: (1 - melange) * actuels[nom] + melange * derives[nom]
                for nom in INDICATEURS}

    # Le plancher consomme une part fixe ; le reste suit les proportions du
    # mélange. Sans cette répartition proportionnelle, relever les petits poids
    # écraserait l'ordre que la calibration vient d'établir.
    reste = 1.0 - plancher * len(INDICATEURS)
    total = sum(melanges.values()) or 1.0
    return {nom: round(plancher + reste * (v / total), 4)
            for nom, v in melanges.items()}


def evaluer(zone: str, melange: float = None, plancher: float = None) -> dict:
    conn = get_connection()
    X, y, noms, ecartes = jeu_continu(conn, zone)
    conn.close()

    if len(y) < 30:
        print(f"{len(y)} restaurants exploitables : insuffisant.")
        return {}

    actuels = {"menu": config.WEIGHT_MENU,
               "language": config.WEIGHT_LANGUAGE,
               "price": config.WEIGHT_PRICE,
               "tourist_zone": config.WEIGHT_TOURIST_ZONE}
    derives, _ = poids_normalises(moindres_carres(X, y))

    def rho(poids):
        return spearmanr(composite(X, poids), y).statistic

    print("=" * 78)
    print(f"ARBITRAGE DES PONDERATIONS — zone '{zone}', {len(y)} restaurants")
    print("=" * 78)
    print()
    print("Le plancher garantit qu'aucun indicateur ne disparait du calcul.")
    print("Le melange dit a quel point on suit la calibration. On lit le PRIX")
    print("de chaque reglage dans la derniere colonne.")
    print()
    print(f"{'melange':>8} {'plancher':>9}   " +
          "  ".join(f"{LIBELLES[n][:9]:>9}" for n in INDICATEURS) + "      rho")
    print("-" * 78)

    lignes = []
    if melange is not None and plancher is not None:
        essais = [(melange, plancher)]
    else:
        essais = [(0.0, 0.00), (0.5, 0.20), (0.6, 0.20), (0.7, 0.20),
                  (1.0, 0.20), (0.7, 0.15), (0.7, 0.10), (1.0, 0.00)]

    for m, pl in essais:
        p = combiner(actuels, derives, m, pl)
        r = rho(p)
        lignes.append((m, pl, p, r))
        etiquette = ""
        if (m, pl) == (0.0, 0.00):
            etiquette = "  <- actuel"
        elif (m, pl) == (1.0, 0.00):
            etiquette = "  <- calibration brute"
        print(f"{m:>8.2f} {pl:>9.2f}   " +
              "  ".join(f"{p[n]:>9.2f}" for n in INDICATEURS) +
              f"   {r:+.3f}{etiquette}")

    print("-" * 78)
    reference = next(r for m, pl, p, r in lignes if (m, pl) == (0.0, 0.00))
    brute = next((r for m, pl, p, r in lignes if (m, pl) == (1.0, 0.00)), None)
    if brute is not None and brute > reference:
        print()
        print(f"Ecart total a recuperer : {brute - reference:+.3f}")
        print()
        # UN PLANCHER TROP HAUT EST PIRE QUE PAS DE PLANCHER, et il faut le
        # montrer plutot que le laisser decouvrir. Avec quatre indicateurs,
        # un plancher de 0,20 immobilise 80 % du budget : tous les poids se
        # rapprochent de 0,25, la ponderation devient presque uniforme, et
        # elle fait MOINS bien que celle qu'on avait.
        vus = set()
        for m, pl, p, r in sorted(lignes, key=lambda x: -x[1]):
            if pl <= 0 or pl in vus:
                continue
            vus.add(pl)
            part = 100 * (r - reference) / (brute - reference)
            verdict = (f"recupere {part:.0f} % de l'ecart" if part > 0
                       else f"PERD {abs(part):.0f} % — pire que l'actuel")
            print(f"   plancher {pl:.2f} : rho {r:+.3f}  ->  {verdict}")

    print()
    print("Aucune de ces lignes n'est ecrite dans config.py. Le choix se")
    print("consigne dans DECISIONS.md, avec la raison du reglage retenu.")
    return {"actuels": actuels, "derives": derives, "essais": lignes}


def main() -> None:
    a = argparse.ArgumentParser(
        description="Choisir une ponderation entre l'actuelle et la calibree.")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--melange", type=float, default=None,
                   help="0 = poids actuels, 1 = poids calibres")
    a.add_argument("--plancher", type=float, default=None,
                   help="poids minimal garanti a chaque indicateur")
    args = a.parse_args()
    evaluer(args.zone, args.melange, args.plancher)


if __name__ == "__main__":
    main()
