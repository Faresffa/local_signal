# backend/db/dossier_annotation.py
#
# LE DOSSIER SOUMIS À L'ANNOTATEUR (D-043).
#
# POURQUOI CE FICHIER EXISTE. Le §4 du protocole interdit à l'annotateur quatre
# raisonnements — la carte, la langue des avis, les prix face au quartier, la
# distance aux monuments — parce que ce sont exactement les quatre indicateurs
# du modèle. Jusqu'ici l'interdit reposait sur une consigne : on demandait à
# l'annotateur de ne pas regarder. Le pilote D-042 a mesuré ce que vaut une
# consigne : une violation franche sur 150 jugements, un annotateur qui fait
# basculer son étiquette sur « rue ultra-touristique face Notre-Dame ».
#
# CE MODULE REND L'INTERDIT STRUCTUREL. L'annotateur ne reçoit plus une fiche
# complète assortie d'une consigne : il reçoit un dossier d'où les quatre
# indicateurs ont été RETIRÉS. Il ne peut plus compter les plats ni les langues
# de la carte, comparer un prix à une médiane, ni lire des coordonnées. On ne
# lui fait plus confiance pour ne pas regarder — on ne lui montre pas.
#
# CE QUE ÇA CHANGE POUR LE MÉMOIRE. « Nous avions interdit ces raisonnements »
# est une intention. « Ces informations étaient absentes du dossier » est un
# fait vérifiable, et le dossier est versionné. La différence se voit en
# soutenance.
#
# LA LIMITE, À DIRE PLUTÔT QU'À LAISSER TROUVER. Masquer le champ `lang` d'un
# avis n'efface pas la langue de son texte : un annotateur voit qu'un avis est
# en espagnol. Ce qui est supprimé, c'est la possibilité de COMPTER — de
# calculer un ratio, qui est ce que fait l'indicateur `language`. La
# contamination est réduite, pas annulée. C'est la même limite d'indépendance
# que le §4 assume déjà.
#
# SECOND EFFET, NON RECHERCHÉ MAIS DÉCISIF : LA REPRODUCTIBILITÉ. Une
# annotation fondée sur des recherches web dépend de ce que le web renvoyait ce
# jour-là, et ne peut pas être rejouée par un jury. Un dossier figé, si.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.dossier_annotation --zone quartier-latin --taille 30
#     python -m backend.db.dossier_annotation --id osm_n2445450649

import argparse
import json
import re
import sqlite3
from pathlib import Path

from backend.db.models import get_connection

SORTIE = Path("docs/data/annotation-pilote")

# Ce qui ne DOIT PAS entrer dans un dossier, et la raison pour chaque entrée.
# Cette liste est le cœur du module : elle se lit comme une justification.
EXCLUS = {
    "lat": "indicateur zone touristique — distance aux monuments",
    "lng": "indicateur zone touristique — distance aux monuments",
    "tourist_flag": "indicateur zone touristique — notre propre pénalité",
    "price": "indicateur prix",
    "price_detail": "indicateur prix",
    "price_range": "indicateur prix",
    "menu_url": "indicateur menu",
    "menu_photo_urls": "indicateur menu",
    "local_signal": "notre score — circularité directe",
    "confidence": "notre score",
    "signals_json": "nos quatre indicateurs calculés",
    "label": "l'étiquette elle-même",
    "label_sources": "l'étiquette elle-même",
    "rating": "la note n'entre pas dans le classement (D-013), et biaise le jugement",
    "review_count": "la notoriété est exactement ce que le projet refuse de mesurer (D-001)",
    "photos_count": "même proxy de notoriété que review_count — voir plus bas",
}

# POURQUOI `photos_count` A ÉTÉ RETIRÉ APRÈS COUP. Il figurait dans la première
# version du dossier : il semblait décrire l'activité d'un lieu, pas sa
# notoriété. La mesure a tranché — un annotateur du pilote D-043 a fondé 98 %
# de ses jugements dessus, réduisant le nombre de photos à un proxy de
# « combien de gens photographient cet endroit », c'est-à-dire de notoriété.
# C'est exactement ce que D-001 interdit d'utiliser : un restaurant invisible
# a peu de photos parce qu'il est invisible, pas parce qu'il est local.
# Un champ n'est pas neutre parce qu'on l'a jugé neutre ; il l'est quand on a
# regardé ce que les annotateurs en font.

# Nombre d'avis servis. Assez pour sentir qui écrit, pas assez pour compter des
# langues — et c'est volontaire.
AVIS_PAR_DOSSIER = 8


