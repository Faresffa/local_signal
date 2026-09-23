# backend/db/sauvegarde.py
#
# SAUVEGARDE DE LA BASE (LS-26).
#
# CE QU'IL Y A À PERDRE. La base porte 361 cartes lues, 297 prix extraits et
# 2 100 avis collectés. Les cartes représentent des heures de récolte et un
# quota de modèle consommé ; les avis ont été PAYÉS. Rien de tout cela ne se
# reconstitue en relançant un script : les pages web changent, et une
# collecte refaite se refacture.
#
# POURQUOI PAS UNE COPIE DE FICHIER. `copy local_signal.db sauvegarde.db`
# semble suffire et ne l'est pas : si une écriture est en cours, la copie
# attrape une base à moitié écrite, et le journal WAL qui contiendrait la fin
# de la transaction reste, lui, dans l'autre fichier. Le résultat est un
# fichier qui s'ouvre et dont il manque les dernières minutes — la pire forme
# d'échec, celle qu'on ne découvre qu'au moment de restaurer.
#
# `sqlite3.Connection.backup()` est l'API prévue pour ça : elle copie page à
# page en tenant compte des transactions en cours, sur une base ouverte et
# active. C'est la seule façon correcte de sauvegarder SQLite à chaud.
#
# UNE SAUVEGARDE NON VÉRIFIÉE N'EST PAS UNE SAUVEGARDE. Chaque fichier produit
# est rouvert, soumis à `PRAGMA integrity_check`, et ses tables sont comptées.
# Un fichier tronqué serait sinon découvert le jour où il sert.
#
# CE QUI N'EST PAS SAUVEGARDÉ ICI : le corpus d'images (D-038). Il vit hors de
# la base, ne tient pas dans un fichier qu'on envoie, et se sauvegarde par la
# voie de son hébergeur. `--verifier` rappelle son volume pour qu'on ne
# l'oublie pas.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.sauvegarde                # sauvegarde + vérifie
#     python -m backend.db.sauvegarde --verifier     # état, sans rien écrire
#     python -m backend.db.sauvegarde --garder 5     # ne conserver que 5 copies

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from backend import config

DOSSIER = Path("data/sauvegardes")

# Combien de copies on garde. Trois, et c'est un choix : une sauvegarde
# quotidienne gardée trois jours protège d'une panne ; elle ne protège pas
# d'une corruption passée inaperçue une semaine. Le vrai filet contre ça est
# l'export hors machine, que ce script ne fait pas — il faut le dire plutôt
# que de laisser croire le contraire.
GARDER_PAR_DEFAUT = 3

# Tables dont on compte les lignes. Ce sont celles dont la perte coûterait :
# du travail de récolte, de l'argent, ou des données d'utilisateurs.
TABLES_SUIVIES = (
    "restaurants", "menus", "reviews", "user_reviews",
    "menu_submissions", "tourist_sites", "users",
)


def _compter(chemin: Path) -> dict[str, int]:
    """Nombre de lignes par table suivie. Une table absente vaut -1."""
    conn = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
    compte = {}
    for table in TABLES_SUIVIES:
        try:
            compte[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.Error:
            compte[table] = -1
    conn.close()
    return compte


def _integre(chemin: Path) -> bool:
    """`PRAGMA integrity_check` — la base s'ouvre ET se tient."""
    conn = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
    try:
        return conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        conn.close()


def sauvegarder(garder: int = GARDER_PAR_DEFAUT) -> Path:
    """
    Copie la base à chaud, vérifie la copie, et fait le ménage.

    Returns:
        Le chemin de la sauvegarde produite.

    Raises:
        RuntimeError: si la copie ne passe pas la vérification — on préfère
        échouer bruyamment plutôt que laisser un fichier inutilisable porter
        le nom de « sauvegarde ».
    """
    source = Path(config.DB_PATH)
    if not source.exists():
        raise RuntimeError(f"Base introuvable : {source}")

    DOSSIER.mkdir(parents=True, exist_ok=True)
    cible = DOSSIER / f"local_signal-{datetime.now():%Y%m%d-%H%M%S}.db"

    origine = sqlite3.connect(str(source))
    copie = sqlite3.connect(str(cible))
    try:
        # Copie page à page, cohérente même si une écriture est en cours.
        origine.backup(copie)
    finally:
        copie.close()
        origine.close()

    if not _integre(cible):
        cible.unlink(missing_ok=True)
        raise RuntimeError("La copie ne passe pas integrity_check — rien conservé.")

    avant, apres = _compter(source), _compter(cible)
    ecarts = {t: (avant[t], apres[t]) for t in TABLES_SUIVIES if avant[t] != apres[t]}

    taille = cible.stat().st_size / (1024 * 1024)
    print(f"[Sauvegarde] {cible}  ({taille:.1f} Mo)")
    for table in TABLES_SUIVIES:
        if apres[table] >= 0:
            print(f"   {table:20} {apres[table]:>8} lignes")

    if ecarts:
        # Un écart n'est pas forcément une erreur : une écriture a pu arriver
        # entre les deux comptages. On le signale sans échouer.
        print("   ecart pendant la copie (ecriture concurrente) :", ecarts)

    _menage(garder)
    return cible


def _menage(garder: int) -> None:
    """Ne conserve que les `garder` sauvegardes les plus récentes."""
    fichiers = sorted(DOSSIER.glob("local_signal-*.db"), reverse=True)
    for vieux in fichiers[garder:]:
        vieux.unlink()
        print(f"   retiree : {vieux.name}")


def etat() -> None:
    """Affiche ce qui existe, sans rien écrire."""
    source = Path(config.DB_PATH)
    print(f"Base       : {source}")
    if source.exists():
        print(f"             {source.stat().st_size / (1024*1024):.1f} Mo, "
              f"integrite {'ok' if _integre(source) else 'ECHEC'}")
        for table, n in _compter(source).items():
            if n >= 0:
                print(f"   {table:20} {n:>8}")

    print(f"\nSauvegardes : {DOSSIER}")
    fichiers = sorted(DOSSIER.glob("local_signal-*.db"), reverse=True)
    if not fichiers:
        print("             AUCUNE — lancer `python -m backend.db.sauvegarde`")
    for f in fichiers:
        marque = "ok" if _integre(f) else "CORROMPUE"
        print(f"   {f.name}  {f.stat().st_size / (1024*1024):6.1f} Mo  {marque}")

    corpus = Path(config.CORPUS_DIR)
    if corpus.exists():
        fics = [x for x in corpus.rglob("*") if x.is_file()]
        octets = sum(x.stat().st_size for x in fics)
        print(f"\nCorpus d'images (D-038) : {len(fics)} fichiers, "
              f"{octets / (1024*1024):.1f} Mo")
        print("   NON couvert par cette sauvegarde — il vit hors de la base.")


def main() -> None:
    a = argparse.ArgumentParser(description="Sauvegarde la base (LS-26).")
    a.add_argument("--verifier", action="store_true",
                   help="afficher l'etat sans rien ecrire")
    a.add_argument("--garder", type=int, default=GARDER_PAR_DEFAUT,
                   help=f"nombre de copies conservees (defaut : {GARDER_PAR_DEFAUT})")
    args = a.parse_args()

    if args.verifier:
        etat()
        return

    sauvegarder(args.garder)
    print("\nRAPPEL : ces copies sont sur la MEME machine que la base. Elles")
    print("protegent d'une fausse manoeuvre, pas d'une panne de disque. Copier")
    print("la derniere ailleurs reste a faire a la main.")


if __name__ == "__main__":
    main()
