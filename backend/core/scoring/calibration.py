# backend/core/scoring/calibration.py
#
# DÉRIVER LES PONDÉRATIONS DU JEU LABELLISÉ (LS-09), ET MESURER (LS-10).
#
# CE QUE CE MODULE REMPLACE. Les quatre poids — menu 0,40, langue 0,30, prix
# 0,15, zone 0,15 — ont été posés à la main. « Pourquoi 0,30 ? » est la
# première question d'un jury, et sans ce module la réponse est « parce que ».
# Avec lui, la réponse est un coefficient de régression et un intervalle.
#
# LA MÉTHODE : RÉGRESSION LOGISTIQUE.
#
# On cherche P(local | quatre indicateurs). La régression logistique est le
# choix standard pour une cible binaire, et surtout elle est INTERPRÉTABLE :
# chaque coefficient se lit directement comme le poids de son indicateur. Un
# modèle plus puissant — forêt, gradient boosting — donnerait peut-être une
# meilleure prédiction et aucune pondération à écrire dans `engine.py`. Ici la
# lisibilité du résultat EST le résultat.
#
# Implémentée à la main, en trente lignes de descente de gradient. Ce n'est pas
# de l'orgueil : `scikit-learn` n'est pas installé, l'ajouter pour une
# régression à quatre variables alourdirait le déploiement, et le jury peut
# lire ces trente lignes. La vérification contre `scipy.optimize` est dans les
# tests.
#
# DEUX PIÈGES, ET CE QU'ON EN FAIT.
#
#   1. UN INDICATEUR MANQUANT N'EST PAS UN ZÉRO (D-012). Un restaurant sans
#      avis a `langue = None`. Le remplacer par 0 apprendrait au modèle que
#      « pas d'avis » veut dire « touristique » — exactement le paradoxe de
#      l'invisibilité, réintroduit dans la calibration. On n'entraîne donc que
#      sur les CAS COMPLETS, et on dit combien on en a.
#
#   2. LES CLASSES SONT DÉSÉQUILIBRÉES. S'il y a trois fois plus de
#      touristiques que de locaux, un modèle qui répond toujours
#      « touristique » a 75 % de justesse et ne sert à rien. Les classes sont
#      donc repondérées à l'entraînement, et on rapporte l'équilibre.
#
# CE QUE CE MODULE NE FAIT PAS : écrire dans `config.py`. Il PROPOSE des poids,
# les affiche avec leur incertitude, et s'arrête. Changer la pondération du
# produit est une décision, elle se consigne dans `DECISIONS.md` — pas un effet
# de bord d'un script.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.core.scoring.calibration --zone quartier-latin
#     python -m backend.core.scoring.calibration --zone quartier-latin --precision

import argparse
import json
import math
import sqlite3

import numpy as np

from backend import config
from backend.db.models import get_connection

INDICATEURS = ("menu", "language", "price", "tourist_zone")
LIBELLES = {
    "menu": "carte du restaurant",
    "language": "langue des avis",
    "price": "prix face au quartier",
    "tourist_zone": "hors zone touristique",
}

# Étiquettes retenues pour l'entraînement. « mixte » est écarté : la régression
# logistique sépare deux classes, et forcer un troisième état au milieu
# reviendrait à inventer une frontière que le panel n'a pas tracée. Les mixtes
# servent en revanche à l'évaluation, où ils comptent comme « pas local ».
POSITIF = "local"
NEGATIF = "touristique"


def jeu(conn: sqlite3.Connection, zone: str) -> tuple:
    """
    Matrice des indicateurs et vecteur d'étiquettes, cas complets seulement.

    Returns:
        (X, y, noms, ecartes) — `ecartes` compte ce qui a été laissé de côté et
        pourquoi, parce qu'un jeu d'entraînement dont on ignore les trous n'est
        pas un jeu d'entraînement.
    """
    conn.row_factory = sqlite3.Row
    lignes = conn.execute("""
        SELECT id, name, label, signals_json
          FROM restaurants
         WHERE zone = ? AND label IS NOT NULL AND signals_json IS NOT NULL
    """, (zone,)).fetchall()

    X, y, noms = [], [], []
    ecartes = {"mixte": 0, "indicateur manquant": 0, "etiquette inconnue": 0}

    for ligne in lignes:
        etiquette = (ligne["label"] or "").strip().lower()
        if etiquette not in (POSITIF, NEGATIF):
            ecartes["mixte" if etiquette == "mixte" else "etiquette inconnue"] += 1
            continue

        signaux = json.loads(ligne["signals_json"])
        valeurs = [(signaux.get(nom) or {}).get("value") for nom in INDICATEURS]
        if any(v is None for v in valeurs):
            # Voir le piège n°1 en tête de fichier.
            ecartes["indicateur manquant"] += 1
            continue

        X.append(valeurs)
        y.append(1.0 if etiquette == POSITIF else 0.0)
        noms.append(ligne["name"])

    return np.array(X, dtype=float), np.array(y, dtype=float), noms, ecartes


