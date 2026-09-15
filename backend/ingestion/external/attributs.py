# backend/ingestion/external/attributs.py
#
# IMPORT DES ATTRIBUTS DÉJÀ PAYÉS ET JAMAIS LUS (LS-41).
#
# CE QU'ON AVAIT SANS LE SAVOIR. Les fiches du collecteur, récoltées en
# septembre et conservées en JSON brut (D-029), portent bien plus que les six
# champs qu'on en avait tirés. Sur 398 restaurants de la zone témoin :
#
#   subtypes        397     catégories Google du lieu
#   about           393     services, ambiance, clientèle, offre
#   category        354     catégorie principale
#   description     186     texte de présentation
#   popular_times   138     grille 7 jours × 24 h de fréquentation
#
# Tout cela était sur le disque. Le relire ne coûte pas un appel réseau.
#
# UNE SUBTILITÉ QUI CHANGE TOUT DANS L'INTERPRÉTATION. Google n'enregistre un
# attribut QUE lorsqu'il est vrai. « Ambiance / Branché » apparaît 133 fois et
# n'est jamais faux. L'absence ne signifie donc pas « non », mais « non
# renseigné ». Un attribut absent ne prouve rien, et tout code qui lit ces
# données doit raisonner en PRÉSENCE, jamais en booléen.
#
# POURQUOI UNE TABLE CLÉ-VALEUR plutôt que des colonnes. Il y a plus de cent
# attributs distincts, la liste dépend de ce que Google sait de chaque lieu, et
# elle change sans prévenir. Cent colonnes majoritairement vides seraient
# ingérables ; une ligne par attribut présent se requête aussi bien et ne casse
# rien quand un nouvel attribut apparaît.
#
# À QUOI ÇA SERT, DANS L'ORDRE :
#   1. La pré-annotation de la vérité terrain (LS-08) — ces attributs
#      n'entrent dans AUCUN des quatre indicateurs, ils ne sont donc pas
#      circulaires.
#   2. Les filtres produit — terrasse, accessibilité en fauteuil, végétarien,
#      réservation : autant de critères réels qu'on affichait comme
#      indisponibles alors que la donnée dormait sur le disque.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.ingestion.external.attributs
#     python -m backend.ingestion.external.attributs --zone quartier-latin

import argparse
import glob
import json
import sqlite3
from collections import Counter

from backend.db.models import get_connection

DOSSIER = "data/collecte"


def _charger_fiches() -> dict:
    """Toutes les fiches brutes disponibles, indexées par `place_id`."""
    fiches = {}
    for chemin in sorted(glob.glob(f"{DOSSIER}/fiches-*.json")):
        try:
            contenu = json.load(open(chemin, encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        def visiter(o):
            if isinstance(o, dict):
                if o.get("place_id"):
                    # Le fichier le plus récent gagne : une fiche relue plus
                    # tard décrit mieux l'établissement qu'une fiche ancienne.
                    fiches[o["place_id"]] = o
                for v in o.values():
                    visiter(v)
            elif isinstance(o, list):
                for x in o:
                    visiter(x)

        visiter(contenu)
    return fiches


def _creer_tables(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS restaurant_attributs (
            restaurant_id TEXT NOT NULL,
            section       TEXT NOT NULL,
            cle           TEXT NOT NULL,
            PRIMARY KEY (restaurant_id, section, cle)
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_attributs_cle "
        "ON restaurant_attributs (section, cle)"
    )
    # `popular_times` est une grille, pas un attribut : elle reste en JSON sur
    # la fiche du restaurant plutôt que d'être éclatée en 168 lignes.
    for colonne, type_sql in (("popular_times", "TEXT"),
                              ("subtypes", "TEXT"),
                              ("google_category", "TEXT"),
                              ("google_description", "TEXT")):
        try:
            conn.execute(f"ALTER TABLE restaurants ADD COLUMN {colonne} {type_sql}")
        except sqlite3.OperationalError:
            pass  # colonne déjà là


def importer(zone: str | None = None) -> dict:
    fiches = _charger_fiches()
    conn = get_connection()
    _creer_tables(conn)

    sql = ("SELECT id, google_place_id FROM restaurants "
           "WHERE google_place_id IS NOT NULL AND google_place_id != ''")
    params = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)

    cibles = conn.execute(sql, params).fetchall()
    stats = Counter()
    sections = Counter()

    for rid, pid in cibles:
        fiche = fiches.get(pid)
        if not fiche:
            stats["sans fiche"] += 1
            continue
        stats["apparies"] += 1

        # On réécrit les attributs de ce restaurant : rejouer l'import ne doit
        # pas accumuler, et un attribut retiré chez Google doit disparaître.
        conn.execute("DELETE FROM restaurant_attributs WHERE restaurant_id = ?", (rid,))

        about = fiche.get("about")
        if isinstance(about, dict):
            for section, contenu in about.items():
                if not isinstance(contenu, dict):
                    continue
                for cle, valeur in contenu.items():
                    # PRÉSENCE, pas booléen : on n'enregistre que ce qui est
                    # vrai, parce que c'est tout ce que Google affirme.
                    if valeur:
                        conn.execute(
                            "INSERT OR IGNORE INTO restaurant_attributs "
                            "(restaurant_id, section, cle) VALUES (?, ?, ?)",
                            (rid, section, cle),
                        )
                        sections[section] += 1
                        stats["attributs"] += 1

        maj = {}
        if fiche.get("popular_times"):
            maj["popular_times"] = json.dumps(fiche["popular_times"], ensure_ascii=False)
            stats["popular_times"] += 1
        if fiche.get("subtypes"):
            maj["subtypes"] = str(fiche["subtypes"])
            stats["subtypes"] += 1
        if fiche.get("category"):
            maj["google_category"] = str(fiche["category"])
        if fiche.get("description"):
            maj["google_description"] = str(fiche["description"])

        if maj:
            affect = ", ".join(f"{k} = ?" for k in maj)
            conn.execute(f"UPDATE restaurants SET {affect} WHERE id = ?",
                         [*maj.values(), rid])

    conn.commit()

    print(f"[Attributs] {stats['apparies']} restaurants apparies "
          f"sur {len(cibles)} ({stats['sans fiche']} sans fiche brute)")
    print(f"[Attributs] {stats['attributs']} attributs importes, "
          f"{stats['popular_times']} grilles de frequentation")
    print("\nSections :")
    for s, n in sections.most_common(12):
        print(f"   {n:5}  {s}")

    conn.close()
    return dict(stats)


def main() -> None:
    a = argparse.ArgumentParser(description="Importe les attributs des fiches (LS-41).")
    a.add_argument("--zone", default=None, help="restreindre a une zone")
    importer(a.parse_args().zone)


if __name__ == "__main__":
    main()
