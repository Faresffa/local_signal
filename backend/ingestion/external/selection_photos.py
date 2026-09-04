# backend/ingestion/external/selection_photos.py
#
# CHOIX DES PHOTOS DE CARTE À ANALYSER (D-031).
#
# Un restaurant peut avoir des dizaines de photos taguées « menu ». Les
# analyser toutes coûterait un appel de vision chacune ; n'en prendre qu'une
# donne une carte tronquée. Ce module tranche.
#
# LE CONSTAT QUI FONDE LA RÈGLE. Mesuré sur deux restaurants du Quartier latin :
#
#   Amarvi  : 12 photos AU MÊME HORODATAGE (11/5/2025 12:00:00), puis 3 isolées
#   Allard  : 15 photos à 15 dates différentes, étalées de 2022 à 2026
#
# Douze clichés à la seconde près ne sont pas une coïncidence : c'est un
# téléversement unique, presque toujours le restaurateur publiant sa carte
# complète page par page. Les photos isolées, elles, sont des clichés de
# clients — partiels, pris de biais, parfois périmés.
#
# POURQUOI « LES PLUS RÉCENTES » NE SUFFIT PAS. Appliquée à Amarvi le
# 4 septembre 2026, cette règle retiendrait les trois photos isolées de 2026 et
# JETTERAIT la carte complète de novembre 2025. On échangerait un PDF officiel
# en douze pages contre trois clichés épars.
#
# CE QUI EST EN JEU POUR LE SCORE. L'indicateur menu compte les plats. Analyser
# une page sur douze rend un `dish_count` de 8 au lieu de 60 — et une carte
# resserrée est justement le marqueur d'un restaurant local. Une carte tronquée
# ne donne pas un score approximatif : elle donne un score FAUX, et faux dans le
# sens qui flatte. C'est le pire cas possible pour un indicateur.

from datetime import datetime, timedelta

# Au-delà, la carte est probablement périmée. L'indicateur prix compare un
# montant à la médiane du quartier : des prix de 2022 fausseraient la
# comparaison sans que rien ne le signale.
ANCIENNETE_MAX_MOIS = 24

# Nombre de photos réellement envoyées au modèle de vision. Chacune coûte un
# appel, donc du quota.
MAX_ANALYSEES = 5

# Seuil de reconnaissance d'un lot. TROIS, et non deux.
#
# Les horodatages sont arrondis à l'heure : deux clients qui photographient la
# carte le même midi produisent une collision fortuite. Mesuré sur Allard, où
# deux clichés isolés du 21/06/2025 partageaient l'horodatage — le seuil à deux
# les prenait pour une carte et écartait une photo d'août 2026, bien plus
# récente. À partir de trois pages simultanées, la coïncidence devient
# improbable et le téléversement groupé, lui, reste reconnu.
TAILLE_LOT_MINIMALE = 3


def _date(photo: dict):
    """
    Lit `photo_date`, au format mois/jour/année du fournisseur.

    « 2/17/2026 » lève l'ambiguïté : il n'y a pas de mois 17, la forme est bien
    M/J/A. On essaie plusieurs variantes plutôt que d'imposer une seule.
    """
    brut = photo.get("photo_date")
    if not isinstance(brut, str) or not brut.strip():
        return None
    for forme in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S",
                  "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(brut.strip(), forme)
        except ValueError:
            continue
    return None


def selectionner(
    photos: list[dict],
    maintenant: datetime = None,
    anciennete_max_mois: int = ANCIENNETE_MAX_MOIS,
    maximum: int = MAX_ANALYSEES,
) -> tuple[list[dict], str]:
    """
    Choisit les photos à analyser parmi celles taguées « menu ».

    Trois temps :
      1. écarter les photos trop anciennes ;
      2. chercher le lot groupé le plus récent — plusieurs photos au même
         horodatage, donc une carte complète publiée en pages ;
      3. à défaut, retenir les plus récentes, une par une.

    Returns:
        (photos retenues, motif du choix). Le motif est conservé en base : on
        doit pouvoir expliquer pourquoi telle carte a été lue plutôt qu'une
        autre, y compris des mois plus tard.
    """
    if not photos:
        return [], "aucune photo"

    maintenant = maintenant or datetime.now()
    limite = maintenant - timedelta(days=30.44 * anciennete_max_mois)

    datees = []
    sans_date = []
    for p in photos:
        d = _date(p)
        if d is None:
            sans_date.append(p)
        elif d >= limite:
            datees.append((d, p))

    if not datees:
        # Aucune photo datée exploitable. Les non datées valent mieux que rien,
        # mais on le signale : leur fraîcheur est inconnue.
        if sans_date:
            return sans_date[:maximum], "photos sans date, fraicheur inconnue"
        return [], f"toutes les photos ont plus de {anciennete_max_mois} mois"

    # --- Recherche d'un lot groupé -----------------------------------------
    lots: dict = {}
    for d, p in datees:
        lots.setdefault(d, []).append(p)

    groupes = [(d, ps) for d, ps in lots.items() if len(ps) >= TAILLE_LOT_MINIMALE]
    if groupes:
        # Le plus récent des lots groupés. Un lot ancien mais complet reste
        # préférable à des clichés récents et partiels — c'est tout l'objet
        # de cette règle.
        d, ps = max(groupes, key=lambda g: g[0])
        retenues = ps[:maximum]
        return retenues, (
            f"lot groupe du {d:%d/%m/%Y} — {len(ps)} pages, {len(retenues)} analysees"
        )

    # --- Sinon, les plus récentes ------------------------------------------
    datees.sort(key=lambda x: x[0], reverse=True)
    retenues = [p for _, p in datees[:maximum]]
    return retenues, (
        f"{len(retenues)} photos isolees les plus recentes "
        f"(du {datees[0][0]:%d/%m/%Y})"
    )
