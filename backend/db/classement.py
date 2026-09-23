# backend/db/classement.py
#
# CLASSEMENT DE RÉFÉRENCE, DU 1ᵉʳ AU DERNIER (LS-08).
#
# À QUOI ÇA SERT. Les étiquettes en trois classes laissent 150 restaurants
# indistincts à l'intérieur de chaque classe. Un classement continu les
# départage, sert de point de départ à l'annotation humaine, et donne un ordre
# contre lequel comparer le nôtre.
#
# CE QUE CE N'EST PAS : le Local Signal. Aucun des quatre indicateurs du modèle
# n'entre ici. C'est un deuxième avis, construit autrement, pour pouvoir
# confronter le premier.
#
# ---------------------------------------------------------------------------
# CE QUI A ÉTÉ TESTÉ, ET CE QUI A ÉTÉ ÉCARTÉ
#
# Toutes les pistes ci-dessous ont été mesurées contre la part d'avis français
# (médiane globale : 55,6 %). Ce contrôle n'est PAS une validation — la langue
# des avis est l'un de nos indicateurs, s'en servir pour valider serait
# circulaire. C'est un garde-fou : un signal qui irait à l'exact opposé serait
# suspect, un signal qui ne bouge pas n'apporte rien.
#
#   ÉCARTÉ — auteurs récurrents           55,6 % contre 55,6 %, aucune séparation
#   ÉCARTÉ — auteurs « résidents »        +5,7 pts sur 45 restaurants seulement,
#                                          19 auteurs identifiés sur 5 639 :
#                                          l'idée tient, l'échantillon non
#   ÉCARTÉ — saisonnalité des avis        fenêtre trop étroite (tri « newest »)
#   ÉCARTÉ — durée typique du repas       55,6 / 50,0 / 55,6, rien
#   ÉCARTÉ — fourchette de prix Google    renseignée 5 fois sur 402
#   RETENU — attributs Google (about)     voir preannotation.py
#   RETENU — grille de fréquentation      le meilleur des attributs
#   RETENU — marqueurs de texte           +11 pts sur 63 restaurants
#   RETENU — `reviews_tags`               jusqu'à −38 pts, 317 restaurants
#
# Écrire les échecs ici a un but : sans eux, le prochain qui lit ce fichier
# refera les mêmes tests.
#
# ---------------------------------------------------------------------------
# L'AVERTISSEMENT QUI DOIT FIGURER DANS LE MÉMOIRE
#
# `reviews_tags` est à la fois le signal le plus fort et le plus contaminé.
# Ce sont les plats et les mots que les clients citent : ils recoupent la CARTE
# (indicateur menu, 0,40) et dépendent de QUI écrit (indicateur langue, 0,30).
#
# Conséquence : un classement bâti dessus, utilisé ensuite pour évaluer nos
# indicateurs, gonflerait le résultat. Deux garde-fous :
#
#   1. Ce classement ne produit PAS l'étiquette finale. Il propose ; les cinq
#      annotateurs décident.
#   2. Le taux de correction est mesuré (`preannotation.py --comparer`). S'il
#      tombe sous 10 %, l'humain a suivi au lieu de trancher, et la
#      contamination passe quand même.
#
# ET UNE HONNÊTETÉ DE PLUS : les tags retenus ci-dessous ont été choisis APRÈS
# avoir vu leur corrélation avec la part d'avis français. Le choix n'est donc
# pas indépendant des données. Les poids, eux, sont posés sur le sens — un
# escargot n'est pas plus touristique parce que la mesure le dit, mais parce
# que c'est un plat de carte à touristes — et non recopiés de la mesure.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.classement --zone quartier-latin

import argparse
import csv
import glob
import json
import re
import sqlite3
from pathlib import Path
from urllib.parse import quote_plus

from backend.db.models import get_connection
from backend.db.preannotation import (
    INDICES_MINIMUM, frequentation, poids_effectifs, score_brut,
)

# ---------------------------------------------------------------------------
# TAGS GOOGLE. Positif = touristique.
#
# Les plats du bas de liste forment le menu type de l'attrape-touristes
# parisien : escargots, soupe à l'oignon, bœuf bourguignon, confit de canard,
# crème brûlée. Ce n'est pas une intuition — c'est ce que vend une carte écrite
# pour quelqu'un qui passe une fois.
# ---------------------------------------------------------------------------
TAGS = {
    "escargots": (+1.2, "les avis parlent d'escargots"),
    "chair d'escargot": (+1.2, "les avis parlent d'escargots"),
    "soupe à l'oignon": (+1.0, "les avis parlent de soupe à l'oignon"),
    "bœuf bourguignon": (+0.9, "les avis parlent de bœuf bourguignon"),
    "confit de canard": (+0.9, "les avis parlent de confit de canard"),
    "crème brûlée": (+0.8, "les avis parlent de crème brûlée"),
    "cuisine française": (+0.6, "les avis parlent de « cuisine française » en bloc"),
    "notre dame": (+1.0, "les avis citent Notre-Dame"),
    "touristes": (+0.9, "les avis parlent de touristes"),
    "tour eiffel": (+1.0, "les avis citent la tour Eiffel"),
    "louvre": (+0.8, "les avis citent le Louvre"),
    "panthéon": (+0.6, "les avis citent le Panthéon"),
}

