# backend/core/filters/criteres.py
#
# FILTRAGE DES RÉSULTATS (D-034).
#
# Les filtres ne touchent JAMAIS au score. Ils retirent des lignes, ils n'en
# réordonnent aucune : le classement reste celui du Local Signal modulé par la
# proximité (D-008). Un filtre qui influencerait la note ferait entrer par la
# fenêtre des critères que le scoring a délibérément écartés.
#
# CE QUI PEUT FILTRER, ET CE QUI NE LE PEUT PAS.
#
# La note et le nombre d'avis sont en base et s'affichent, mais ils ne sont NI
# un critère de score (D-007) NI un filtre proposé. Laisser l'utilisateur
# écarter « les restaurants sous 4 étoiles » reviendrait à lui faire refaire le
# tri par popularité que le projet existe pour éviter (D-001) — le restaurant
# invisible, avec ses trois avis, disparaîtrait de sa liste.
#
# RÈGLE POUR UNE DONNÉE MANQUANTE : elle n'exclut pas.
#
# Un restaurant sans prix connu n'est pas écarté d'un filtre de budget, un
# restaurant sans horaires n'est pas écarté d'un filtre « ouvert maintenant ».
# C'est la même règle que D-012 côté scoring : l'absence d'information ne se
# transforme pas en jugement défavorable. Or les restaurants les moins
# renseignés sont précisément ceux que le projet veut faire remonter.
#
# L'exception est le filtre qui porte SUR la présence même : « seulement ceux
# dont on a lu la carte » exclut évidemment ceux dont on ne l'a pas.

import json
import re
from datetime import datetime

# Tranches de budget, calées sur la distribution réelle du Quartier latin :
# prix médian de 15 €, premier décile vers 10 €, dernier vers 25 €.
# À recalibrer si la zone change — une tranche « abordable » n'a pas la même
# borne à Paris et ailleurs.
TRANCHES_PRIX = {
    "petit": (0, 12),
    "moyen": (12, 18),
    "eleve": (18, 25),
    "tres_eleve": (25, 10_000),
}

_JOURS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

# Les fiches importées d'Outscraper portent leurs horaires en JSON, avec les
# jours en toutes lettres et en français — pas au format OpenStreetMap. Les
# deux formes cohabitent en base (D-029 : l'import est non destructif, il
# n'écrase pas ce qui vient d'OSM), donc le lecteur doit gérer les deux. Sans
# ça, 166 restaurants restaient éternellement « horaires inconnus ».
_JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