def regression(X: np.ndarray, y: np.ndarray, iterations: int = 4000,
               pas: float = 0.5, regularisation: float = 0.01) -> np.ndarray:
    """
    Régression logistique par descente de gradient. Rend [biais, w1..w4].

    Les classes sont repondérées par leur inverse de fréquence : sans cela, une
    classe trois fois plus nombreuse impose sa réponse (piège n°2).

    La régularisation L2 empêche un coefficient de s'envoler quand un
    indicateur sépare parfaitement les quelques dizaines d'exemples dont on
    dispose — ce qui arrive vite sur un petit jeu, et ne survit jamais à de
    nouvelles données.
    """
    n, k = X.shape
    X1 = np.hstack([np.ones((n, 1)), X])          # colonne de biais
    theta = np.zeros(k + 1)

    positifs = max(y.sum(), 1.0)
    negatifs = max(n - y.sum(), 1.0)
    poids = np.where(y == 1.0, n / (2 * positifs), n / (2 * negatifs))

    for _ in range(iterations):
        p = 1.0 / (1.0 + np.exp(-X1 @ theta))
        gradient = X1.T @ (poids * (p - y)) / n
        gradient[1:] += regularisation * theta[1:]   # jamais sur le biais
        theta -= pas * gradient

    return theta


def poids_normalises(theta: np.ndarray) -> dict:
    """
    Des coefficients aux pondérations qui somment à 1.

    UN COEFFICIENT NÉGATIF EST UNE INFORMATION, PAS UNE ERREUR. Il dit que
    l'indicateur pousse vers « touristique » alors que le score le compte comme
    un signe de localité. Le cas doit être VU, pas écrasé par une valeur
    absolue : on le signale et on met le poids à zéro, parce qu'un indicateur
    qui pointe dans le mauvais sens ne se répare pas en le pondérant.
    """
    bruts = {}
    alertes = []
    for nom, coefficient in zip(INDICATEURS, theta[1:]):
        if coefficient < 0:
            alertes.append((nom, coefficient))
            bruts[nom] = 0.0
        else:
            bruts[nom] = float(coefficient)

    total = sum(bruts.values())
    if total == 0:
        return {nom: 0.25 for nom in INDICATEURS}, alertes
    return {nom: round(v / total, 3) for nom, v in bruts.items()}, alertes


def incertitude(X: np.ndarray, y: np.ndarray, tirages: int = 300) -> dict:
    """
    Intervalle des poids par bootstrap.

    UN POIDS SANS INTERVALLE EST UNE OPINION. Sur quelques dizaines
    d'exemples, un coefficient bouge beaucoup selon les restaurants tombés dans
    l'échantillon. Rééchantillonner avec remise, recalculer, et regarder
    l'étalement : c'est la seule façon honnête de dire « 0,38 » plutôt que
    « 0,382 ».
    """
    n = len(y)
    accumules = {nom: [] for nom in INDICATEURS}
    alea = np.random.default_rng(0)      # graine fixe : résultat reproductible

    for _ in range(tirages):
        indices = alea.integers(0, n, n)
        if len(set(y[indices])) < 2:     # un tirage à une seule classe n'apprend rien
            continue
        poids, _ = poids_normalises(regression(X[indices], y[indices], iterations=800))
        for nom, v in poids.items():
            accumules[nom].append(v)

    return {
        nom: (round(float(np.percentile(v, 5)), 3),
              round(float(np.percentile(v, 95)), 3))
        for nom, v in accumules.items() if v
    }


def precision_at_k(conn: sqlite3.Connection, zone: str, k: int = 10) -> dict:
    """
    `precision@k` du Local Signal, comparée au tri de Google par note (LS-10).

    C'EST LE RÉSULTAT PRINCIPAL DU MÉMOIRE. La question n'est pas « notre score
    est-il bon dans l'absolu » mais « fait-il mieux que trier par note, pour
    trouver un restaurant local ? ».

    On ne classe que les restaurants ÉTIQUETÉS : mesurer sur des restaurants
    dont on ignore la nature ne mesure rien. « mixte » compte comme « pas
    local » — un mixte dans le top 10 n'est pas une réussite.
    """
    conn.row_factory = sqlite3.Row
    lignes = [dict(r) for r in conn.execute("""
        SELECT id, name, label, local_signal, rating, review_count
          FROM restaurants
         WHERE zone = ? AND label IS NOT NULL
    """, (zone,))]

    etiquetes = [r for r in lignes if (r["label"] or "").lower() in
                 (POSITIF, NEGATIF, "mixte")]
    locaux = sum(1 for r in etiquetes if (r["label"] or "").lower() == POSITIF)

    notre = [r for r in etiquetes if r["local_signal"] is not None]
    notre.sort(key=lambda r: -r["local_signal"])

    # Google : la note d'abord, le nombre d'avis pour départager — c'est ainsi
    # qu'un utilisateur lit une liste Google.
    google = [r for r in etiquetes if r["rating"] is not None]
    google.sort(key=lambda r: (-(r["rating"] or 0), -(r["review_count"] or 0)))

    def precision(classement):
        tete = classement[:k]
        if not tete:
            return None, 0
        justes = sum(1 for r in tete if (r["label"] or "").lower() == POSITIF)
        return justes / len(tete), justes

    p_notre, n_notre = precision(notre)
    p_google, n_google = precision(google)
    base = locaux / len(etiquetes) if etiquetes else None

    return {
        "k": k,
        "etiquetes": len(etiquetes),
        "locaux": locaux,
        "hasard": base,
        "local_signal": p_notre,
        "local_signal_justes": n_notre,
        "google": p_google,
        "google_justes": n_google,
        "top_notre": [(r["name"], r["label"], round(r["local_signal"] or 0, 1))
                      for r in notre[:k]],
        "top_google": [(r["name"], r["label"], r["rating"]) for r in google[:k]],
    }