def _frequentation(brut: str | None) -> str | None:
    """
    Résume `popular_times` en une phrase.

    Le protocole (§5.1) tient ce signal pour le meilleur dont on dispose : un
    habitué déjeune près de chez lui en semaine, un visiteur vient le week-end.
    Ce rapport sépare deux publics sans rien dire de la cuisine, du prix ni de
    l'emplacement — donc sans toucher à aucun des quatre indicateurs.
    """
    if not brut:
        return None
    try:
        jours = json.loads(brut)
    except (json.JSONDecodeError, TypeError):
        return None

    semaine = weekend = 0
    for jour in jours:
        if not isinstance(jour, dict):
            continue
        # `day` : 1 = lundi … 7 = dimanche selon la source.
        est_weekend = jour.get("day") in (6, 7)
        total = sum(h.get("percentage", 0) or 0
                    for h in jour.get("popular_times", [])
                    if isinstance(h, dict))
        if est_weekend:
            weekend += total
        else:
            semaine += total

    if not (semaine + weekend):
        return None
    # Ramené au jour pour être comparable : 5 jours de semaine, 2 de week-end.
    par_jour_sem = semaine / 5
    par_jour_we = weekend / 2
    if not (par_jour_sem + par_jour_we):
        return None
    part = par_jour_sem / (par_jour_sem + par_jour_we)
    if part >= 0.60:
        lecture = "nettement plus fréquenté en semaine"
    elif part <= 0.40:
        lecture = "nettement plus fréquenté le week-end"
    else:
        lecture = "fréquentation répartie entre semaine et week-end"
    return f"{lecture} ({part:.0%} de l'affluence tombe en semaine, par jour)"


def _propre(texte: str) -> str:
    """Retire le balisage HTML résiduel des avis collectés."""
    return re.sub(r"<[^>]+>", " ", texte or "")


def _horaires(brut: str | None) -> str | None:
    """
    Met les horaires en phrase, et en tire l'amplitude.

    C'est le signal d'exploitation le plus lisible dont dispose un annotateur,
    et il ne recoupe aucun des quatre indicateurs : fermer le dimanche et le
    lundi est le rythme d'une clientèle de bureau et de quartier ; ouvrir sept
    jours sur sept en service continu est celui d'un flux de passage. Servi
    brut, le JSON est illisible et le signal se perd — d'où cette mise en forme.
    """
    if not brut:
        return None
    try:
        jours = json.loads(brut)
    except (json.JSONDecodeError, TypeError):
        return " ".join(str(brut).split())[:200]
    if not isinstance(jours, dict):
        return " ".join(str(brut).split())[:200]

    # ATTENTION, ce filtre a été ajouté après coup. La source n'encode pas un
    # jour fermé par une liste vide : elle y met la chaîne « Fermé ». Compter la
    # simple présence d'un créneau faisait donc annoncer « ouvert 7 jours sur 7 »
    # à des maisons qui ferment deux jours — l'inverse exact du signal. 56 des
    # 467 restaurants de la zone étaient concernés, et c'est un annotateur qui
    # l'a repéré en voyant le résumé contredire le détail.
    def _ferme(creneaux):
        return all(str(c).strip().lower() in ("fermé", "ferme", "closed")
                   for c in creneaux)

    fermes = [j for j, c in jours.items() if not c or _ferme(c)]
    ouverts = {j: [x for x in c if str(x).strip().lower()
                   not in ("fermé", "ferme", "closed")]
               for j, c in jours.items() if c and not _ferme(c)}
    ouverts = {j: c for j, c in ouverts.items() if c}
    if not ouverts:
        return "fermé toute la semaine d'après la source"

    # Amplitude : de la première ouverture à la dernière fermeture, en heures.
    def _minutes(hhmm: str) -> int:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)

    amplitudes, continus = [], 0
    for creneaux in ouverts.values():
        try:
            debut = min(_minutes(c.split("-")[0]) for c in creneaux)
            fin = max(_minutes(c.split("-")[1]) for c in creneaux)
        except (ValueError, IndexError):
            continue
        if fin < debut:          # ferme après minuit
            fin += 24 * 60
        amplitudes.append((fin - debut) / 60)
        if len(creneaux) == 1:   # pas de coupure entre les services
            continus += 1

    L = [f"ouvert {len(ouverts)} jours sur 7"]
    if fermes:
        L.append(f"fermé {' et '.join(fermes)}")
    if amplitudes:
        L.append(f"amplitude moyenne {sum(amplitudes) / len(amplitudes):.1f} h/jour")
    if continus == len(ouverts) and ouverts:
        L.append("service continu, sans coupure entre midi et le soir")
    elif continus:
        L.append(f"service continu {continus} jour(s) sur {len(ouverts)}")

    detail = " · ".join(f"{j} {', '.join(c)}" for j, c in list(ouverts.items())[:7])
    return f"{' — '.join(L)}\n  détail : {detail}"


