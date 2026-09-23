# backend/db/bradley_terry.py
#
# DU DUEL AU CLASSEMENT (D-043).
#
# CE QUE CE MODULE FAIT. Il prend des jugements par paires — « entre ces deux
# restaurants, lequel dépend le plus des visiteurs ? » — et en tire un
# classement continu du 1ᵉʳ au dernier, avec une force estimée pour chacun.
#
# POURQUOI BRADLEY-TERRY. Compter les victoires ne suffit pas : un restaurant
# qui gagne trois duels faciles n'est pas mieux placé qu'un autre qui en perd
# deux contre les plus touristiques de la zone. Le modèle de Bradley-Terry
# (1952) attribue à chaque objet une force θ telle que
#
#     P(i l'emporte sur j) = exp(θi) / (exp(θi) + exp(θj))
#
# et estime les θ qui rendent les duels observés les plus vraisemblables. La
# force d'un adversaire est donc prise en compte. C'est le modèle standard du
# classement par comparaisons, celui dont Elo est un cas particulier.
#
# POURQUOI PAS SCIKIT-LEARN. Comme pour `calibration.py` : la dépendance n'est
# pas installée, elle alourdirait le déploiement pour une optimisation convexe
# de trente lignes, et le jury peut lire ces trente lignes.
#
# LA RÉGULARISATION N'EST PAS UN DÉTAIL. Un restaurant qui gagne TOUS ses duels
# a une vraisemblance maximisée par θ → +∞ : le modèle diverge. C'est le cas de
# séparation complète, fréquent sur un petit échantillon. Un terme L2 borne les
# θ et rend le résultat lisible. Il introduit un biais vers zéro, assumé et
# rapporté.
#
# CE QUE LE MODULE MESURE AVANT DE CLASSER, ET QUI COMPTE AUTANT :
#
#   1. L'ACCORD INTER-ANNOTATEURS sur les duels. C'est le chiffre qui dit si
#      l'instrument fonctionne. Le pilote D-042, sur étiquettes en trois
#      classes, avait mesuré un kappa de 0,118 — accord négligeable. Si la
#      comparaison par paires ne fait pas mieux, ce n'est pas la peine de
#      classer quoi que ce soit.
#   2. LE BIAIS DE POSITION. Un annotateur préfère ce qu'on lui montre en
#      premier. L'ordre gauche/droite ayant été tiré indépendamment pour chacun
#      (`paires.py`), un excès systématique de « A » le trahit.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.bradley_terry

import argparse
import csv
import json
import math
from collections import Counter
from itertools import combinations
from pathlib import Path

import numpy as np

DOSSIER = Path("docs/data/annotation-pilote")

# Force la régularisation L2. Assez faible pour ne pas écraser le signal,
# assez forte pour empêcher la divergence sur un objet invaincu.
LAMBDA = 0.30
ITERATIONS = 3000
PAS = 0.05


def charger_blocs(plan_nom: str, racine: Path,
                  annotateurs: str = "ABCD") -> tuple[dict, dict]:
    """
    Les jugements d'une campagne découpée en blocs.

    Chaque bloc a été soumis séparément (`missions.py`), mais les blocs se
    chevauchent : les restaurants partagés servent d'ancres et Bradley-Terry
    aligne les échelles à travers elles. On rassemble donc tous les blocs rendus
    en un seul jeu de duels — c'est l'union qui porte le classement, pas chaque
    bloc pris à part.
    """
    plan = json.loads((DOSSIER / plan_nom).read_text(encoding="utf-8"))
    dossiers = json.loads(
        (DOSSIER / "dossiers-quartier-latin.json").read_text(encoding="utf-8"))

    jugements: dict[str, dict[str, str]] = {a: {} for a in annotateurs}
    for a in annotateurs:
        vu = {p["paire"]: p for p in plan["par_annotateur"][a]}
        for chemin in sorted(racine.glob(f"b*_{a}.csv")):
            for ligne in csv.DictReader(chemin.open(encoding="utf-8-sig"), delimiter=";"):
                pid = (ligne.get("paire") or "").strip()
                choix = (ligne.get("choix") or "").strip().lower()
                if pid not in vu:
                    continue
                if choix == "a":
                    jugements[a][pid] = vu[pid]["gauche"]
                elif choix == "b":
                    jugements[a][pid] = vu[pid]["droite"]
                else:
                    jugements[a][pid] = "egalite"
    return ({"plan": plan, "noms": {i: d["nom"] for i, d in dossiers.items()}},
            {a: v for a, v in jugements.items() if v})


