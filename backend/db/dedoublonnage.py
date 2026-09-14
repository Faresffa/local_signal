# backend/db/dedoublonnage.py
#
# FUSION DES LIGNES EN DOUBLE (LS-04).
#
# D'OÙ VIENNENT LES DOUBLONS. OpenStreetMap décrit un même restaurant de deux
# façons : un point (`node`) posé sur la devanture, et un contour de bâtiment
# (`way`) qui porte les mêmes étiquettes. Les deux sont légitimes chez eux ;
# chez nous ils deviennent deux lignes, deux cartes de résultat, et un
# utilisateur qui croit voir deux adresses.
#
# COMMENT ON RECONNAÎT UN DOUBLON. Le même nom, à moins de 40 mètres, ET pas
# d'adresses qui se contredisent. Le seuil de distance n'est pas arbitraire :
# l'écart entre un point de devanture et le centroïde de son bâtiment dépasse
# rarement 20 m.
#
# LA DISTANCE SEULE NE SUFFIT PAS, et c'est une correction, pas une précaution
# théorique. Le premier plan de fusion proposait 47 paires ; en les relisant,
# trois étaient fausses. « Maison de Gyros » à 39,9 m sur deux rues qui se
# croisent, « Saveurs d'Asie » à 5,4 m mais rue Monge d'un côté et rue des
# Boulangers de l'autre. Fusionner aurait effacé des établissements qui
# existent. Quand les deux lignes nomment des rues DIFFÉRENTES, on ne fusionne
# pas : on le signale et on laisse trancher un humain. 44 paires restent.
#
# ON FUSIONNE, ON NE SUPPRIME PAS. C'est le point important. Plusieurs paires
# ont chaque ligne portant une information que l'autre n'a pas — l'une a le
# site web, l'autre les horaires. Supprimer la plus pauvre perdrait ses
# champs. La ligne conservée reçoit donc l'UNION des champs renseignés.
#
# LES RATTACHEMENTS SUIVENT. Cartes lues, avis collectés, avis d'utilisateurs,
# soumissions de carte : tout ce qui pointait vers la ligne supprimée pointe
# désormais vers celle qui reste. Sans cela, fusionner détruirait des données
# payées — c'est le contraire du but.
#
# À BLANC PAR DÉFAUT. Une opération qui efface des lignes ne s'exécute pas
# parce qu'on a tapé une commande trop vite. `--appliquer` est explicite, et
# le script refuse de tourner sans sauvegarde récente.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.dedoublonnage                 # montre le plan
#     python -m backend.db.dedoublonnage --appliquer     # fusionne
#     python -m backend.db.dedoublonnage --zone paris    # restreint

import argparse
import math
import re
import sqlite3
import unicodedata
from collections import defaultdict
from pathlib import Path

from backend import config
from backend.db.models import get_connection

# Deux lignes du même nom à moins de cette distance sont le même établissement.
RAYON_M = 40

# Champs fusionnés : la ligne conservée prend celui de l'autre s'il lui manque.
CHAMPS_FUSIONNES = (
    "cuisine", "website", "phone", "price", "opening_hours", "address", "city",
    "menu_url", "google_place_id", "photo_ref", "photo_url", "reservation_url",
    "rating", "review_count", "menu_photo_urls", "price_range", "photos_count",
    "tourist_flag", "price_detail", "external_source", "external_at",
)

# Tables dont les lignes pointent vers un restaurant.
RATTACHEMENTS = (
    "menus", "reviews", "user_reviews", "menu_submissions",
    "consultations", "reservations",
)


def _rue(adresse: str | None) -> str:
    """
    La rue d'une adresse, normalisée — sans numéro, sans accent, sans casse.

    Rend une chaîne vide quand il n'y a pas de rue identifiable : « 10 » tout
    seul n'en est pas une, et comparer des chaînes vides ferait passer deux
    adresses inconnues pour identiques.
    """
    if not adresse:
        return ""
    texte = unicodedata.normalize("NFKD", str(adresse))
    texte = "".join(c for c in texte if not unicodedata.combining(c)).lower()
    texte = re.sub(r"^\s*\d+\s*(bis|ter|quater)?[,\s]*", "", texte)  # numéro
    texte = re.sub(r",.*$", "", texte)                                  # code postal, ville
    texte = re.sub(r"[^a-z\s]", " ", texte)
    texte = re.sub(r"\s+", " ", texte).strip()
    return texte if len(texte) >= 5 else ""


