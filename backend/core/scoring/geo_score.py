# backend/core/scoring/geo_score.py
# Signaux géographiques.
#
# Deux usages de nature DIFFÉRENTE, à ne jamais confondre (D-008) :
#
#   - tourist_pressure / score_tourist_zone : STATIQUE. Propriété du restaurant —
#     se trouve-t-il dans une zone à forte pression touristique ? Entre dans le
#     Local Signal, et se calcule en lot, jamais dans une requête.
#
#   - score_geo_user : DYNAMIQUE. Propriété de la requête — à quelle distance
#     est-il de l'utilisateur *maintenant* ? N'entre pas dans le Local Signal,
#     car la distance à l'utilisateur ne dit rien sur l'authenticité.

import math

from backend import config


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calcule la distance en mètres entre deux points GPS (lat/lng).
    Utilise la formule de Haversine (précision suffisante pour <100km).

    Args:
        lat1, lng1: Coordonnées du point A (ex: restaurant)
        lat2, lng2: Coordonnées du point B (ex: site touristique)

    Returns:
        Distance en mètres (float)
    """
    R = 6_371_000  # Rayon de la Terre en mètres

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (math.sin(delta_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def distance_to_nearest_tourist_site(
    restaurant_lat: float,
    restaurant_lng: float,
    tourist_sites: list[dict],
) -> float:
    """
    Retourne la distance (en mètres) au site touristique le plus proche.

    N'entre plus dans le scoring depuis D-027 — la pression est désormais mesurée
    sur l'ensemble des sites, pas sur le plus proche. Conservée parce qu'elle
    reste lisible pour un humain : c'est ce qu'on affiche dans une explication,
    et ce qui sert à diagnostiquer une zone.

    Returns:
        Distance en mètres, ou l'infini s'il n'y a aucun site.
    """
    if not tourist_sites:
        return float("inf")

    return min(
        haversine(restaurant_lat, restaurant_lng, s["lat"], s["lng"])
        for s in tourist_sites
    )


def tourist_pressure(
    restaurant_lat: float,
    restaurant_lng: float,
    tourist_sites: list[dict],
    sigma: float = None,
) -> float:
    """
    PRESSION TOURISTIQUE ABSOLUE — grandeur physique, non bornée (D-027).

    Somme d'un noyau gaussien sur TOUS les sites touristiques :

        pression = somme sur i de  exp( -di^2 / 2*sigma^2 )

    POURQUOI UNE SOMME, ET NON LA DISTANCE AU PLUS PROCHE. Mesuré sur les 468
    restaurants du Quartier latin : à distance comparable du monument le plus
    proche (60-70 m), la pression réelle varie de 4,99 à 20,86 — un facteur 4
    que « distance au plus proche » écrase intégralement. Un restaurant cerné
    par douze monuments ne subit pas le même flux qu'un restaurant qui en a un
    seul à la même distance.

    Le noyau gaussien remplace aussi le seuil dur de 500 m, qui ne mordait nulle
    part : la médiane des distances au plus proche est de 102 m et le maximum de
    273 m, donc AUCUN des 468 n'atteignait le rayon. La branche « hors zone »
    était du code mort, et le score plafonnait à 0,55 au lieu de 1,00.

    Cette valeur est CONSERVÉE TELLE QUELLE en base. C'est elle qui permet
    l'évaluation et la calibration : elle ne dépend que du restaurant et des
    sites, jamais de la requête ni de la cohorte. Deux villes restent comparables
    sur cette échelle — ce que le rang en percentile, lui, ne permet pas.

    Returns:
        Pression >= 0, sans unité, croissante avec le nombre et la proximité
        des sites.
    """
    if sigma is None:
        sigma = config.TOURIST_KERNEL_SIGMA

    if not tourist_sites:
        return 0.0

    deux_sigma_carre = 2.0 * sigma * sigma
    return sum(
        math.exp(
            -(haversine(restaurant_lat, restaurant_lng, s["lat"], s["lng"]) ** 2)
            / deux_sigma_carre
        )
        for s in tourist_sites
    )


def score_tourist_zone(pressure: float, cohort_pressures: list[float]) -> float:
    """
    Signal STATIQUE (0 à 1) : le restaurant échappe-t-il aux zones à forte
    pression touristique ? 1.0 = le plus tranquille de sa zone, 0.0 = le plus
    exposé.

    ATTENTION — ce critère a été INVERSÉ (D-002). Il récompensait auparavant la
    proximité aux sites touristiques, avec le poids le plus élevé de la formule,
    ce qui contredisait frontalement l'intention du produit.

    Justification de l'inversion (argument économique, repris tel quel au mémoire) :

        Un restaurant adossé à un monument joue un JEU À UN COUP — ses clients ne
        reviendront jamais. Il n'a donc aucune incitation économique à la qualité :
        sa réputation auprès d'un client donné n'a pas de valeur future.
        Un restaurant de quartier vit de ses HABITUÉS — la relation est répétée,
        la qualité devient sa condition de survie.
        L'authenticité corrèle avec le taux de retour des clients, et la pression
        touristique du lieu en est un proxy mesurable.

    RANG EN PERCENTILE, ET NON SEUIL EN MÈTRES (D-027). Le score est le rang du
    restaurant dans la distribution de pression de SA COHORTE — les autres
    restaurants de la même zone, au moment du calcul en lot.

    Deux raisons :

      1. Aucune constante en mètres ne survit à un changement de ville. Un seuil
         de 500 m calibré sur le Quartier latin serait faux à Tokyo comme dans un
         village. Un rang ne dépend d'aucune échelle : il se transporte tel quel.
      2. L'étendue 0-1 est garantie par construction. L'ancienne formule
         plafonnait à 0,55 sur données réelles, gâchant la moitié de la plage.

    CE QUE CE CHOIX COÛTE, et qu'il faut assumer au mémoire : le score devient
    RELATIF à la zone. Il répond à « ce restaurant est-il dans un coin touristique
    DE CETTE VILLE », pas à « cette ville est-elle touristique ». Deux villes ne
    sont plus comparables sur ce signal — c'est `tourist_pressure` qui sert à
    cela, et c'est la raison pour laquelle elle est conservée séparément.

    Le rang est calculé EN LOT (backend/ingestion/osm/load.py), jamais dans le
    chemin d'une requête : le signal reste statique au sens de D-008, et deux
    requêtes différentes ne peuvent pas attribuer deux scores au même restaurant.

    Args:
        pressure: pression du restaurant, issue de `tourist_pressure`.
        cohort_pressures: pressions de tous les restaurants de la zone.

    Returns:
        Score entre 0.0 et 1.0.
    """
    n = len(cohort_pressures)
    if n <= 1:
        # Cohorte insuffisante pour un rang. Neutre plutôt qu'arbitraire : on ne
        # pénalise pas un restaurant parce qu'il est seul dans sa zone, et on ne
        # le récompense pas non plus.
        return 0.5

    # Rang moyen en cas d'égalité, pour que deux pressions identiques donnent
    # deux scores identiques — sinon l'ordre d'itération déciderait du classement.
    inferieurs = sum(1 for p in cohort_pressures if p < pressure)
    egaux = sum(1 for p in cohort_pressures if p == pressure)
    rang = (inferieurs + (egaux - 1) / 2.0) / (n - 1)

    return round(max(0.0, min(1.0, 1.0 - rang)), 4)


def score_geo_user(
    restaurant_lat: float,
    restaurant_lng: float,
    user_lat: float,
    user_lng: float,
    radius: float = None,
) -> float:
    """
    Signal DYNAMIQUE (0 à 1) : proximité à l'utilisateur au moment de la requête.

    N'entre PAS dans le Local Signal (D-008) : c'est une propriété de la requête,
    pas du restaurant.

    NORMALISÉ SUR LE RAYON DEMANDÉ, ET NON SUR UNE CONSTANTE (D-027).

    L'ancienne version divisait par `MAX_DISTANCE_USER = 5000 m` quel que soit le
    rayon choisi. Conséquence mesurée : à 400 m — le rayon le plus utilisé,
    « 5 min à pied » — tous les restaurants tombaient entre 0,921 et 0,980. La
    proximité ne départageait plus rien, et sa part réelle dans la variation du
    classement n'était que de 17,5 % au lieu des 30 % annoncés. Le poids mentait,
    et il mentait d'autant plus que l'utilisateur resserrait sa recherche.

    DÉCROISSANCE EXPONENTIELLE, ET NON LINÉAIRE. Pour un piéton, l'écart entre
    100 m et 600 m est décisif ; celui entre 4,1 km et 4,6 km ne veut rien dire.
    Le linéaire traitait les deux de la même façon.

        score = exp( -distance / (rayon / 2) )

    Soit 1,00 sur place, 0,37 à mi-rayon, 0,14 en limite : l'essentiel du pouvoir
    de discrimination est placé là où le piéton le ressent.

    LIMITE CONNUE : distance à vol d'oiseau. Un restaurant de l'autre côté de la
    Seine est « proche » et pourtant à quinze minutes. Un calcul d'itinéraire
    piéton (OSRM) le corrigerait ; ce n'est pas nécessaire tant que le rayon
    reste petit devant la maille du réseau viaire.

    Args:
        radius: rayon de la recherche en mètres (défaut: config).

    Returns:
        Score entre 0.0 et 1.0.
    """
    if radius is None:
        radius = config.MAX_DISTANCE_USER

    dist = haversine(restaurant_lat, restaurant_lng, user_lat, user_lng)

    # Constante de temps, fraction du rayon demandé. Le score décroît vite au-delà
    # sans jamais s'annuler brutalement : une falaise créerait des inversions de
    # classement sur quelques mètres, à la frontière du rayon.
    #
    # Le facteur est en configuration et NON CALIBRÉ (D-006) : c'est lui qui règle
    # la dispersion du signal, donc son pouvoir de départage réel.
    tau = max(radius, 1.0) * config.PROXIMITY_DECAY_FACTOR
    return round(math.exp(-dist / tau), 4)