def charger(annotateurs: str = "ABCDE",
            prefixe: str = "paires") -> tuple[dict, dict]:
    """
    Le plan de comparaison et les jugements, ramenés aux ids canoniques.

    `prefixe` choisit la campagne : `paires` pour les jugements rendus sur la
    seule base, `paires2` pour ceux rendus sur dossier enrichi d'une recherche
    web. Le plan de comparaison est le MÊME dans les deux cas — c'est ce qui
    rend les deux campagnes directement comparables, duel par duel.
    """
    plan = json.loads((DOSSIER / "paires.json").read_text(encoding="utf-8"))
    dossiers = json.loads(
        (DOSSIER / "dossiers-quartier-latin.json").read_text(encoding="utf-8"))

    jugements: dict[str, dict[str, str]] = {}
    for a in annotateurs:
        chemin = DOSSIER / f"{prefixe}-{a}.csv"
        if not chemin.exists():
            continue
        # Chaque annotateur a vu les paires dans SON ordre : on retraduit son
        # « A » ou « B » en identifiant de restaurant, sans quoi les réponses
        # de deux annotateurs ne sont pas comparables.
        vu = {p["paire"]: p for p in plan["par_annotateur"][a]}
        rendu = {}
        for ligne in csv.DictReader(chemin.open(encoding="utf-8-sig"), delimiter=";"):
            pid = (ligne.get("paire") or "").strip()
            choix = (ligne.get("choix") or "").strip().lower()
            if pid not in vu:
                continue
            if choix == "a":
                rendu[pid] = vu[pid]["gauche"]
            elif choix == "b":
                rendu[pid] = vu[pid]["droite"]
            else:
                rendu[pid] = "egalite"
        jugements[a] = rendu
    return {"plan": plan, "noms": {i: d["nom"] for i, d in dossiers.items()}}, jugements


def accord(jugements: dict) -> dict:
    """
    Accord inter-annotateurs sur les duels, et kappa.

    Le « gagnant » est un identifiant de restaurant, donc directement
    comparable entre annotateurs quel que soit l'ordre dans lequel chacun a vu
    la paire. C'est tout l'intérêt d'avoir retraduit.
    """
    lettres = sorted(jugements)
    paires_communes = set.intersection(*(set(jugements[a]) for a in lettres)) \
        if lettres else set()

    par_paire = {}
    for a, b in combinations(lettres, 2):
        communs = [p for p in paires_communes]
        d = sum(1 for p in communs if jugements[a][p] == jugements[b][p])
        par_paire[f"{a}-{b}"] = (d, len(communs))

    # Kappa de Fleiss sur le gagnant. Deux catégories utiles par duel — les
    # deux restaurants en lice — plus l'égalité. Les catégories changent d'un
    # duel à l'autre, on les code donc en « position canonique » : le premier
    # id de la paire, le second, ou l'égalité.
    matrice = []
    for pid in sorted(paires_communes):
        votes = Counter()
        for a in lettres:
            g = jugements[a][pid]
            votes[g] += 1
        matrice.append(votes)

    k = len(lettres)
    N = len(matrice)
    if N == 0 or k < 2:
        return {"par_paire": par_paire, "kappa": None, "n": 0}

    # P_i : proportion de paires d'annotateurs d'accord sur ce duel.
    P = [(sum(c * c for c in m.values()) - k) / (k * (k - 1)) for m in matrice]
    P_barre = sum(P) / N
    # Accord attendu par hasard : sur un duel, deux issues équiprobables a
    # priori — c'est la référence honnête pour une comparaison forcée.
    P_e = 0.5
    kappa = (P_barre - P_e) / (1 - P_e)

    observe = sum(d for d, _ in par_paire.values())
    total = sum(t for _, t in par_paire.values())
    return {
        "par_paire": par_paire, "kappa": kappa, "n": N,
        "accord_observe": observe / total if total else None,
        "P_barre": P_barre,
    }