def _rues_incompatibles(a: dict, b: dict) -> bool:
    """
    Vrai si les deux lignes affirment des rues DIFFÉRENTES.

    C'EST LE GARDE-FOU QUI MANQUAIT. La distance seule ne suffit pas : deux
    boutiques d'une même enseigne peuvent être à 40 m l'une de l'autre, sur
    deux rues qui se croisent. Cas réel trouvé en relisant le plan de fusion —
    « Maison de Gyros », rue Xavier Privas et rue de la Harpe, 39,9 m. Les
    fusionner aurait effacé un établissement qui existe.

    Une rue inconnue d'un côté ne prouve rien : on ne bloque que lorsque les
    DEUX sont connues et se contredisent.
    """
    ra, rb = _rue(a.get("address")), _rue(b.get("address"))
    return bool(ra) and bool(rb) and ra != rb


def _metres(lat1, lng1, lat2, lng2) -> float:
    """Distance plane. À 40 m près, la courbure de la Terre ne compte pas."""
    dlat = (lat2 - lat1) * 111_320
    dlng = (lng2 - lng1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlng)


def _richesse(ligne: dict) -> int:
    """Nombre de champs renseignés. Départage laquelle des deux on garde."""
    return sum(1 for champ in CHAMPS_FUSIONNES if ligne.get(champ) not in (None, ""))


def _rattachements(conn, restaurant_id: str) -> int:
    """Combien de lignes pointent vers ce restaurant, toutes tables confondues."""
    total = 0
    for table in RATTACHEMENTS:
        try:
            total += conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE restaurant_id = ?",
                (restaurant_id,),
            ).fetchone()[0]
        except sqlite3.Error:
            pass
    return total


def paires(conn, zone: str | None = None,
           ecartees: list | None = None) -> list[tuple]:
    """
    Paires (garde, supprime, distance) prêtes à fusionner.

    LA LIGNE CONSERVÉE EST LA PLUS RENSEIGNÉE, puis celle qui porte le plus de
    rattachements, puis la plus petite par identifiant. Les deux premiers
    critères minimisent le travail de report ; le troisième rend l'opération
    reproductible — sans lui, deux exécutions pourraient garder des lignes
    différentes selon l'ordre de parcours de la base.
    """
    conn.row_factory = sqlite3.Row
    sql = "SELECT * FROM restaurants WHERE name IS NOT NULL AND name != ''"
    params = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)

    par_nom = defaultdict(list)
    for ligne in conn.execute(sql, params):
        d = dict(ligne)
        par_nom[d["name"].strip().lower()].append(d)

    resultat = []
    deja_supprimes = set()

    for groupe in par_nom.values():
        if len(groupe) < 2:
            continue
        for i in range(len(groupe)):
            for j in range(i + 1, len(groupe)):
                a, b = groupe[i], groupe[j]
                if a["id"] in deja_supprimes or b["id"] in deja_supprimes:
                    continue
                d = _metres(a["lat"], a["lng"], b["lat"], b["lng"])
                if d > RAYON_M:
                    continue
                if _rues_incompatibles(a, b):
                    # Même nom, même quartier, rues différentes : deux adresses
                    # d'une même enseigne. On ne fusionne pas, on le signale.
                    if ecartees is not None:
                        ecartees.append((a, b, d))
                    continue

                cle = lambda r: (_richesse(r), _rattachements(conn, r["id"]), r["id"])
                garde, supprime = (a, b) if cle(a) >= cle(b) else (b, a)
                resultat.append((garde, supprime, d))
                deja_supprimes.add(supprime["id"])

    return resultat


