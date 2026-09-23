# backend/db/paires.py
#
# COMPARAISON PAR PAIRES (D-043).
#
# POURQUOI CHANGER D'INSTRUMENT. Le pilote D-042 a mesuré un kappa de Fleiss de
# 0,118 sur l'étiquetage en trois classes — accord négligeable. La cause n'est
# pas le panel : 59 % des jugements tombaient dans la même classe. La question
# « si on retirait tous les touristes, ce restaurant survivrait-il ? » est
# ASYMÉTRIQUE — presque tout établissement survit en perdant une partie de son
# chiffre. Elle est décidable, comme le voulait le §3 du protocole, mais elle ne
# SÉPARE pas.
#
# CE QUE LA COMPARAISON RÉSOUT. Demander « entre ces deux-là, lequel dépend le
# plus des visiteurs ? » est une question relative : elle n'a pas de réponse
# par défaut. L'annotateur ne peut pas répondre « local » soixante fois de
# suite, il doit trancher à chaque fois. Deux gains :
#
#   1. L'accord sur des comparaisons est structurellement plus élevé que sur
#      des classes — on n'exige plus que deux personnes placent la même
#      frontière au même endroit, seulement qu'elles ordonnent deux cas.
#   2. L'agrégation produit DIRECTEMENT un classement continu du 1er au dernier.
#      C'est exactement ce que cherche la §5.3 du protocole, et ce dont
#      `precision@10` a besoin (LS-10). Le détour par trois classes était
#      peut-être le problème depuis le début.
#
# LE PLAN DE COMPARAISON, ET POURQUOI IL N'EST PAS ALÉATOIRE. Comparer toutes
# les paires coûte n(n-1)/2 — 435 comparaisons pour 30 restaurants, 108 811
# pour 467. Tirer des paires au hasard est moins cher mais risque de produire
# un graphe NON CONNEXE : deux groupes de restaurants jamais comparés entre eux
# donnent deux classements sans échelle commune, et Bradley-Terry diverge.
#
# On tire donc k permutations aléatoires, et on relie chaque permutation en
# CYCLE. Un cycle est connexe par construction, donc leur union l'est aussi.
# Coût : k × n comparaisons au lieu de n(n-1)/2, et chaque restaurant est vu
# exactement 2k fois — un plan équilibré, ce qu'un tirage au hasard ne garantit
# pas.
#
# LE BIAIS DE POSITION. Un annotateur a tendance à préférer ce qu'on lui montre
# en premier. L'ordre gauche/droite est donc tiré INDÉPENDAMMENT pour chaque
# annotateur, ce qui permet à la fois de neutraliser le biais dans l'agrégat et
# de le MESURER après coup.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.paires --taille 30 --tours 3

import argparse
import json
import random
from pathlib import Path

SORTIE = Path("docs/data/annotation-pilote")

# Graine fixe : le plan doit être reproductible, un jury doit pouvoir le
# régénérer à l'identique.
GRAINE = 20260917


def plan(ids: list[str], tours: int, graine: int = GRAINE) -> list[tuple[str, str]]:
    """k permutations refermées en cycle — connexe, équilibré, reproductible."""
    alea = random.Random(graine)
    vues: set[frozenset[str]] = set()
    paires: list[tuple[str, str]] = []
    for _ in range(tours):
        ordre = ids[:]
        alea.shuffle(ordre)
        for i, gauche in enumerate(ordre):
            droite = ordre[(i + 1) % len(ordre)]
            cle = frozenset((gauche, droite))
            if gauche == droite or cle in vues:
                continue  # un doublon n'apporte pas d'information nouvelle
            vues.add(cle)
            paires.append((gauche, droite))
    return paires


