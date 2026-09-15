# backend/db/preannotation.py
#
# PRÉ-ANNOTATION DE LA VÉRITÉ TERRAIN (LS-08).
#
# CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS.
#
#   c'est        une proposition d'étiquette, avec les indices qui l'ont produite
#   ce n'est pas une vérité terrain
#
# La vérité terrain reste ce qu'un humain décide. Ce module fait le travail
# fastidieux — ouvrir 467 fiches, lire les attributs, poser une première
# hypothèse — pour que la relecture porte sur « suis-je d'accord ? » plutôt que
# sur une page blanche.
#
# LA RÈGLE QUI REND CE MODULE ACCEPTABLE : AUCUN INDICE UTILISÉ ICI N'ENTRE
# DANS LE SCORE.
#
#   interdit ici              parce que
#   ────────────────────────  ────────────────────────────────────────────────
#   la carte, les plats       c'est l'indicateur menu (0,40)
#   la langue des avis        c'est l'indicateur langue (0,30)
#   le prix                   c'est l'indicateur prix (0,15)
#   la distance aux monuments c'est l'indicateur de zone (0,15)
#   la note Google            c'est la référence contre laquelle on se compare
#   le nombre d'avis          c'est la popularité, que le projet récuse (D-001)
#
# Étiqueter avec la carte puis mesurer que l'indicateur menu prédit l'étiquette
# ne démontrerait rien : le résultat serait acquis d'avance. Et étiqueter avec
# la note Google ferait gagner Google à `precision@10` par construction.
#
# CE QUI RESTE, ET QUI EST LÉGITIME : les attributs que Google publie sur la
# CLIENTÈLE et les USAGES du lieu (LS-41), plus la grille de fréquentation.
# Aucun n'est dans le modèle.
#
# LE MEILLEUR INDICE EST LA FRÉQUENTATION, et il mérite son explication. Un
# habitué déjeune près de chez lui ou de son travail, en semaine. Un visiteur
# vient le week-end et le soir. Le rapport entre le midi de semaine et le
# week-end sépare donc deux publics sans rien dire de la cuisine, du prix ni de
# l'emplacement. Il n'est disponible que pour 138 restaurants sur 467 — Google
# ne le calcule qu'au-delà d'un certain trafic — ce qui est en soi un biais à
# rapporter : les plus discrets n'en ont pas.
#
# CE QUE LE PANEL DOIT SAVOIR EN RELISANT. Une proposition affichée est
# difficile à contredire. Si le taux de correction tombe sous 10 %, ce n'est pas
# que la machine avait raison, c'est que l'ancrage a joué. `--comparer` mesure
# ce taux après coup, précisément pour pouvoir le dire.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.preannotation --zone quartier-latin
#     python -m backend.db.preannotation --comparer docs/data/verite-terrain-quartier-latin.csv

import argparse
import csv
import json
import sqlite3
from pathlib import Path

from backend.db.models import get_connection

# ---------------------------------------------------------------------------
# LES INDICES, ET LEUR POIDS.
#
# Positif tire vers « touristique », négatif vers « local ». Les valeurs sont
# posées à la main — c'est assumé : cet objet n'est pas un modèle calibré, c'est
# une aide à la relecture. Elles ne servent JAMAIS à pondérer le Local Signal.
# ---------------------------------------------------------------------------
INDICES = {
    # --- vers le touristique ---
    ("Clientèle", "Touristes"): (
        +2.0, "Google signale une clientèle de touristes"),
    ("Clientèle", "Groupes"): (
        +1.0, "accueille des groupes — cars et sorties organisées"),
    ("Ambiance", "Romantique"): (
        +0.6, "positionné « romantique » — repas de destination"),
    ("Ambiance", "Haut de gamme"): (
        +0.6, "positionné haut de gamme"),
    ("Ambiance", "Historique"): (
        +1.0, "mis en avant comme lieu historique"),
    ("Points forts", "Vue panoramique"): (
        +1.0, "vendu pour sa vue"),

    # --- vers le local ---
    ("Populaire pour", "Petit déjeuner"): (
        -1.0, "fréquenté au petit-déjeuner — habitude de quartier"),
    ("Populaire pour", "Dîner en solo"): (
        -0.8, "dîners en solo — plutôt des habitués que des visiteurs"),
    ("Ambiance", "Calme"): (
        -0.5, "ambiance calme"),
    ("Services disponibles", "Livraison"): (
        -1.0, "fait de la livraison — on livre des riverains, pas des touristes"),
    ("Services disponibles", "Vente à emporter"): (
        -0.4, "vente à emporter"),
    ("Populaire pour", "Adapté au travail sur un ordinateur portable"): (
        -0.8, "on y travaille — clientèle qui revient"),
}

