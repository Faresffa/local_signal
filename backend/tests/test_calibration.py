# backend/tests/test_calibration.py
#
# La régression logistique de `calibration.py` est écrite à la main. Ces tests
# existent pour qu'on puisse le dire sans gêne.
#
# On ne teste pas des valeurs choisies après coup : on teste des PROPRIÉTÉS.
#   - les coefficients retrouvent une vérité connue, posée avant le calcul
#   - ils coïncident avec `scipy.optimize`, référence indépendante
#   - une classe minoritaire n'est pas écrasée par la majorité
#   - un indicateur inutile reçoit un poids proche de zéro
#
#     python -m backend.tests.test_calibration

import numpy as np
from scipy.optimize import minimize

from backend.core.scoring.calibration import (
    INDICATEURS, poids_normalises, regression,
)

_echecs = []


def verifier(condition, libelle, detail=""):
    if condition:
        print(f"  OK     {libelle}")
    else:
        print(f"  ECHEC  {libelle}  {detail}")
        _echecs.append(libelle)


def _jeu_synthetique(n=6000, graine=0):
    """
    Un jeu dont on CONNAÎT la réponse.

    `menu` compte double de `language`, `price` compte un peu, et
    `tourist_zone` ne compte pas du tout : c'est du bruit pur. Un calibrage
    correct doit retrouver cet ordre.
    """
    alea = np.random.default_rng(graine)
    X = alea.random((n, 4))
    vrais = np.array([2.0, 1.0, 0.5, 0.0])
    logit = X @ vrais - 1.75
    y = (alea.random(n) < 1 / (1 + np.exp(-logit))).astype(float)
    return X, y, vrais


print("=" * 74)
print("REGRESSION LOGISTIQUE — CALIBRATION (LS-09)")
print("=" * 74)

# GRAND ECHANTILLON D'ABORD : on verifie que l'ESTIMATEUR est juste, sans
# que le bruit d'echantillonnage s'en mele. Le comportement a petit
# echantillon — celui qui nous attend vraiment — est teste plus bas.
X, y, vrais = _jeu_synthetique()
theta = regression(X, y)
poids, alertes = poids_normalises(theta)

verifier(len(theta) == 5, "quatre coefficients et un biais")

ordre_obtenu = sorted(INDICATEURS, key=lambda n: -poids[n])
verifier(ordre_obtenu[0] == "menu",
         "l'indicateur le plus fort du jeu synthetique ressort premier",
         f"obtenu {ordre_obtenu}")
verifier(poids["menu"] > poids["language"] > poids["price"],
         "l'ordre des trois indicateurs utiles est respecte",
         f"{poids}")
verifier(poids["tourist_zone"] < 0.10,
         "un indicateur qui n'explique rien recoit un poids quasi nul",
         f"{poids['tourist_zone']:.3f}")
verifier(abs(sum(poids.values()) - 1.0) < 1e-6,
         "les poids somment a 1")


# --- Référence indépendante ------------------------------------------------
def _perte(theta_test, X, y):
    """Log-vraisemblance négative, classes repondérées comme dans le module."""
    n = len(y)
    X1 = np.hstack([np.ones((n, 1)), X])
    z = np.clip(X1 @ theta_test, -30, 30)
    p = 1 / (1 + np.exp(-z))
    w = np.where(y == 1, n / (2 * max(y.sum(), 1)), n / (2 * max(n - y.sum(), 1)))
    perte = -np.sum(w * (y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))) / n
    return perte + 0.5 * 0.01 * np.sum(theta_test[1:] ** 2)


reference = minimize(_perte, np.zeros(5), args=(X, y), method="L-BFGS-B").x
ecart = float(np.max(np.abs(theta - reference)))
verifier(ecart < 0.15,
         "les coefficients coincident avec scipy.optimize",
         f"ecart max {ecart:.3f}")


# --- Le petit echantillon, celui qu'on aura vraiment -----------------------
#
# CE TEST DIT CE QU'IL FAUT ATTENDRE DU MODULE EN VRAI. Avec 150 etiquettes,
# quatre coefficients ne se determinent pas : ils flottent. Ce qu'on exige
# alors n'est pas la justesse — impossible a garantir — mais que le module
# DISE qu'il ne sait pas, via des intervalles larges.
from backend.core.scoring.calibration import incertitude

Xp, yp, _ = _jeu_synthetique(n=150, graine=7)
intervalles = incertitude(Xp, yp, tirages=200)
largeurs = {nom: haut - bas for nom, (bas, haut) in intervalles.items()}
verifier(max(largeurs.values()) > 0.20,
         "a 150 exemples, au moins un intervalle est franchement large",
         f"largeurs {largeurs}")
verifier(all(0.0 <= b <= h <= 1.0 for b, h in intervalles.values()),
         "les bornes restent dans [0, 1] et sont ordonnees")

Xg, yg, _ = _jeu_synthetique(n=3000, graine=7)
largeurs_g = {n: h - b for n, (b, h) in incertitude(Xg, yg, tirages=200).items()}
verifier(max(largeurs_g.values()) < max(largeurs.values()),
         "les intervalles se resserrent quand le jeu grandit",
         f"150 -> {max(largeurs.values()):.2f}, 3000 -> {max(largeurs_g.values()):.2f}")


# --- Deséquilibre des classes ----------------------------------------------
# 90 % de negatifs : sans repondération, le modele repond « touristique » a
# tout le monde et n'apprend rien. C'est le piege n°2 du module.
alea = np.random.default_rng(1)
Xd = alea.random((400, 4))
yd = np.zeros(400)
choisis = alea.choice(400, 40, replace=False)
yd[choisis] = 1.0
Xd[choisis, 0] += 0.8          # les positifs ont un `menu` plus eleve
Xd = np.clip(Xd, 0, 1)

poids_d, _ = poids_normalises(regression(Xd, yd))
verifier(poids_d["menu"] > 0.4,
         "une classe a 10 % reste apprise malgre le desequilibre",
         f"menu {poids_d['menu']:.2f}")


# --- Un coefficient negatif est signale, pas masque ------------------------
Xn = alea.random((300, 4))
logit = -3.0 * Xn[:, 1] + 1.0 * Xn[:, 0] - 0.5      # `language` a l'envers
yn = (alea.random(300) < 1 / (1 + np.exp(-logit))).astype(float)
poids_n, alertes_n = poids_normalises(regression(Xn, yn))
verifier(any(nom == "language" for nom, _ in alertes_n),
         "un indicateur qui pointe a l'envers declenche une alerte",
         f"alertes {alertes_n}")
verifier(poids_n["language"] == 0.0,
         "son poids est mis a zero, pas a sa valeur absolue")


# --- Reproductibilite ------------------------------------------------------
verifier(np.allclose(regression(X, y), regression(X, y)),
         "deux executions donnent le meme resultat")


print("\n" + "=" * 74)
if _echecs:
    print(f"{len(_echecs)} ECHEC(S) : {', '.join(_echecs)}")
    raise SystemExit(1)
print("La calibration fait ce qu'elle annonce.")
