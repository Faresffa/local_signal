# backend/core/scoring/menu_score.py
# Signal « menu » — le cœur de l'apport IA du projet (D-004).
#
# POURQUOI CE SIGNAL EST LE PLUS IMPORTANT
#
# C'est le seul qui regarde ce que le restaurant EST, et non ce qu'on en dit.
# Tous les autres signaux dérivent d'avis, donc de popularité — or un restaurant
# authentique et invisible n'a pas d'avis (D-001). Le menu est disponible même
# pour un restaurant que personne n'a jamais commenté : il suffit de photographier
# la carte affichée en vitrine.
#
# ÉTAT : structure en place, alimentée par des données simulées.
# Le pipeline de scan (photo → modèle de vision → dict `menu`) n'est pas encore
# branché. L'interface est figée dès maintenant pour que le moteur soit correct
# avant l'arrivée des données réelles.
#
# FORMAT D'ENTRÉE attendu sur le restaurant, clé `menu` :
#
#     {
#         "cuisines": ["indonésienne"],       # cuisines identifiées sur la carte
#         "dish_count": 11,                   # nombre de plats
#         "languages": ["fr", "id"],          # langues de rédaction de la carte
#         "vernacular_ratio": 0.8,            # part de plats à nom vernaculaire
#         "has_tourist_menu": False,          # formule « entrée+plat+dessert+vin »
#     }
#
# Absent ou None → signal non disponible : son poids est redistribué sur les
# autres signaux, il n'est PAS compté comme zéro (D-012).

# --- Constantes du signal menu -----------------------------------------------
# STATUT : toutes à calibrer sur le jeu labellisé (D-006).

DISH_COUNT_IDEAL_MAX = 25   # au-delà, la carte est trop large pour une vraie cuisine
DISH_COUNT_HARD_MAX = 80    # 80 plats = production industrielle / congélateur
CUISINE_COUNT_MAX = 4       # au-delà de 4 cuisines mélangées, score nul
LANGUAGE_COUNT_MAX = 5      # carte en 5 langues = ciblage touristique assumé
TOURIST_MENU_PENALTY = 0.25 # retrait forfaitaire si formule « menu touriste »
DISH_PHOTOS_PENALTY = 0.15  # retrait forfaitaire si la carte affiche des photos

# Pondérations internes au signal menu — à calibrer (D-006)
W_COHERENCE = 0.35
W_BREADTH = 0.25
W_VERNACULAR = 0.25
W_LANGUAGES = 0.15


def score_cuisine_coherence(cuisines: list[str]) -> float:
    """
    Un vrai restaurant fait UNE chose. Pizza + pâtes + burger + paëlla sur la même
    carte est la signature d'un établissement qui ratisse large pour capter du
    passage, pas d'une cuisine.

    1 cuisine → 1.0 ; CUISINE_COUNT_MAX cuisines ou plus → 0.0
    """
    n = len(cuisines or [])
    if n <= 1:
        return 1.0
    if n >= CUISINE_COUNT_MAX:
        return 0.0
    return 1.0 - (n - 1) / (CUISINE_COUNT_MAX - 1)


def score_menu_breadth(dish_count: int) -> float:
    """
    Une carte courte signale une cuisine réellement préparée sur place ; une carte
    pléthorique signale de l'assemblage de produits sourcés.

    ≤ DISH_COUNT_IDEAL_MAX → 1.0 ; ≥ DISH_COUNT_HARD_MAX → 0.0 ; linéaire entre.
    """
    if dish_count is None or dish_count <= 0:
        return None
    if dish_count <= DISH_COUNT_IDEAL_MAX:
        return 1.0
    if dish_count >= DISH_COUNT_HARD_MAX:
        return 0.0
    span = DISH_COUNT_HARD_MAX - DISH_COUNT_IDEAL_MAX
    return 1.0 - (dish_count - DISH_COUNT_IDEAL_MAX) / span


def score_vernacular(vernacular_ratio: float) -> float:
    """
    Part des plats dont le nom est conservé dans la langue d'origine
    (« Ayam bakar kecap ») plutôt que traduit en générique
    (« Poulet grillé sauce soja »).

    Une carte qui garde ses termes d'origine s'adresse à des gens qui les
    connaissent — donc à une clientèle de la diaspora ou d'habitués, pas à un
    passant qu'il faut rassurer.
    """
    if vernacular_ratio is None:
        return None
    return max(0.0, min(1.0, vernacular_ratio))


def score_languages(languages: list[str]) -> float:
    """
    Nombre de langues dans lesquelles la carte est rédigée.

    Une carte en quatre langues avec photos des plats ne s'adresse pas au quartier.
    C'est l'un des signaux d'attrape-touristes les plus fiables dans le monde réel.

    1 langue → 1.0 ; LANGUAGE_COUNT_MAX ou plus → 0.0
    """
    n = len(languages or [])
    if n == 0:
        return None
    if n <= 1:
        return 1.0
    if n >= LANGUAGE_COUNT_MAX:
        return 0.0
    return 1.0 - (n - 1) / (LANGUAGE_COUNT_MAX - 1)


def score_menu(menu: dict | None) -> dict:
    """
    Agrège les sous-signaux de la carte en un score unique.

    Returns:
        {
            "score": float | None,   # None si la carte n'est pas disponible
            "available": bool,
            "details": {...},        # sous-scores, pour l'explication (D-009)
        }

    IMPORTANT : en l'absence de carte, retourne `None` et non `0.0`. Un restaurant
    dont on n'a pas la carte est INCONNU, pas mauvais. Le moteur redistribue alors
    le poids de ce signal sur les autres (D-012).
    """
    if not menu:
        return {"score": None, "available": False, "details": {}}

    parts = {
        "coherence": (score_cuisine_coherence(menu.get("cuisines")), W_COHERENCE),
        "breadth": (score_menu_breadth(menu.get("dish_count")), W_BREADTH),
        "vernacular": (score_vernacular(menu.get("vernacular_ratio")), W_VERNACULAR),
        "languages": (score_languages(menu.get("languages")), W_LANGUAGES),
    }

    # Redistribution : on ne moyenne que sur les sous-signaux réellement calculables.
    available = {k: (v, w) for k, (v, w) in parts.items() if v is not None}
    if not available:
        return {"score": None, "available": False, "details": {}}

    total_weight = sum(w for _, w in available.values())
    score = sum(v * w for v, w in available.values()) / total_weight

    if menu.get("has_tourist_menu"):
        score = max(0.0, score - TOURIST_MENU_PENALTY)

    # Une carte avec photos des plats s'adresse à un client qui ne sait pas lire
    # les intitulés — donc pas au quartier.
    if menu.get("has_dish_photos"):
        score = max(0.0, score - DISH_PHOTOS_PENALTY)

    return {
        "score": round(score, 4),
        "available": True,
        "details": {
            **{k: round(v, 4) for k, (v, _) in available.items()},
            "has_tourist_menu": bool(menu.get("has_tourist_menu")),
            "has_dish_photos": bool(menu.get("has_dish_photos")),
            "dish_count": menu.get("dish_count"),
            "cuisine_count": len(menu.get("cuisines") or []),
            "language_count": len(menu.get("languages") or []),
        },
    }