# Marqueurs dans le texte des avis. Seule la famille « habitués / quartier »
# a montré une séparation utile (+11 points) ; la famille inverse
# (« attrape-touristes », « séjour ») donnait +2, c'est-à-dire rien.
MARQUEURS_LOCAL = [
    (r"habitu[eé]s?\b", "un avis parle d'habitués"),
    (r"(?:mon|notre|le) quartier", "un avis parle du quartier"),
    (r"notre cantine|cantine du", "un avis l'appelle « cantine »"),
    (r"j['e]y (?:vais|retourne) (?:souvent|r[eé]guli)", "un avis dit y retourner souvent"),
    (r"depuis (?:des|plusieurs) ann[eé]es", "un avis parle d'années de fidélité"),
    (r"\bregulars?\b|local spot|neighbou?rhood", "un avis anglophone parle d'habitués"),
]
POIDS_MARQUEUR = -0.8


def _fiches_brutes() -> dict:
    """Fiches du collecteur, indexées par `place_id`, avec leurs avis."""
    out = {}
    for chemin in sorted(glob.glob("data/collecte/*.json")):
        try:
            contenu = json.load(open(chemin, encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        def visiter(o):
            if isinstance(o, dict):
                if o.get("place_id"):
                    ancienne = out.get(o["place_id"], {})
                    # On fusionne : un fichier porte les avis, l'autre les
                    # attributs. Prendre le dernier écraserait le premier.
                    out[o["place_id"]] = {**ancienne, **{k: v for k, v in o.items() if v}}
                    return
                for v in o.values():
                    visiter(v)
            elif isinstance(o, list):
                for x in o:
                    visiter(x)

        visiter(contenu)
    return out


def indices_avis(fiche: dict) -> list:
    """Indices tirés des tags Google et du texte des avis."""
    trouves = []

    tags = {str(t).lower().strip() for t in (fiche.get("reviews_tags") or [])}
    for tag, (poids, phrase) in TAGS.items():
        if tag in tags:
            trouves.append((poids, phrase))

    # Un marqueur ne compte qu'UNE FOIS par restaurant, quel que soit le nombre
    # d'avis qui le portent : sinon un restaurant très commenté accumulerait du
    # poids par volume, c'est-à-dire par popularité (D-001).
    textes = " ".join((a.get("review_text") or "").lower()
                      for a in (fiche.get("reviews_data") or []))
    for motif, phrase in MARQUEURS_LOCAL:
        if re.search(motif, textes):
            trouves.append((POIDS_MARQUEUR, phrase))
            break

    return trouves


def classer(zone: str) -> list:
    """Le classement complet, du plus local au plus touristique."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    restos = [dict(r) for r in conn.execute("""
        SELECT id, name, address, google_place_id FROM restaurants
         WHERE zone = ? ORDER BY substr(hex(id), -6), id
    """, (zone,))]

    effectifs = poids_effectifs(conn, zone)
    fiches = _fiches_brutes()

    lignes = []
    for r in restos:
        score, preuves = score_brut(conn, r["id"], effectifs)
        fiche = fiches.get(r.get("google_place_id") or "")
        if fiche:
            for poids, phrase in indices_avis(fiche):
                score += poids
                preuves.append(f"{poids:+.2f} {phrase}")
        lignes.append({**r, "score": score, "preuves": preuves})

    conn.close()
    # Du plus local (score le plus bas) au plus touristique.
    lignes.sort(key=lambda x: (x["score"], x["name"] or ""))
    for rang, ligne in enumerate(lignes, 1):
        ligne["rang"] = rang
    return lignes


def exporter(zone: str, sortie: Path) -> dict:
    lignes = classer(zone)
    jugeables = [l for l in lignes if len(l["preuves"]) >= INDICES_MINIMUM]

    sortie.parent.mkdir(parents=True, exist_ok=True)
    with sortie.open("w", encoding="utf-8-sig", newline="") as f:
        plume = csv.writer(f, delimiter=";")
        plume.writerow(["rang", "id", "nom", "adresse", "lien", "score",
                        "indices", "etiquette_finale", "remarque"])
        for l in lignes:
            requete = quote_plus(f"{l['name']} {l.get('address') or ''}".strip())
            assez = len(l["preuves"]) >= INDICES_MINIMUM
            plume.writerow([
                l["rang"], l["id"], l["name"], l.get("address") or "",
                f"https://www.google.com/maps/search/{requete}",
                f"{l['score']:.2f}" if assez else "",
                " · ".join(l["preuves"]) if assez
                else "pas assez d'indices — a juger a la main",
                "", "",
            ])

    print(f"[Classement] {sortie}  ({len(lignes)} restaurants)")
    print(f"   {len(jugeables)} avec assez d'indices, "
          f"{len(lignes) - len(jugeables)} a juger a la main\n")
    print("   Les 8 plus LOCAUX :")
    for l in jugeables[:8]:
        print(f"      {l['rang']:>3}. {l['name'][:32]:34} {l['score']:+6.2f}")
    print("\n   Les 8 plus TOURISTIQUES :")
    for l in jugeables[-8:]:
        print(f"      {l['rang']:>3}. {l['name'][:32]:34} {l['score']:+6.2f}")
    return {"total": len(lignes), "jugeables": len(jugeables)}


def main() -> None:
    a = argparse.ArgumentParser(description="Classement de reference (LS-08).")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--sortie", default=None)
    args = a.parse_args()
    exporter(args.zone,
             Path(args.sortie or f"docs/data/classement-{args.zone}.csv"))


if __name__ == "__main__":
    main()
