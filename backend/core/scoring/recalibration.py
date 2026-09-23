# backend/core/scoring/recalibration.py
#
# RECALIBRATION SUR LE CLASSEMENT PAR PAIRES (LS-09, suite de D-045).
#
# POURQUOI UN MODULE À PART. `calibration.py` fait une régression logistique :
# il sépare deux classes. La vérité terrain obtenue par comparaison de paires
# n'est pas catégorielle — c'est un CLASSEMENT CONTINU, un `theta` de
# Bradley-Terry par restaurant. La seuiller en trois classes jetterait
# exactement l'information que la comparaison par paires a permis de gagner, et
# le passage aux trois classes est précisément ce qui avait échoué (D-042).
#
# CONVENTION DE SIGNE, à ne pas se tromper : `theta` BAS = plus LOCAL. Le rang 1
# (Le Foyer Vietnam, θ = −0,574) est le plus local ; le dernier (La Bûcherie,
# θ = +0,586) le plus dépendant du passage. La cible est donc **−theta**, pour
# que « plus haut = plus local », dans le même sens que les quatre indicateurs.
#
# POURQUOI ON CENTRE ET RÉDUIT LES INDICATEURS. Sans cela, un indicateur dont
# les valeurs s'étalent peu recevrait mécaniquement un gros coefficient pour
# compenser, et ce coefficient ne serait plus lisible comme un POIDS. Après
# standardisation, chaque coefficient répond à la même question : de combien la
# localité bouge quand cet indicateur bouge d'un écart-type. C'est la seule
# forme sous laquelle deux poids se comparent.
#
# LE SEUL VRAI TEST, ET IL EST FAIT ICI : est-ce que la nouvelle pondération
# prédit MIEUX le classement de référence que l'actuelle ? Des coefficients ne
# valent rien s'ils n'améliorent pas la corrélation. Et le gain est mesuré HORS
# ÉCHANTILLON — un gain calculé sur les données qui ont servi à apprendre est
# optimiste par construction, toujours.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.core.scoring.recalibration --zone quartier-latin

import argparse
import json
import sqlite3

import numpy as np
from scipy.stats import spearmanr

from backend import config
from backend.core.scoring.calibration import INDICATEURS, LIBELLES, poids_normalises
from backend.db.models import get_connection

# En dessous, quatre coefficients ne veulent rien dire.
MINIMUM = 30


def jeu_continu(conn: sqlite3.Connection, zone: str) -> tuple:
    """
    Indicateurs et cible continue, cas complets seulement.

    Returns:
        (X, y, noms, ecartes) où `y` vaut −theta : plus haut = plus local.
    """
    conn.row_factory = sqlite3.Row
    lignes = conn.execute("""
        SELECT id, name, theta_verite_terrain AS theta, signals_json
          FROM restaurants
         WHERE zone = ? AND theta_verite_terrain IS NOT NULL
           AND signals_json IS NOT NULL
    """, (zone,)).fetchall()

    X, y, noms = [], [], []
    ecartes = {"indicateur manquant": 0, "langue non mesuree (a priori)": 0}

    for ligne in lignes:
        signaux = json.loads(ligne["signals_json"])
        valeurs = [(signaux.get(nom) or {}).get("value") for nom in INDICATEURS]
        if any(v is None for v in valeurs):
            ecartes["indicateur manquant"] += 1
            continue

        # Même règle qu'en binaire : l'a priori du lissage n'est pas une mesure.
        # Un restaurant sans avis porte 0,500 par défaut, pas par observation.
        details = (signaux.get("language") or {}).get("details") or {}
        if not details.get("review_count"):
            ecartes["langue non mesuree (a priori)"] += 1
            continue

        X.append(valeurs)
        y.append(-float(ligne["theta"]))
        noms.append(ligne["name"])

    return np.array(X, float), np.array(y, float), noms, ecartes