def biais_position(donnees: dict, jugements: dict) -> dict:
    """Part de « la case de gauche » dans les réponses de chaque annotateur."""
    out = {}
    for a, rendu in jugements.items():
        vu = {p["paire"]: p for p in donnees["plan"]["par_annotateur"][a]}
        gauche = sum(1 for pid, g in rendu.items()
                     if pid in vu and g == vu[pid]["gauche"])
        tranches = sum(1 for g in rendu.values() if g != "egalite")
        out[a] = gauche / tranches if tranches else None
    return out


def ajuster(ids: list[str], duels: list[tuple[str, str, float]]) -> np.ndarray:
    """
    Descente de gradient sur la log-vraisemblance de Bradley-Terry.

    `duels` : (gagnant, perdant, poids). Une égalité entre in et j est versée
    comme deux demi-victoires — la façon standard de traiter un nul.
    """
    index = {i: k for k, i in enumerate(ids)}
    theta = np.zeros(len(ids))
    for _ in range(ITERATIONS):
        grad = np.zeros(len(ids))
        for gagnant, perdant, poids in duels:
            g, p = index[gagnant], index[perdant]
            # P(gagnant l'emporte) sous le modèle courant
            ecart = theta[g] - theta[p]
            attendu = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, ecart))))
            grad[g] += poids * (1 - attendu)
            grad[p] -= poids * (1 - attendu)
        grad -= LAMBDA * theta          # régularisation L2
        theta += PAS * grad / max(1, len(duels))
        theta -= theta.mean()           # l'échelle est relative : on l'ancre
    return theta


def classer(donnees: dict, jugements: dict) -> list[dict]:
    """
    Le classement final — du plus local au plus dépendant des visiteurs.

    ATTENTION, ce filtre n'est pas cosmétique. On ne classe QUE les restaurants
    qui ont réellement été comparés. Un objet jamais jugé garde θ = 0 par
    l'effet de la régularisation, ce qui le placerait au MILIEU du classement
    comme s'il était moyen — alors qu'on n'en sait rien. Sur une campagne
    partielle, ce serait la faute la plus grave du module : inventer une
    position pour ce qui n'a pas été mesuré.
    """
    vus = set()
    for a, rendu in jugements.items():
        vu_a = {p["paire"]: p for p in donnees["plan"]["par_annotateur"][a]}
        for pid in rendu:
            if pid in vu_a:
                vus.add(vu_a[pid]["gauche"])
                vus.add(vu_a[pid]["droite"])
    ids = sorted(vus)
    duels: list[tuple[str, str, float]] = []
    victoires = Counter()
    apparitions = Counter()

    for a, rendu in jugements.items():
        vu = {p["paire"]: p for p in donnees["plan"]["par_annotateur"][a]}
        for pid, gagnant in rendu.items():
            if pid not in vu:
                continue
            g, d = vu[pid]["gauche"], vu[pid]["droite"]
            apparitions[g] += 1
            apparitions[d] += 1
            if gagnant == "egalite":
                duels.append((g, d, 0.5))
                duels.append((d, g, 0.5))
                victoires[g] += 0.5
                victoires[d] += 0.5
            else:
                perdant = d if gagnant == g else g
                duels.append((gagnant, perdant, 1.0))
                victoires[gagnant] += 1

    theta = ajuster(ids, duels)
    # θ élevé = l'emporte souvent au jeu « dépend le plus des visiteurs »,
    # donc PLUS touristique. On classe du plus local au moins local : θ croissant.
    ordre = sorted(range(len(ids)), key=lambda k: theta[k])
    return [{
        "rang": r,
        "id": ids[k],
        "nom": donnees["noms"].get(ids[k], ids[k]),
        "theta": round(float(theta[k]), 4),
        "victoires": round(victoires[ids[k]], 1),
        "duels": apparitions[ids[k]],
    } for r, k in enumerate(ordre, 1)]


