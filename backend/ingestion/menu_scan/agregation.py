# backend/ingestion/menu_scan/agregation.py
#
# AGRÉGATION DES PAGES D'UNE MÊME CARTE (D-031).
#
# Une carte de restaurant tient rarement sur une photo. Le collecteur en rend
# plusieurs, et la sélection par lot retient jusqu'à cinq clichés d'un même
# téléversement — soit cinq PAGES d'une seule carte, pas cinq cartes.
#
# Les analyser séparément et garder la meilleure serait une erreur de méthode.
# L'indicateur menu compte les plats, et une carte resserrée est le marqueur
# d'un restaurant local (D-004) : retenir la page qui porte huit plats sur une
# carte qui en compte soixante rendrait le restaurant artificiellement local.
# Une carte tronquée ne donne pas un score approximatif, elle donne un score
# FAUX, et faux dans le sens qui flatte.
#
# Chaque observation s'agrège selon sa nature, et pas toutes de la même façon :
#
#   dish_count        SOMME       les plats des pages s'additionnent
#   cuisines          UNION       une page « desserts » ne dit rien des entrées
#   languages         UNION       une seule page traduite suffit à établir la langue
#   vernacular_ratio  MOYENNE     pondérée par le nombre de plats de chaque page
#   has_tourist_menu  OU          une formule touriste sur une page suffit
#   has_dish_photos   OU          idem
#   readable          OU          une page lisible sauve la carte
#
# La moyenne pondérée est le point délicat : une page de trois desserts aux noms
# français ne doit pas peser autant qu'une page de quarante plats aux noms
# vernaculaires. Pondérer par `dish_count` rétablit la proportion.

from backend.ingestion.menu_scan.schema import MenuAnalysis


def agreger(analyses: list[MenuAnalysis]) -> MenuAnalysis | None:
    """
    Fond plusieurs pages d'une même carte en une observation unique.

    Args:
        analyses: résultats de vision, un par page, dans l'ordre des photos.

    Returns:
        Une `MenuAnalysis` agrégée, ou None si aucune page n'est lisible —
        auquel cas le moteur redistribue le poids du signal menu (D-012) plutôt
        que de pénaliser le restaurant.
    """
    if not analyses:
        return None

    lisibles = [a for a in analyses if a.readable]
    if not lisibles:
        # Aucune page exploitable. On conserve la note de la première pour
        # expliquer l'échec plutôt que de renvoyer un objet muet.
        return MenuAnalysis(
            cuisines=[], dish_count=0, languages=[], vernacular_ratio=0.0,
            has_tourist_menu=False, has_dish_photos=False, readable=False,
            notes=analyses[0].notes or "aucune page lisible",
        )

    # Une seule page lisible : rien à fondre.
    if len(lisibles) == 1:
        return lisibles[0]

    dish_count = sum(a.dish_count for a in lisibles)

    # Union en conservant l'ordre d'apparition : la cuisine dominante est
    # généralement celle de la première page, et l'ordre reste lisible dans
    # l'explication rendue à l'utilisateur (D-009).
    def union(champ):
        vus, sortie = set(), []
        for a in lisibles:
            for v in getattr(a, champ):
                cle = str(v).strip().lower()
                if cle and cle not in vus:
                    vus.add(cle)
                    sortie.append(v)
        return sortie

    # Moyenne pondérée par le nombre de plats. Une page de trois desserts ne
    # doit pas peser autant qu'une page de quarante plats.
    poids = sum(a.dish_count for a in lisibles)
    if poids > 0:
        vernaculaire = sum(a.vernacular_ratio * a.dish_count for a in lisibles) / poids
    else:
        # Aucune page ne compte de plat : moyenne simple, faute de mieux.
        vernaculaire = sum(a.vernacular_ratio for a in lisibles) / len(lisibles)

    return MenuAnalysis(
        cuisines=union("cuisines"),
        dish_count=dish_count,
        languages=union("languages"),
        vernacular_ratio=round(min(1.0, max(0.0, vernaculaire)), 3),
        has_tourist_menu=any(a.has_tourist_menu for a in lisibles),
        has_dish_photos=any(a.has_dish_photos for a in lisibles),
        readable=True,
        notes=(
            f"{len(lisibles)} page(s) lisible(s) sur {len(analyses)} — "
            f"{dish_count} plats au total."
        ),
    )