# ---------------------------------------------------------------------------
# UN ATTRIBUT PARTAGÉ PAR TOUT LE QUARTIER NE DISTINGUE PERSONNE.
#
# Premier jet, sans cette correction : 25 restaurants sur 467 proposés
# « local », soit 5 % — alors que c'est la classe qui porte tout le projet.
# Cause mesurée : « Clientèle / Touristes » est présent chez 304 restaurants
# sur 467 (65 %) et pesait +2,0. Il décrivait le Quartier latin, pas le
# restaurant. Même chose pour « Dîner en solo », présent chez 325 (70 %), qui
# n'était plus qu'un décalage constant vers le local.
#
# Chaque poids est donc multiplié par `log(N / n)` — la pondération par
# fréquence inverse, la même idée qu'en recherche documentaire, où un mot
# présent dans tous les documents ne sert à rien pour les distinguer. Un
# attribut présent partout tend vers zéro, un attribut rare garde son poids.
#
# Conséquence assumée : les poids effectifs dépendent de la zone. C'est
# voulu — « fréquenté par des touristes » ne dit pas la même chose dans le
# Quartier latin qu'à Montreuil.
# ---------------------------------------------------------------------------

# Sous cette fréquence, un attribut est trop rare pour qu'on lui fasse
# confiance : `log(N/n)` lui donnerait un poids énorme sur trois observations.
FREQUENCE_MINIMALE = 5


def poids_effectifs(conn: sqlite3.Connection, zone: str) -> dict:
    """Poids corrigés par la rareté de chaque attribut dans la zone."""
    import math

    total = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE zone = ?", (zone,)
    ).fetchone()[0]

    effectifs = {}
    for cle, (poids, phrase) in INDICES.items():
        section, attribut = cle
        n = conn.execute("""
            SELECT COUNT(*) FROM restaurant_attributs a
              JOIN restaurants r ON r.id = a.restaurant_id
             WHERE r.zone = ? AND a.section = ? AND a.cle = ?
        """, (zone, section, attribut)).fetchone()[0]

        if n < FREQUENCE_MINIMALE:
            continue
        rarete = math.log(total / n)
        effectifs[cle] = (poids * rarete, phrase, n, round(rarete, 2))

    return effectifs


# LES SEUILS SONT DES TERCILES, pas des constantes.
#
# Un seuil fixe sur un score dont l'échelle dépend des poids effectifs — donc
# de la zone — n'aurait aucun sens. On classe, puis on coupe en trois parts.
#
# CE QUE ÇA IMPOSE, ET IL FAUT LE DIRE : trois classes d'un tiers chacune. La
# réalité du Quartier latin n'est probablement pas 33/33/33. Mais c'est une
# PROPOSITION à corriger, et une proposition qui ne classerait que 5 % en
# « local » interdirait à l'annotateur d'y voir autre chose. Le découpage est
# un point de départ, pas une mesure.
TERCILES = (1 / 3, 2 / 3)

# En dessous de ce nombre d'indices, on ne propose rien. Une étiquette tirée
# d'un seul attribut n'est pas une hypothèse, c'est un tirage au sort avec une
# mise en forme rassurante.
INDICES_MINIMUM = 2