def fusionner(conn, garde: dict, supprime: dict) -> dict:
    """
    Reporte ce qui manque, déplace les rattachements, supprime le doublon.

    Returns:
        {"champs": [...], "rattachements": n} — ce qui a été récupéré.
    """
    champs_repris = [
        champ for champ in CHAMPS_FUSIONNES
        if garde.get(champ) in (None, "") and supprime.get(champ) not in (None, "")
    ]

    if champs_repris:
        affectations = ", ".join(f"{c} = ?" for c in champs_repris)
        conn.execute(
            f"UPDATE restaurants SET {affectations} WHERE id = ?",
            [supprime[c] for c in champs_repris] + [garde["id"]],
        )

    deplaces = 0
    for table in RATTACHEMENTS:
        try:
            curseur = conn.execute(
                f"UPDATE {table} SET restaurant_id = ? WHERE restaurant_id = ?",
                (garde["id"], supprime["id"]),
            )
            deplaces += curseur.rowcount
        except sqlite3.IntegrityError:
            # Contrainte d'unicité : la ligne conservée a déjà l'équivalent.
            # Exemple réel : le même utilisateur a laissé un avis sur les deux
            # fiches du même restaurant. On garde le sien sur la ligne
            # conservée et on écarte l'autre — ce n'est pas une perte, c'est
            # la déduplication qui se propage.
            conn.execute(
                f"DELETE FROM {table} WHERE restaurant_id = ?", (supprime["id"],)
            )
        except sqlite3.Error:
            pass

    conn.execute("DELETE FROM restaurants WHERE id = ?", (supprime["id"],))
    return {"champs": champs_repris, "rattachements": deplaces}


def _sauvegarde_recente() -> Path | None:
    """La sauvegarde la plus récente, s'il y en a une."""
    dossier = Path("data/sauvegardes")
    copies = sorted(dossier.glob("local_signal-*.db"), reverse=True)
    return copies[0] if copies else None


def main() -> None:
    a = argparse.ArgumentParser(description="Fusionne les lignes en double (LS-04).")
    a.add_argument("--zone", default=None, help="restreindre a une zone")
    a.add_argument("--appliquer", action="store_true",
                   help="ecrire les fusions (sinon : simulation)")
    a.add_argument("--sans-sauvegarde", action="store_true",
                   help="passer outre l'exigence de sauvegarde (deconseille)")
    args = a.parse_args()

    conn = get_connection()
    ecartees: list = []
    trouvees = paires(conn, args.zone, ecartees)

    if ecartees:
        print(f"{len(ecartees)} paires ECARTEES — meme nom, rues differentes :")
        for x, y, d in ecartees:
            print(f"  {x['name'][:30]:32} {d:5.1f} m   "
                  f"{(x['address'] or '?')[:28]:30} / {(y['address'] or '?')[:28]}")
        print("  -> deux adresses d'une meme enseigne, pas un doublon.\n")

    if not trouvees:
        print("Aucun doublon.")
        return

    print(f"{len(trouvees)} paires a fusionner"
          f"{f' dans {args.zone}' if args.zone else ''}\n")

    total_champs = total_ratt = 0
    for garde, supprime, d in trouvees:
        champs = [c for c in CHAMPS_FUSIONNES
                  if garde.get(c) in (None, "") and supprime.get(c) not in (None, "")]
        ratt = _rattachements(conn, supprime["id"])
        total_champs += len(champs)
        total_ratt += ratt
        detail = []
        if champs:
            detail.append(f"recupere {len(champs)} champs ({', '.join(champs[:3])}"
                          f"{'…' if len(champs) > 3 else ''})")
        if ratt:
            detail.append(f"deplace {ratt} rattachements")
        print(f"  {garde['name'][:32]:34} {d:5.1f} m   "
              f"{supprime['id'][:18]:20} -> {garde['id'][:18]:20} "
              f"{'  ' + ' · '.join(detail) if detail else ''}")

    print(f"\n{total_champs} champs recuperes, {total_ratt} rattachements deplaces,"
          f" {len(trouvees)} lignes supprimees")

    if not args.appliquer:
        print("\nSIMULATION — rien n'a ete ecrit. Relancer avec --appliquer.")
        return

    # UNE SUPPRESSION SANS FILET NE SE FAIT PAS. La sauvegarde coute dix
    # secondes ; refaire la recolte coute des heures et de l'argent.
    copie = _sauvegarde_recente()
    if not copie and not args.sans_sauvegarde:
        print("\nREFUS : aucune sauvegarde. Lancer d'abord :")
        print("  python -m backend.db.sauvegarde")
        raise SystemExit(1)
    if copie:
        print(f"\nFilet de securite : {copie}")

    for garde, supprime, _ in trouvees:
        fusionner(conn, garde, supprime)
    conn.commit()
    conn.close()
    print(f"{len(trouvees)} paires fusionnees.")


if __name__ == "__main__":
    main()