def blocs(ids: list[str], taille: int = 40, chevauchement: int = 8,
          graine: int = GRAINE) -> list[list[str]]:
    """
    Découpe l'échantillon en blocs qui se CHEVAUCHENT.

    POURQUOI DES BLOCS. Un annotateur ne peut pas tenir 467 dossiers en tête —
    ni un humain, ni un modèle. On compare donc à l'intérieur de blocs d'une
    quarantaine d'établissements, ce qui reste lisible d'un seul tenant.

    POURQUOI ILS SE CHEVAUCHENT, ET C'EST TOUT L'ENJEU. Des blocs étanches
    donneraient autant de classements séparés, sans échelle commune : on saurait
    ordonner les restaurants d'un bloc entre eux, jamais un restaurant du bloc 1
    face à un du bloc 7. Les établissements partagés entre deux blocs servent
    d'ANCRES : ils sont jugés dans les deux contextes, et Bradley-Terry s'en sert
    pour aligner les échelles. C'est le même principe qu'un étalon qu'on repèse
    sur chaque balance.

    L'ordre est mélangé avec la graine fixe avant découpage, pour qu'un bloc ne
    corresponde pas à une tranche de l'ordre de tirage — sans quoi les blocs
    seraient homogènes et les comparaisons trop faciles.
    """
    alea = random.Random(graine + 1)
    ordre = ids[:]
    alea.shuffle(ordre)
    pas = taille - chevauchement
    out = []
    for debut in range(0, len(ordre), pas):
        bloc = ordre[debut:debut + taille]
        if len(bloc) < 3:
            if out:                      # un reste trop court rejoint le dernier
                out[-1] = list(dict.fromkeys(out[-1] + bloc))
            continue
        out.append(bloc)
        if debut + taille >= len(ordre):
            break
    return out


def ordre_annotateur(paires, annotateur: str, graine: int = GRAINE):
    """
    Les mêmes paires, gauche/droite tiré au sort pour CET annotateur.

    Deux annotateurs voient donc les mêmes duels dans un ordre différent : le
    biais de position se neutralise dans l'agrégat, et reste mesurable.
    """
    alea = random.Random(f"{graine}-{annotateur}")
    return [(b, a) if alea.random() < 0.5 else (a, b) for a, b in paires]


def main() -> None:
    ap = argparse.ArgumentParser(description="Plan de comparaisons (D-043).")
    ap.add_argument("--taille", type=int, default=30)
    ap.add_argument("--tours", type=int, default=3,
                    help="k : chaque restaurant sera vu 2k fois")
    ap.add_argument("--annotateurs", default="ABCDE")
    ap.add_argument("--blocs", type=int, default=0,
                    help="taille des blocs ; 0 = pas de découpage (petit échantillon)")
    ap.add_argument("--chevauchement", type=int, default=8,
                    help="restaurants partagés entre deux blocs voisins — les ancres")
    ap.add_argument("--sortie", default="paires.json")
    args = ap.parse_args()

    dossiers = json.loads(
        (SORTIE / "dossiers-quartier-latin.json").read_text(encoding="utf-8"))
    ids = list(dossiers)[:args.taille]

    # Sans découpage, tout l'échantillon forme un bloc unique.
    groupes = (blocs(ids, args.blocs, args.chevauchement) if args.blocs
               else [ids])

    paires, appartenance = [], []
    for n, bloc in enumerate(groupes, 1):
        for couple in plan(bloc, args.tours, GRAINE + n):
            paires.append(couple)
            appartenance.append(n)

    SORTIE.mkdir(parents=True, exist_ok=True)
    sortie = {}
    for a in args.annotateurs:
        ordonne = ordre_annotateur(paires, a)
        sortie[a] = [
            {"paire": f"P{i:04d}", "bloc": appartenance[i - 1],
             "gauche": g, "droite": d,
             "nom_gauche": dossiers[g]["nom"], "nom_droite": dossiers[d]["nom"]}
            for i, (g, d) in enumerate(ordonne, 1)
        ]
    chemin = SORTIE / args.sortie
    chemin.write_text(json.dumps(
        {"paires_canoniques": [list(p) for p in paires],
         "bloc_par_paire": appartenance,
         "blocs": [list(b) for b in groupes],
         "par_annotateur": sortie}, ensure_ascii=False, indent=1), encoding="utf-8")

    vus = {i: 0 for i in ids}
    for g, d in paires:
        vus[g] += 1
        vus[d] += 1
    ancres = sum(1 for i in ids if sum(1 for b in groupes if i in b) > 1)
    print(f"[Paires] {chemin}")
    print(f"   {len(ids)} restaurants · {len(groupes)} bloc(s) · {args.tours} tours")
    print(f"   {len(paires)} comparaisons · {ancres} ancres entre blocs")
    print(f"   chaque restaurant vu entre {min(vus.values())} et {max(vus.values())} fois")
    print(f"   {len(args.annotateurs)} annotateurs → {len(paires) * len(args.annotateurs)} jugements")
    print(f"   graine {GRAINE} — le plan est reproductible à l'identique")


if __name__ == "__main__":
    main()