# ---------------------------------------------------------------------------
# DEUX SOURCES DE PLUS, DÉJÀ SUR LE DISQUE (LS-41).
#
# `subtypes` — les catégories que Google attribue au lieu, présentes pour 397
# restaurants sur 398. La plupart ne disent que la cuisine et ne servent à rien
# ici : « Restaurant italien » ne dit pas si les clients sont du quartier. On ne
# garde que celles qui parlent d'un USAGE.
#
# `google_description` — le texte éditorial de Google, 189 restaurants. C'est
# de la prose, pas des cases à cocher : on n'y cherche que des marqueurs
# univoques. « Créé en 1845 » signale une institution qu'on visite ; « à
# emporter » signale une habitude de quartier.
#
# PRUDENCE SUR CETTE DEUXIÈME SOURCE. Chercher des mots dans un texte
# publicitaire, c'est fabriquer un classifieur de plus, à la main, avec mes
# propres partis pris. On s'en tient donc à une poignée de marqueurs dont le
# sens ne se discute pas, et on MESURE si l'ajout change quelque chose — plutôt
# que de supposer que plus de signaux valent mieux.
# ---------------------------------------------------------------------------

SUBTYPES_INDICES = {
    "restaurant gastronomique": (+1.0, "classé « gastronomique » — on s'y déplace"),
    "attraction touristique": (+2.0, "Google le classe en attraction touristique"),
    "restaurant de plats à emporter": (-1.0, "classé « à emporter »"),
    "pizzas à emporter": (-0.8, "pizzas à emporter"),
    "traiteur": (-0.8, "traiteur — clientèle qui repasse"),
    "restaurant familial": (-0.5, "classé « familial »"),
    "cantine": (-1.2, "classé « cantine »"),
    "café": (-0.5, "café — on y revient"),
}

# Marqueurs dans la description. Le sens doit être univoque : rien
# d'interprétable ne rentre ici.
DESCRIPTION_INDICES = {
    "vue sur": (+1.0, "vendu pour la vue"),
    "touristique": (+1.5, "décrit comme touristique"),
    "institution": (+1.2, "décrit comme une institution"),
    "depuis 18": (+1.0, "établissement ancien, mis en avant comme tel"),
    "créé en 18": (+1.0, "établissement ancien, mis en avant comme tel"),
    "à emporter": (-0.8, "mis en avant pour la vente à emporter"),
    "de quartier": (-1.5, "décrit comme un restaurant de quartier"),
    "habitués": (-1.5, "la description parle d'habitués"),
}


def _indices_texte(conn: sqlite3.Connection, restaurant_id: str) -> list:
    """Indices tirés des catégories Google et du texte éditorial."""
    ligne = conn.execute(
        "SELECT subtypes, google_description FROM restaurants WHERE id = ?",
        (restaurant_id,),
    ).fetchone()
    if not ligne:
        return []

    trouves = []
    sous = (ligne[0] or "").lower()
    for motif, (poids, phrase) in SUBTYPES_INDICES.items():
        if motif in sous:
            trouves.append((poids, phrase))

    texte = (ligne[1] or "").lower()
    for motif, (poids, phrase) in DESCRIPTION_INDICES.items():
        if motif in texte:
            trouves.append((poids, phrase))

    return trouves

