# backend/db/export.py
#
# EXPORT DE LA BASE POUR UN TIERS (hébergeur, coéquipier, jury).
#
# POURQUOI CE SCRIPT PLUTÔT QU'ENVOYER LE FICHIER.
#
# `local_signal.db` contient deux tables qui ne sont pas des données de
# recherche mais des traces d'usage : `reservations` porte un nom et une
# adresse e-mail, `consultations` un historique de navigation. Envoyer le
# fichier tel quel transmet ces données personnelles à un tiers, sans base
# légale et sans que la personne concernée l'ait su.
#
# La règle, ici, ne dépend pas du fait que la ligne actuelle soit un test :
# une vérification à l'œil ne tient pas dans le temps. Le script vide ces
# tables systématiquement, et conserve leur schéma pour que l'application
# démarre normalement de l'autre côté.
#
# CE QUI EST TRANSMIS, ET CE QUI NE L'EST PAS.
#
#   transmis      restaurants, menus, tourist_sites — le travail du projet
#   vidé          reservations, consultations — traces d'usage nominatives
#
# Les images de carte ne sont PAS dans la base et ne le seront jamais
# (D-021, D-025) : seules des URL et le texte relevé y figurent. L'export ne
# redistribue donc aucune œuvre — c'est aussi ce qui le rend transmissible.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.export
#     python -m backend.db.export --sortie /chemin/local_signal_partage.db
#     python -m backend.db.export --sql        (dump texte, versionnable)

import argparse
import os
import pathlib
import shutil
import sqlite3

from backend import config

# Traces d'usage : vidées à l'export, jamais transmises.
TABLES_A_VIDER = ("reservations", "consultations")

# Tables de données : ce que le projet a produit et qui a vocation à circuler.
TABLES_DE_DONNEES = ("restaurants", "menus", "tourist_sites")


def _compter(connexion: sqlite3.Connection) -> dict[str, int]:
    """Nombre de lignes par table, pour que l'export dise ce qu'il contient."""
    tables = connexion.execute(
        "select name from sqlite_master where type='table' "
        "and name not like 'sqlite_%' order by name"
    ).fetchall()
    return {
        nom: connexion.execute(f'select count(*) from "{nom}"').fetchone()[0]
        for (nom,) in tables
    }


def exporter(source: str, destination: str) -> dict[str, int]:
    """
    Copie la base, vide les tables nominatives, compacte le fichier.

    La copie passe par `shutil` plutôt que par un `VACUUM INTO` : le fichier
    d'origine reste intact quoi qu'il arrive ensuite, et une erreur pendant le
    nettoyage n'abîme pas la base de travail.
    """
    destination = str(pathlib.Path(destination).resolve())
    if destination == str(pathlib.Path(source).resolve()):
        raise ValueError("La destination ne peut pas être la base de travail.")

    shutil.copy2(source, destination)

    connexion = sqlite3.connect(destination)
    try:
        for table in TABLES_A_VIDER:
            existe = connexion.execute(
                "select 1 from sqlite_master where type='table' and name=?", (table,)
            ).fetchone()
            if existe:
                connexion.execute(f'delete from "{table}"')
        # Remettre les compteurs à zéro : sans ça, les identifiants repartiraient
        # d'un numéro qui trahirait le volume supprimé.
        connexion.execute(
            "delete from sqlite_sequence where name in (%s)"
            % ",".join("?" * len(TABLES_A_VIDER)),
            TABLES_A_VIDER,
        )
        connexion.commit()
        # VACUUM après suppression : sinon les pages libérées gardent les
        # données effacées, lisibles avec un éditeur hexadécimal.
        connexion.execute("VACUUM")
        connexion.commit()
        comptes = _compter(connexion)
    finally:
        connexion.close()

    return comptes


def exporter_sql(source: str, destination: str) -> int:
    """
    Variante en dump SQL texte.

    Utile quand l'hébergeur ne veut pas d'un binaire, ou quand la cible est
    PostgreSQL : un fichier texte se relit et s'adapte, un `.db` non.
    """
    temporaire = destination + ".tmp.db"
    exporter(source, temporaire)

    connexion = sqlite3.connect(temporaire)
    try:
        with open(destination, "w", encoding="utf-8") as sortie:
            lignes = 0
            for instruction in connexion.iterdump():
                sortie.write(instruction + "\n")
                lignes += 1
    finally:
        connexion.close()
        os.remove(temporaire)

    return lignes


def main() -> None:
    analyseur = argparse.ArgumentParser(
        description="Exporte la base pour un tiers, sans les données personnelles."
    )
    analyseur.add_argument(
        "--sortie", default=None,
        help="Chemin du fichier produit (défaut : local_signal_partage.db à la racine).",
    )
    analyseur.add_argument(
        "--sql", action="store_true",
        help="Produire un dump SQL texte plutôt qu'un fichier SQLite.",
    )
    args = analyseur.parse_args()

    racine = pathlib.Path(config.DB_PATH).parent
    defaut = racine / ("local_signal_partage.sql" if args.sql else "local_signal_partage.db")
    sortie = args.sortie or str(defaut)

    if args.sql:
        lignes = exporter_sql(config.DB_PATH, sortie)
        taille = os.path.getsize(sortie) / 1024 / 1024
        print(f"Dump SQL écrit : {sortie}")
        print(f"  {lignes} instructions, {taille:.1f} Mo")
        return

    comptes = exporter(config.DB_PATH, sortie)
    taille = os.path.getsize(sortie) / 1024 / 1024

    print(f"Base exportée : {sortie}  ({taille:.1f} Mo)")
    print()
    for nom in sorted(comptes):
        marque = "  vidée" if nom in TABLES_A_VIDER else ""
        print(f"  {nom:<18} {comptes[nom]:>7d} lignes{marque}")
    print()
    print("Les tables de traces d'usage ont été vidées : ce fichier ne contient")
    print("aucune donnée personnelle et peut être transmis.")


if __name__ == "__main__":
    main()