# Horaires OpenStreetMap : « Mo-Fr 12:00-14:30,19:00-22:00 ; Sa 19:00-23:00 ».
_PLAGE_JOURS = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$")
_PLAGE_HEURES = re.compile(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$")


def _jours_vises(fragment: str) -> set[int]:
    """Indices des jours couverts par « Mo », « Mo-Fr », etc."""
    m = _PLAGE_JOURS.match(fragment.strip())
    if not m:
        return set()
    debut = _JOURS.index(m.group(1))
    if not m.group(2):
        return {debut}
    fin = _JOURS.index(m.group(2))
    # Une plage peut enjamber la fin de semaine : « Fr-Mo ».
    return set(range(debut, fin + 1)) if fin >= debut else \
        set(range(debut, 7)) | set(range(0, fin + 1))


def est_ouvert(opening_hours: str, maintenant: datetime = None) -> bool | None:
    """
    Le restaurant est-il ouvert à cet instant ?

    Returns:
        True, False, ou **None quand on ne sait pas** — horaires absents,
        illisibles, ou format non géré. `None` ne doit jamais être traité comme
        `False` : ce serait pénaliser l'absence d'information.
    """
    if not opening_hours or not opening_hours.strip():
        return None

    texte = opening_hours.strip()
    maintenant = maintenant or datetime.now()

    if texte.startswith("{"):
        return _ouvert_json(texte, maintenant)

    if "24/7" in texte:
        return True

    jour = maintenant.weekday()
    minutes = maintenant.hour * 60 + maintenant.minute
    compris = False

    for regle in texte.split(";"):
        regle = regle.strip()
        if not regle:
            continue

        morceaux = regle.split()
        if len(morceaux) < 2:
            continue

        jours = set()
        for frag in morceaux[0].split(","):
            jours |= _jours_vises(frag)
        if not jours:
            continue

        compris = True
        if jour not in jours:
            continue

        for plage in " ".join(morceaux[1:]).split(","):
            m = _PLAGE_HEURES.match(plage.strip())
            if not m:
                continue
            debut = int(m.group(1)) * 60 + int(m.group(2))
            fin = int(m.group(3)) * 60 + int(m.group(4))
            # Une plage qui passe minuit : « 19:00-02:00 ».
            if fin <= debut:
                if minutes >= debut or minutes < fin:
                    return True
            elif debut <= minutes < fin:
                return True

    # Aucune règle exploitable : on ne sait pas, on ne tranche pas.
    return False if compris else None


def _ouvert_json(texte: str, maintenant: datetime) -> bool | None:
    """
    Horaires au format Outscraper : `{"lundi": ["12:00-14:30", ...], ...}`.

    Un jour peut valoir `["Fermé"]` (fermé, donc False) ou manquer purement et
    simplement (on ne sait pas, donc None) — les deux ne disent pas la même
    chose et ne doivent pas être confondus.
    """
    try:
        table = json.loads(texte)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(table, dict):
        return None

    plages = table.get(_JOURS_FR[maintenant.weekday()])
    if plages is None:
        return None
    if not isinstance(plages, list):
        return None

    minutes = maintenant.hour * 60 + maintenant.minute
    connu = False

    for plage in plages:
        m = _PLAGE_HEURES.match(str(plage).strip())
        if not m:
            # « Fermé », « Ouvert 24h/24 » : un libellé, pas une plage.
            if "24" in str(plage):
                return True
            continue
        connu = True
        debut = int(m.group(1)) * 60 + int(m.group(2))
        fin = int(m.group(3)) * 60 + int(m.group(4))
        if fin <= debut:
            if minutes >= debut or minutes < fin:
                return True
        elif debut <= minutes < fin:
            return True

    # Une liste de plages lisibles mais aucune ne couvre l'instant : fermé.
    # Une liste illisible ou vide (« Fermé » compris) : fermé aussi, puisque le
    # jour EST renseigné — c'est l'absence du jour qui vaut « je ne sais pas ».
    return False if (connu or plages) else None


def appliquer(restaurants: list[dict], *, tranche_prix: str = None,
              ouvert_maintenant: bool = False, avec_reservation: bool = False,
              avec_carte: bool = False, maintenant: datetime = None) -> list[dict]:
    """
    Retire les restaurants qui ne satisfont pas les critères demandés.

    L'ordre est PRÉSERVÉ : le classement vient du scoring, pas d'ici.
    """
    sortie = restaurants

    if tranche_prix in TRANCHES_PRIX:
        bas, haut = TRANCHES_PRIX[tranche_prix]
        # Prix inconnu : conservé. L'absence n'exclut pas.
        sortie = [r for r in sortie
                  if r.get("price") is None or bas <= r["price"] < haut]

    if ouvert_maintenant:
        # `None` (horaires inconnus) est conservé, `False` est écarté.
        sortie = [r for r in sortie
                  if est_ouvert(r.get("opening_hours"), maintenant) is not False]

    if avec_reservation:
        sortie = [r for r in sortie
                  if (r.get("reservation_url") or "").strip()]

    if avec_carte:
        # Ce filtre porte sur la présence même : ici, l'absence exclut,
        # et c'est le seul cas où c'est légitime.
        sortie = [r for r in sortie if (r.get("menu_photo_urls") or "").strip()]

    return sortie