def frequentation(grille_json: str | None) -> tuple[float | None, str]:
    """
    Rapport entre le midi de semaine et le week-end, à partir de la grille.

    Rend une valeur entre -1 (tout en semaine, midi) et +1 (tout le week-end),
    et la phrase qui l'explique. `None` quand la grille manque ou est vide —
    ce qui est le cas pour les deux tiers des restaurants.
    """
    if not grille_json:
        return None, ""
    try:
        grille = json.loads(grille_json)
    except (TypeError, json.JSONDecodeError):
        return None, ""

    semaine_midi = weekend = 0
    for jour in grille:
        if not isinstance(jour, dict):
            continue
        numero = jour.get("day")
        for creneau in jour.get("popular_times") or []:
            part = creneau.get("percentage") or 0
            heure = creneau.get("hour")
            if numero in (6, 7):                      # samedi, dimanche
                weekend += part
            elif heure is not None and 11 <= heure <= 14:
                semaine_midi += part

    total = semaine_midi + weekend
    if total < 50:            # trop peu de trafic mesuré pour conclure
        return None, ""

    # +1 tout le week-end, -1 tout le midi de semaine.
    ratio = (weekend - semaine_midi) / total
    if ratio > 0.25:
        return ratio, "fréquentation surtout le week-end"
    if ratio < -0.25:
        return ratio, "fréquenté au déjeuner en semaine — clientèle de proximité"
    return ratio, "fréquentation également répartie semaine / week-end"


def score_brut(conn: sqlite3.Connection, restaurant_id: str,
               effectifs: dict) -> tuple[float, list]:
    """Score continu et indices en clair. Positif = plutôt touristique."""
    attributs = {
        (r[0], r[1]) for r in conn.execute(
            "SELECT section, cle FROM restaurant_attributs WHERE restaurant_id = ?",
            (restaurant_id,))
    }
    ligne = conn.execute(
        "SELECT popular_times FROM restaurants WHERE id = ?", (restaurant_id,)
    ).fetchone()

    score = 0.0
    preuves = []

    for cle, (poids, phrase, n, rarete) in effectifs.items():
        if cle in attributs:
            score += poids
            preuves.append(f"{poids:+.2f} {phrase}")

    for poids, phrase in _indices_texte(conn, restaurant_id):
        score += poids
        preuves.append(f"{poids:+.2f} {phrase}")

    ratio, phrase = frequentation(ligne[0] if ligne else None)
    if ratio is not None:
        # La fréquentation pèse le double d'un attribut ordinaire : c'est une
        # mesure de comportement, pas une étiquette déclarative.
        # La fréquentation pèse le double d'un attribut ordinaire : c'est une
        # mesure de comportement, pas une étiquette déclarative.
        poids = ratio * 2
        score += poids
        preuves.append(f"{poids:+.2f} {phrase}")

    return score, preuves


