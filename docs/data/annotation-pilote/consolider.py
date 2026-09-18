# Consolidation du pilote d'annotation à cinq agents.
#
# Produit les deux chiffres qui décident de la suite :
#   - l'accord inter-annotateurs (kappa de Fleiss, et accord par paire)
#   - le taux de correction face à la pré-annotation machine (§6 du protocole)
#
# Usage : python consolider.py

import csv
import itertools
import os
from collections import Counter

S = os.path.dirname(os.path.abspath(__file__))
REPO = r"C:\hetic\Local signal"
AGENTS = {
    "A": "riverain",
    "B": "voyageur",
    "C": "restaurateur",
    "D": "journaliste",
    "E": "sceptique",
}
ETIQUETTES = ("local", "mixte", "touristique", "je ne sais pas")
TRANCHANTES = ETIQUETTES[:3]


def lire(lettre):
    """Les annotations d'un agent, indexées par id."""
    chemin = os.path.join(S, f"annot_{lettre}.csv")
    if not os.path.exists(chemin):
        return None
    out = {}
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        for ligne in csv.DictReader(f, delimiter=";"):
            e = (ligne.get("etiquette") or "").strip().lower()
            if e not in ETIQUETTES:
                e = "je ne sais pas"
            out[ligne["id"].strip()] = {
                "etiquette": e,
                "confiance": (ligne.get("confiance") or "").strip().lower(),
                "justification": (ligne.get("justification") or "").strip(),
                "sources": (ligne.get("sources") or "").strip(),
            }
    return out


def kappa_fleiss(matrice, categories):
    """
    Kappa de Fleiss : accord observé corrigé de l'accord dû au hasard.

    `matrice` : une liste de Counter, un par sujet, comptant les votes.
    Les sujets qui n'ont pas reçu le même nombre de votes sont écartés.
    """
    n = len(categories)
    sujets = [m for m in matrice if sum(m.values()) > 1]
    if not sujets:
        return None
    k = sum(sujets[0].values())
    sujets = [m for m in sujets if sum(m.values()) == k]
    N = len(sujets)
    if N == 0:
        return None

    # P_i : proportion de paires d'annotateurs en accord sur le sujet i
    P = [(sum(c * c for c in m.values()) - k) / (k * (k - 1)) for m in sujets]
    P_barre = sum(P) / N
    # p_j : proportion globale d'attributions à la catégorie j
    p = [sum(m.get(cat, 0) for m in sujets) / (N * k) for cat in categories]
    P_e = sum(x * x for x in p)
    if P_e == 1:
        return None
    return (P_barre - P_e) / (1 - P_e)


def lire_source():
    """Le CSV d'origine : la pré-annotation machine, pour la comparaison."""
    chemin = os.path.join(REPO, "docs", "data", "verite-terrain-quartier-latin.csv")
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return {l["id"]: l for l in csv.DictReader(f, delimiter=";")}