def dossier(conn: sqlite3.Connection, rid: str) -> dict | None:
    """Le dossier d'un restaurant : tout ce qui est licite, rien d'autre."""
    conn.row_factory = sqlite3.Row
    r = conn.execute("SELECT * FROM restaurants WHERE id = ?", (rid,)).fetchone()
    if r is None:
        return None

    attributs: dict[str, list[str]] = {}
    for a in conn.execute(
        "SELECT section, cle FROM restaurant_attributs WHERE restaurant_id = ? "
        "ORDER BY section, cle", (rid,)
    ):
        attributs.setdefault(a["section"], []).append(a["cle"])

    # Le texte seul. Le champ `lang` n'est pas lu : c'est l'indicateur.
    avis = [_propre(a["text"]) for a in conn.execute(
        "SELECT text FROM reviews WHERE restaurant_id = ? AND text IS NOT NULL "
        "AND TRIM(text) <> '' LIMIT ?", (rid, AVIS_PAR_DOSSIER))]

    return {
        "id": r["id"],
        "nom": r["name"],
        "adresse": r["address"] or "",
        "cuisine": r["cuisine"] or "",
        "horaires": _horaires(r["opening_hours"]) or "",
        "site": r["website"] or "",
        "telephone": r["phone"] or "",
        "reservation": r["reservation_url"] or "",
        "categorie": r["google_category"] or "",
        "sous_types": r["subtypes"] or "",
        "description": r["google_description"] or "",
        "frequentation": _frequentation(r["popular_times"]),
        "attributs": attributs,
        "avis": avis,
    }


def en_texte(d: dict) -> str:
    """Le dossier mis en forme pour un annotateur — humain ou agent."""
    L = [f"### {d['nom']}"]
    if d["adresse"]:
        L.append(f"Adresse : {d['adresse']}")
    for cle, libelle in (
        ("cuisine", "Type de cuisine"), ("categorie", "Catégorie"),
        ("sous_types", "Sous-types"), ("horaires", "Horaires d'ouverture"),
        ("site", "Site web"), ("reservation", "Réservation en ligne"),
    ):
        if d.get(cle):
            L.append(f"{libelle} : {d[cle]}")
    if d.get("telephone"):
        L.append(f"Contact : {d['telephone']}")
    if d.get("frequentation"):
        L.append(f"Fréquentation : {d['frequentation']}")
    if d.get("description"):
        L.append(f"Description Google : {d['description']}")

    if d["attributs"]:
        L.append("\nAttributs déclarés (Google) :")
        for section, cles in d["attributs"].items():
            L.append(f"  {section} : {', '.join(cles)}")

    if d["avis"]:
        L.append(f"\nExtraits d'avis ({len(d['avis'])}, texte seul) :")
        for i, t in enumerate(d["avis"], 1):
            texte = " ".join(t.split())[:320]
            L.append(f"  {i}. {texte}")
    else:
        L.append("\nAucun avis collecté pour cet établissement.")
    return "\n".join(L)


def main() -> None:
    a = argparse.ArgumentParser(description="Dossiers d'annotation (D-043).")
    a.add_argument("--zone", default="quartier-latin")
    a.add_argument("--taille", type=int, default=30)
    a.add_argument("--id", help="un seul restaurant, affiché à l'écran")
    args = a.parse_args()

    conn = get_connection()
    conn.row_factory = sqlite3.Row

    if args.id:
        d = dossier(conn, args.id)
        print(en_texte(d) if d else f"Inconnu : {args.id}")
        conn.close()
        return

    ids = [r["id"] for r in conn.execute(
        "SELECT id FROM restaurants WHERE zone = ? "
        "ORDER BY substr(hex(id), -6), id LIMIT ?", (args.zone, args.taille))]
    dossiers = {i: dossier(conn, i) for i in ids}
    conn.close()

    SORTIE.mkdir(parents=True, exist_ok=True)
    chemin = SORTIE / f"dossiers-{args.zone}.json"
    chemin.write_text(
        json.dumps(dossiers, ensure_ascii=False, indent=1), encoding="utf-8")

    avec_avis = sum(1 for d in dossiers.values() if d and d["avis"])
    avec_freq = sum(1 for d in dossiers.values() if d and d["frequentation"])
    print(f"[Dossiers] {chemin}  ({len(dossiers)} restaurants)")
    print(f"   avec extraits d'avis : {avec_avis}")
    print(f"   avec fréquentation   : {avec_freq}")
    print("\n   RETIRÉ de chaque dossier, et c'est le point du module :")
    for champ, raison in EXCLUS.items():
        print(f"     {champ:<18}{raison}")


if __name__ == "__main__":
    main()