def main() -> None:
    a = argparse.ArgumentParser(description="Calibration et evaluation (LS-09, LS-10).")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--k", type=int, default=10)
    a.add_argument("--precision", action="store_true",
                   help="seulement precision@k, sans recalibrer")
    args = a.parse_args()

    conn = get_connection()
    X, y, noms, ecartes = jeu(conn, args.zone)

    print("=" * 74)
    print(f"CALIBRATION — zone '{args.zone}'")
    print("=" * 74)

    if len(y) < 20:
        print(f"\n{len(y)} exemples exploitables : INSUFFISANT.")
        print("Il en faut au moins une vingtaine pour que quatre coefficients")
        print("veuillent dire quelque chose. Annoter d'abord :")
        print(f"   docs/data/verite-terrain-{args.zone}.csv")
        for motif, n in ecartes.items():
            if n:
                print(f"   ecarte — {motif} : {n}")
        conn.close()
        return

    print(f"\n{len(y)} exemples complets  "
          f"({int(y.sum())} locaux, {int(len(y) - y.sum())} touristiques)")
    for motif, n in ecartes.items():
        if n:
            print(f"   ecarte — {motif} : {n}")

    theta = regression(X, y)
    poids, alertes = poids_normalises(theta)
    intervalles = incertitude(X, y)

    print(f"\n{'indicateur':26} {'actuel':>8} {'derive':>8}   intervalle 90 %")
    actuels = {"menu": config.WEIGHT_MENU, "language": config.WEIGHT_LANGUAGE,
               "price": config.WEIGHT_PRICE, "tourist_zone": config.WEIGHT_TOURIST_ZONE}
    for nom in INDICATEURS:
        bas, haut = intervalles.get(nom, (None, None))
        plage = f"[{bas:.2f} – {haut:.2f}]" if bas is not None else "—"
        print(f"{LIBELLES[nom]:26} {actuels.get(nom, 0):>8.2f} "
              f"{poids[nom]:>8.2f}   {plage}")

    for nom, coefficient in alertes:
        print(f"\n   ALERTE — '{LIBELLES[nom]}' a un coefficient NEGATIF "
              f"({coefficient:.2f}).")
        print("   L'indicateur pousse vers « touristique » la ou le score le")
        print("   compte comme un signe de localite. A comprendre avant de")
        print("   ponderer quoi que ce soit : ce n'est pas un probleme de poids.")

    large = [n for n, (b, h) in intervalles.items() if h - b > 0.25]
    if large:
        print(f"\n   {len(large)} indicateur(s) a l'intervalle tres large : "
              f"{', '.join(LIBELLES[n] for n in large)}.")
        print("   Le jeu labellise est trop petit pour les trancher. Le dire")
        print("   dans le memoire vaut mieux que d'afficher trois decimales.")

    print("\n" + "=" * 74)
    print(f"PRECISION@{args.k} — le resultat principal (LS-10)")
    print("=" * 74)
    p = precision_at_k(conn, args.zone, args.k)
    if p["local_signal"] is None:
        print("Pas assez de restaurants classables.")
    else:
        print(f"\n{p['etiquetes']} restaurants etiquetes, dont {p['locaux']} locaux")
        print(f"   hasard          {p['hasard']:.0%}   (proportion de locaux)")
        print(f"   Google par note {p['google']:.0%}   "
              f"({p['google_justes']}/{args.k})")
        print(f"   Local Signal    {p['local_signal']:.0%}   "
              f"({p['local_signal_justes']}/{args.k})")
        ecart = p["local_signal"] - p["google"]
        print(f"\n   ecart : {ecart:+.0%}")
        print("\n   Notre top 10 :")
        for nom, etiquette, score in p["top_notre"]:
            print(f"      {nom[:34]:36} {etiquette:12} {score}")
        print("\n   Top 10 de Google par note :")
        for nom, etiquette, note in p["top_google"]:
            print(f"      {nom[:34]:36} {etiquette:12} {note}")

    print("\n" + "=" * 74)
    print("Ces poids sont une PROPOSITION. Les porter dans config.py est une")
    print("decision, a consigner dans DECISIONS.md — pas un effet de bord.")
    conn.close()


if __name__ == "__main__":
    main()