def moindres_carres(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Coefficients d'une régression linéaire sur indicateurs standardisés."""
    moyennes, ecarts = X.mean(axis=0), X.std(axis=0)
    ecarts[ecarts == 0] = 1.0          # un indicateur constant n'explique rien
    Z = (X - moyennes) / ecarts
    Z1 = np.hstack([np.ones((len(y), 1)), Z])
    return np.linalg.lstsq(Z1, y, rcond=None)[0]


def composite(X: np.ndarray, poids: dict) -> np.ndarray:
    """Score agrégé pour une pondération donnée, dans l'ordre d'INDICATEURS."""
    return X @ np.array([poids[nom] for nom in INDICATEURS])


def recalibrer(zone: str, tirages: int = 400, partages: int = 200) -> dict:
    conn = get_connection()
    X, y, noms, ecartes = jeu_continu(conn, zone)
    conn.close()

    print("=" * 74)
    print(f"RECALIBRATION SUR CLASSEMENT CONTINU — zone '{zone}'")
    print("=" * 74)

    if len(y) < MINIMUM:
        print()
        print(f"{len(y)} exemples exploitables : insuffisant (il en faut {MINIMUM}).")
        for motif, n in ecartes.items():
            if n:
                print(f"   ecarte — {motif} : {n}")
        return {}

    print()
    print(f"{len(y)} restaurants exploitables")
    for motif, n in ecartes.items():
        if n:
            print(f"   ecarte — {motif} : {n}")

    poids, alertes = poids_normalises(moindres_carres(X, y))

    # Incertitude par reechantillonnage : un poids sans intervalle est une
    # opinion, pas une mesure.
    alea = np.random.default_rng(0)
    accumules = {nom: [] for nom in INDICATEURS}
    for _ in range(tirages):
        i = alea.integers(0, len(y), len(y))
        p, _ = poids_normalises(moindres_carres(X[i], y[i]))
        for nom, v in p.items():
            accumules[nom].append(v)
    intervalles = {nom: (float(np.percentile(v, 5)), float(np.percentile(v, 95)))
                   for nom, v in accumules.items()}

    actuels = {"menu": config.WEIGHT_MENU,
               "language": config.WEIGHT_LANGUAGE,
               "price": config.WEIGHT_PRICE,
               "tourist_zone": config.WEIGHT_TOURIST_ZONE}

    print()
    print(f"{'indicateur':26} {'actuel':>7} {'derive':>7}   "
          f"{'intervalle 90 %':>17}   {'rho seul':>9}")
    for nom in INDICATEURS:
        bas, haut = intervalles[nom]
        rho = spearmanr(X[:, INDICATEURS.index(nom)], y).statistic
        print(f"{LIBELLES[nom]:26} {actuels[nom]:>7.2f} {poids[nom]:>7.2f}   "
              f"[{bas:>5.2f} ; {haut:>5.2f}]   {rho:>+9.3f}")

    for nom, coefficient in alertes:
        print()
        print(f"   ALERTE — '{LIBELLES[nom]}' a un coefficient NEGATIF "
              f"({coefficient:+.3f}).")
        print("   Il pousse vers « touristique » la ou le score le compte comme")
        print("   un signe de localite. Son poids est mis a zero : un indicateur")
        print("   a l'envers ne se repare pas en le ponderant.")

    # --- LE SEUL VRAI TEST ---------------------------------------------------
    avant = spearmanr(composite(X, actuels), y)
    apres = spearmanr(composite(X, poids), y)

    print()
    print("-" * 74)
    print("EST-CE QUE CA PREDIT MIEUX ? (Spearman contre le classement de reference)")
    print("-" * 74)
    print(f"   ponderation actuelle  {avant.statistic:+.3f}   (p = {avant.pvalue:.1e})")
    print(f"   ponderation derivee   {apres.statistic:+.3f}   (p = {apres.pvalue:.1e})")
    print(f"   gain apparent         {apres.statistic - avant.statistic:+.3f}")

    # HORS ECHANTILLON. Le gain ci-dessus est mesure sur les donnees qui ont
    # servi a apprendre les poids : il est optimiste par construction. On
    # reapprend sur 70 % et on mesure sur les 30 % restants, deux cents fois.
    alea = np.random.default_rng(1)
    gains = []
    for _ in range(partages):
        melange = alea.permutation(len(y))
        coupe = int(len(y) * 0.7)
        app, test = melange[:coupe], melange[coupe:]
        p_app, _ = poids_normalises(moindres_carres(X[app], y[app]))
        a = spearmanr(composite(X[test], actuels), y[test]).statistic
        b = spearmanr(composite(X[test], p_app), y[test]).statistic
        if not (np.isnan(a) or np.isnan(b)):
            gains.append(b - a)

    resultat = {"poids": poids, "intervalles": intervalles,
                "rho_avant": avant.statistic, "rho_apres": apres.statistic}

    if gains:
        moyen = float(np.mean(gains))
        bas, haut = float(np.percentile(gains, 5)), float(np.percentile(gains, 95))
        positif = 100 * float(np.mean([g > 0 for g in gains]))
        print()
        print(f"   HORS ECHANTILLON ({partages} partages 70/30)")
        print(f"   gain moyen            {moyen:+.3f}   [{bas:+.3f} ; {haut:+.3f}]")
        print(f"   gain positif dans     {positif:.0f} % des partages")
        resultat["gain_hors_echantillon"] = moyen
        resultat["gain_intervalle"] = (bas, haut)

        if bas <= 0 <= haut:
            print()
            print("   L'INTERVALLE CONTIENT ZERO : l'amelioration n'est pas etablie.")
            print("   A ecrire tel quel dans le memoire.")

    print()
    print("=" * 74)
    print("Ces poids sont une PROPOSITION. Les porter dans config.py est une")
    print("decision, a consigner dans DECISIONS.md.")
    return resultat


def main() -> None:
    a = argparse.ArgumentParser(
        description="Recalibration sur le classement par paires (D-045).")
    a.add_argument("--zone", default="quartier-latin")
    recalibrer(a.parse_args().zone)


if __name__ == "__main__":
    main()