def main():
    source = lire_source()
    annots = {l: lire(l) for l in AGENTS}
    manquants = [l for l, a in annots.items() if a is None]
    if manquants:
        print(f"Agents sans fichier : {', '.join(manquants)} — consolidation partielle.")
    annots = {l: a for l, a in annots.items() if a}
    if not annots:
        print("Aucune annotation trouvée.")
        return

    ids = [i for i in source if any(i in a for a in annots.values())]
    ids.sort(key=lambda i: int(source[i]["rang"]))

    # ---- 1. Ce que chaque annotateur a répondu ----------------------------
    print("=" * 74)
    print("RÉPARTITION PAR ANNOTATEUR")
    print("=" * 74)
    print(f"{'agent':<16}{'local':>8}{'mixte':>8}{'tourist.':>10}{'?':>6}{'n':>6}")
    for l, profil in AGENTS.items():
        if l not in annots:
            continue
        c = Counter(v["etiquette"] for v in annots[l].values())
        print(f"{l} {profil:<14}{c['local']:>8}{c['mixte']:>8}"
              f"{c['touristique']:>10}{c['je ne sais pas']:>6}{len(annots[l]):>6}")

    # ---- 2. Accord ---------------------------------------------------------
    print()
    print("=" * 74)
    print("ACCORD INTER-ANNOTATEURS")
    print("=" * 74)
    lettres = sorted(annots)
    for a, b in itertools.combinations(lettres, 2):
        communs = [i for i in ids if i in annots[a] and i in annots[b]]
        if not communs:
            continue
        acc = sum(1 for i in communs
                  if annots[a][i]["etiquette"] == annots[b][i]["etiquette"])
        print(f"  {a}–{b}  {acc}/{len(communs)}  ({acc / len(communs):.0%})")

    matrice = []
    for i in ids:
        votes = Counter(annots[l][i]["etiquette"] for l in lettres if i in annots[l])
        matrice.append(votes)
    kf = kappa_fleiss(matrice, ETIQUETTES)
    print()
    print(f"  Kappa de Fleiss (4 catégories) : "
          f"{kf:.3f}" if kf is not None else "  Kappa non calculable")
    if kf is not None:
        echelle = ("nul" if kf < 0 else "négligeable" if kf < 0.20 else
                   "faible" if kf < 0.40 else "modéré" if kf < 0.60 else
                   "substantiel" if kf < 0.80 else "presque parfait")
        print(f"  Lecture (échelle de Landis & Koch) : accord {echelle}")

    # ---- 3. Consensus ------------------------------------------------------
    print()
    print("=" * 74)
    print("CONSENSUS")
    print("=" * 74)
    consensus, forces = {}, Counter()
    for i in ids:
        votes = Counter(annots[l][i]["etiquette"] for l in lettres if i in annots[l])
        tranchants = Counter({k: v for k, v in votes.items() if k in TRANCHANTES})
        total = sum(tranchants.values())
        if not total:
            consensus[i] = ("je ne sais pas", 0, 0)
            forces["aucun avis tranché"] += 1
            continue
        top, n = tranchants.most_common(1)[0]
        ex_aequo = sum(1 for v in tranchants.values() if v == n) > 1
        if ex_aequo:
            consensus[i] = ("contesté", n, total)
            forces["contesté (ex aequo)"] += 1
        else:
            consensus[i] = (top, n, total)
            forces[f"{n}/{total}"] += 1
    for k, v in sorted(forces.items()):
        print(f"  {k:<22}{v:>4}")
    c = Counter(v[0] for v in consensus.values())
    print(f"\n  Étiquettes retenues : local {c['local']}, mixte {c['mixte']}, "
          f"touristique {c['touristique']}, contesté {c['contesté']}, "
          f"indécidable {c['je ne sais pas']}")

    # ---- 4. Face à la pré-annotation machine (§6, ancrage) -----------------
    print()
    print("=" * 74)
    print("FACE À LA PRÉ-ANNOTATION MACHINE (jugement à l'aveugle)")
    print("=" * 74)
    comparables = [i for i in ids
                   if (source[i]["proposition"] or "").strip() in TRANCHANTES
                   and consensus[i][0] in TRANCHANTES]
    if comparables:
        d_accord = sum(1 for i in comparables
                       if source[i]["proposition"].strip() == consensus[i][0])
        taux = 1 - d_accord / len(comparables)
        print(f"  Comparables : {len(comparables)} restaurants")
        print(f"  Accord      : {d_accord}/{len(comparables)} ({d_accord / len(comparables):.0%})")
        print(f"  Taux de correction : {taux:.0%}")
        print("  (§6 : sous 10 %, ce serait de l'ancrage — ici le jugement est aveugle,")
        print("   donc ce taux mesure un désaccord réel, pas une docilité.)")
    else:
        print("  Pas de recouvrement exploitable.")

    # ---- 5. Sortie ---------------------------------------------------------
    chemin = os.path.join(S, "consolide.csv")
    with open(chemin, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        entete = ["rang", "id", "nom", "adresse", "lien"]
        for l in lettres:
            entete += [f"etiquette_{l}", f"confiance_{l}"]
        entete += ["consensus", "votes", "proposition_machine", "accord_machine",
                   "justifications"]
        w.writerow(entete)
        for i in ids:
            s = source[i]
            ligne = [s["rang"], i, s["nom"], s["adresse"], s["lien"]]
            for l in lettres:
                v = annots[l].get(i, {})
                ligne += [v.get("etiquette", ""), v.get("confiance", "")]
            cons, n, tot = consensus[i]
            prop = (s["proposition"] or "").strip()
            ligne += [
                cons, f"{n}/{tot}" if tot else "",
                prop,
                "oui" if prop and prop == cons else ("non" if prop and cons in TRANCHANTES else ""),
                " | ".join(f"{l}: {annots[l][i]['justification']}"
                           for l in lettres if i in annots[l]),
            ]
            w.writerow(ligne)
    print(f"\nÉcrit : {chemin}")


if __name__ == "__main__":
    main()