def main() -> None:
    ap = argparse.ArgumentParser(description="Classement par comparaisons (D-043).")
    ap.add_argument("--campagne", choices=("base", "web"), default="base",
                    help="base : jugements sur la seule base · "
                         "web : jugements sur dossier enrichi d'une recherche web")
    ap.add_argument("--annotateurs", default=None,
                    help="par defaut ABCDE en pilote, ABCD en campagne par blocs")
    # LA CAMPAGNE PAR BLOCS N'ETAIT PAS BRANCHEE SUR LA LIGNE DE COMMANDE.
    # `charger_blocs` existait mais n'etait appele de nulle part : lancer le
    # module sans option agregeait le pilote de 30 restaurants et ecrasait
    # `classement-base.csv`, en donnant l'impression d'avoir traite les 467.
    ap.add_argument("--blocs", action="store_true",
                    help="agreger la campagne par blocs (duels-467/) au lieu du pilote")
    ap.add_argument("--plan", default="paires-467.json")
    ap.add_argument("--racine", default="duels-467")
    ap.add_argument("--sortie", default=None)
    args = ap.parse_args()

    if args.blocs:
        annotateurs = args.annotateurs or "ABCD"
        donnees, jugements = charger_blocs(args.plan, DOSSIER / args.racine,
                                           annotateurs)
        nom_sortie = args.sortie or "classement-467"
    else:
        annotateurs = args.annotateurs or "ABCDE"
        prefixe = "paires" if args.campagne == "base" else "paires2"
        donnees, jugements = charger(annotateurs, prefixe)
        nom_sortie = args.sortie or f"classement-{args.campagne}"

    if not jugements:
        print("Aucun jugement trouve.")
        return

    print(f"Annotateurs trouvés : {', '.join(sorted(jugements))}")
    for a, r in sorted(jugements.items()):
        c = Counter("egalite" if g == "egalite" else "tranché" for g in r.values())
        print(f"   {a} : {len(r)} duels · {c['tranché']} tranchés · {c['egalite']} égalités")

    acc = accord(jugements)
    print("\n" + "=" * 70)
    print("ACCORD INTER-ANNOTATEURS SUR LES DUELS")
    print("=" * 70)
    for cle, (d, t) in sorted(acc["par_paire"].items()):
        print(f"   {cle}  {d}/{t}  ({d / t:.0%})" if t else f"   {cle}  —")
    if acc["kappa"] is not None:
        print(f"\n   accord observé, toutes paires : {acc['accord_observe']:.0%}")
        print(f"   accord attendu par hasard     : 50 %")
        print(f"   KAPPA                         : {acc['kappa']:.3f}")
        e = acc["kappa"]
        lecture = ("négligeable" if e < 0.20 else "faible" if e < 0.40 else
                   "modéré" if e < 0.60 else "substantiel" if e < 0.80 else
                   "presque parfait")
        print(f"   lecture (Landis & Koch)       : accord {lecture}")
        print(f"\n   Référence : l'étiquetage en 3 classes (D-042) donnait 0,118.")

    print("\n" + "=" * 70)
    print("BIAIS DE POSITION  (part de réponses « celui de gauche »)")
    print("=" * 70)
    for a, part in sorted(biais_position(donnees, jugements).items()):
        if part is None:
            continue
        marque = "  <-- suspect" if abs(part - 0.5) > 0.15 else ""
        print(f"   {a} : {part:.0%}{marque}")
    print("   50 % = aucun biais. L'ordre ayant été tiré indépendamment pour")
    print("   chaque annotateur, un écart marqué trahit un effet de position.")

    rang = classer(donnees, jugements)
    chemin = DOSSIER / f"{nom_sortie}.csv"
    with chemin.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["rang", "id", "nom", "theta", "victoires", "duels"])
        for r in rang:
            w.writerow([r["rang"], r["id"], r["nom"], r["theta"],
                        r["victoires"], r["duels"]])

    print("\n" + "=" * 70)
    print("CLASSEMENT  (1 = le plus local, dernier = le plus dépendant du passage)")
    print("=" * 70)
    for r in rang[:8]:
        print(f"   {r['rang']:>2}. {r['nom'][:34]:<34} θ={r['theta']:+.3f}  "
              f"{r['victoires']:.1f}/{r['duels']}")
    print("   ...")
    for r in rang[-5:]:
        print(f"   {r['rang']:>2}. {r['nom'][:34]:<34} θ={r['theta']:+.3f}  "
              f"{r['victoires']:.1f}/{r['duels']}")
    print(f"\nÉcrit : {chemin}")


if __name__ == "__main__":
    main()