def exporter(zone: str, sortie: Path) -> dict:
    """
    DEUX PASSES, ET C'EST NÉCESSAIRE. On ne peut pas décider d'une étiquette
    en voyant un seul restaurant : les seuils sont des terciles de la zone. On
    score donc tout le monde, puis on coupe.
    """
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    restos = [dict(r) for r in conn.execute("""
        SELECT id, name, address FROM restaurants
         WHERE zone = ? ORDER BY substr(hex(id), -6), id
    """, (zone,))]

    effectifs = poids_effectifs(conn, zone)
    print("[Pre-annotation] poids corriges par la rarete :")
    for (section, cle), (poids, _, n, rarete) in sorted(
            effectifs.items(), key=lambda x: -abs(x[1][0])):
        print(f"   {poids:+6.2f}  {section} / {cle[:38]:40} "
              f"{n:4} restaurants  (x{rarete})")
    print()

    # Passe 1 — scorer.
    calcules = {}
    for r in restos:
        score, preuves = score_brut(conn, r["id"], effectifs)
        calcules[r["id"]] = (score, preuves)

    # Passe 2 — les terciles, calcules sur les seuls restaurants jugeables.
    jugeables = sorted(s for rid, (s, p) in calcules.items()
                       if len(p) >= INDICES_MINIMUM)
    if jugeables:
        bas = jugeables[int(len(jugeables) * TERCILES[0])]
        haut = jugeables[int(len(jugeables) * TERCILES[1])]
    else:
        bas = haut = 0.0
    print(f"[Pre-annotation] terciles sur {len(jugeables)} restaurants jugeables : "
          f"local <= {bas:.2f} < mixte < {haut:.2f} <= touristique")
    print()

    from urllib.parse import quote_plus
    compte = {"touristique": 0, "local": 0, "mixte": 0, "": 0}

    sortie.parent.mkdir(parents=True, exist_ok=True)
    with sortie.open("w", encoding="utf-8-sig", newline="") as f:
        plume = csv.writer(f, delimiter=";")
        plume.writerow([
            "rang", "id", "nom", "adresse", "lien",
            "proposition", "confiance", "indices",
            "etiquette_finale", "corrigee", "remarque",
        ])
        for rang, r in enumerate(restos, 1):
            score, preuves = calcules[r["id"]]

            if len(preuves) < INDICES_MINIMUM:
                # Une étiquette tirée d'un seul attribut n'est pas une
                # hypothèse, c'est un tirage au sort mis en forme.
                etiquette, confiance = "", ""
                indices = "pas assez d'indices — a juger a la main"
            else:
                etiquette = ("local" if score <= bas
                             else "touristique" if score >= haut else "mixte")
                marge = min(abs(score - bas), abs(score - haut))
                confiance = ("forte" if marge >= 0.6
                             else "moyenne" if marge >= 0.25 else "faible")
                indices = f"[{score:+.2f}] " + " · ".join(preuves)

            compte[etiquette] = compte.get(etiquette, 0) + 1
            requete = quote_plus(f"{r['name']} {r.get('address') or ''}".strip())
            plume.writerow([
                rang, r["id"], r["name"], r.get("address") or "",
                f"https://www.google.com/maps/search/{requete}",
                etiquette, confiance, indices,
                # `etiquette_finale` est ce que l'humain décide. Vide au départ,
                # et VOLONTAIREMENT pas pré-remplie avec la proposition : la
                # recopier serait la faire passer pour un choix.
                "", "", "",
            ])

    conn.close()
    total = len(restos)
    print(f"[Pre-annotation] {sortie}  ({total} restaurants)\n")
    for etiquette in ("local", "mixte", "touristique"):
        n = compte.get(etiquette, 0)
        print(f"   {etiquette:12} {n:4}  ({100*n/total:4.1f} %)")
    print(f"   {'sans avis':12} {compte.get('', 0):4}  "
          f"({100*compte.get('', 0)/total:4.1f} %)  a juger a la main")
    print("\n   `etiquette_finale` est VIDE : c'est a l'humain de la remplir.")
    print("   La proposition est a cote, avec les indices qui l'ont produite.")
    return compte


def comparer(chemin: str) -> dict:
    """Taux de correction — le garde-fou contre l'ancrage."""
    accord = corrige = vide = 0
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        for ligne in csv.DictReader(f, delimiter=";"):
            prop = (ligne.get("proposition") or "").strip().lower()
            final = (ligne.get("etiquette_finale") or "").strip().lower()
            if not final:
                vide += 1
            elif final == prop:
                accord += 1
            else:
                corrige += 1

    juges = accord + corrige
    print(f"[Pre-annotation] {juges} restaurants juges, {vide} restants")
    if juges:
        taux = 100 * corrige / juges
        print(f"   corriges : {corrige} ({taux:.1f} %)   confirmes : {accord}")
        if taux < 10:
            print("\n   MOINS DE 10 % DE CORRECTIONS. A ne pas lire comme une")
            print("   reussite de la machine : une proposition affichee est")
            print("   difficile a contredire. Reprendre un echantillon en")
            print("   masquant la colonne `proposition` pour verifier.")
    return {"accord": accord, "corrige": corrige, "vide": vide}


def main() -> None:
    a = argparse.ArgumentParser(description="Pre-annotation de la verite terrain.")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--sortie", default=None)
    a.add_argument("--comparer", metavar="CSV",
                   help="mesurer le taux de correction d'un fichier relu")
    args = a.parse_args()

    if args.comparer:
        comparer(args.comparer)
    else:
        sortie = Path(args.sortie or f"docs/data/verite-terrain-{args.zone}.csv")
        exporter(args.zone, sortie)


if __name__ == "__main__":
    main()
