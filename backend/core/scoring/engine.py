# backend/core/scoring/engine.py
# Orchestrateur du scoring.
#
# ARCHITECTURE — deux scores de nature différente, jamais mélangés (D-008) :
#
#   LOCAL SIGNAL (statique)   « ce qu'est le restaurant »
#       menu + langue des avis + anomalie de prix + zone touristique
#       → ne dépend pas de qui cherche, a vocation à être précalculé et stocké,
#         recalculé en batch mensuel.
#
#   PERTINENCE (dynamique)    « ce qui convient à l'utilisateur maintenant »
#       distance, ouverture, budget, cuisine, contraintes alimentaires
#       → calculé à la requête.
#
# Règle : ne JAMAIS recalculer un signal statique dans le chemin d'une requête
# utilisateur. C'est ce qui permettra à l'app mobile de rester instantanée sur
# une base nationale.

from backend import config
from backend.core.scoring.geo_score import score_tourist_zone, score_geo_user, haversine
from backend.core.scoring.language_score import score_language, language_confidence
from backend.core.scoring.menu_score import score_menu
from backend.core.scoring.price_score import score_price
from backend.core.scoring.stars_score import score_stars


# =============================================================================
# LOCAL SIGNAL — statique
# =============================================================================

def compute_local_signal(
    restaurant: dict,
    tourist_sites: list[dict],
    peers: list[dict] = None,
    target_lang: str = None,
) -> dict:
    """
    Calcule le score d'authenticité d'un restaurant, indépendamment de l'utilisateur.

    REDISTRIBUTION DES POIDS (D-012) — mécanisme central :
    un signal indisponible (pas de carte scannée, pas assez de comparables de prix)
    n'est PAS compté comme zéro. Son poids est réparti sur les signaux disponibles.

    Sans cela, un restaurant peu documenté serait mécaniquement mal noté — ce qui
    reproduirait exactement le défaut que le projet cherche à corriger (D-001).
    Un restaurant sur lequel on a peu d'information est INCERTAIN, pas MAUVAIS ;
    l'incertitude est portée par `confidence`, pas par le score.

    Args:
        restaurant: dict avec 'lat', 'lng', 'reviews', 'price', 'type', 'menu'
        tourist_sites: liste de sites touristiques [{lat, lng, name}]
        peers: restaurants du voisinage, pour la comparaison de prix
        target_lang: langue locale attendue (défaut: config.TARGET_LANGUAGE)

    Returns:
        {
            "local_signal": float,      # 0-100
            "confidence": float,        # 0-1, quantité de preuves disponibles
            "signals": {...},           # sous-scores avec leur disponibilité
        }
    """
    if target_lang is None:
        target_lang = config.TARGET_LANGUAGE

    # --- Signal 1 : la carte (le plus important, seul disponible sans avis) ---
    menu = score_menu(restaurant.get("menu"))

    # --- Signal 2 : langue des avis (lissée — jamais 0 par absence) ---
    reviews = restaurant.get("reviews", []) or []
    lang_value = score_language(reviews, target_lang=target_lang)
    lang_conf = language_confidence(reviews)

    # --- Signal 3 : anomalie de prix vs voisinage comparable ---
    price = score_price(restaurant, peers or [])

    # --- Signal 4 : pénalité de zone touristique (critère INVERSÉ — D-002) ---
    tourist_zone = score_tourist_zone(
        restaurant["lat"], restaurant["lng"], tourist_sites
    )

    signals = {
        "menu": {
            "value": menu["score"],
            "weight": config.WEIGHT_MENU,
            "available": menu["available"],
            "details": menu["details"],
        },
        "language": {
            "value": lang_value,
            "weight": config.WEIGHT_LANGUAGE,
            "available": True,  # toujours calculable : le lissage gère l'absence
            "details": {
                "review_count": len(reviews),
                "confidence": round(lang_conf, 3),
            },
        },
        "price": {
            "value": price["score"],
            "weight": config.WEIGHT_PRICE,
            "available": price["available"],
            "details": price["details"],
        },
        "tourist_zone": {
            "value": tourist_zone,
            "weight": config.WEIGHT_TOURIST_ZONE,
            "available": True,  # toujours calculable dès qu'on a des coordonnées
            "details": {},
        },
    }

    # --- Agrégation avec redistribution des poids indisponibles ---
    usable = {k: s for k, s in signals.items() if s["value"] is not None}
    total_weight = sum(s["weight"] for s in usable.values())

    if total_weight == 0:
        local_signal = 0.0
    else:
        local_signal = sum(
            s["value"] * s["weight"] for s in usable.values()
        ) / total_weight * 100

    # --- Confiance : part du poids réellement couverte, pondérée par la qualité
    #     des preuves. Le signal langue ne compte qu'à hauteur de son volume d'avis.
    declared_weight = sum(s["weight"] for s in signals.values())
    covered = sum(
        s["weight"] * (lang_conf if k == "language" else 1.0)
        for k, s in usable.items()
    )
    confidence = covered / declared_weight if declared_weight else 0.0

    return {
        "local_signal": round(local_signal, 2),
        "confidence": round(confidence, 3),
        "signals": signals,
    }


# =============================================================================
# PERTINENCE — dynamique
# =============================================================================

def compute_relevance(
    restaurant: dict,
    user_lat: float,
    user_lng: float,
) -> dict:
    """
    Calcule l'adéquation du restaurant à la requête courante.
    Ne dit rien sur l'authenticité — uniquement sur la commodité (D-008).
    """
    proximity = score_geo_user(
        restaurant["lat"], restaurant["lng"], user_lat, user_lng
    )
    distance_m = haversine(
        restaurant["lat"], restaurant["lng"], user_lat, user_lng
    )

    return {
        "proximity": round(proximity, 4),
        "distance_m": round(distance_m),
    }


# =============================================================================
# EXPLICATION — D-009
# =============================================================================

def explain(local: dict, relevance: dict) -> list[str]:
    """
    Traduit les sous-scores en justifications lisibles.

    Le score n'est pas affiché par défaut (D-009) : l'utilisateur veut une liste
    de restaurants, pas un tableau de bord. Ces phrases apparaissent derrière un
    « pourquoi ? ».

    Version par gabarits. À terme, génération par LLM à partir des mêmes données,
    mais les gabarits restent le filet de sécurité — et ils sont vérifiables,
    ce qui compte pour le chapitre XAI du mémoire.
    """
    reasons = []
    s = local["signals"]

    menu = s["menu"]
    if menu["available"]:
        d = menu["details"]
        if d.get("cuisine_count") == 1 and d.get("dish_count"):
            reasons.append(
                f"Carte resserrée : {d['dish_count']} plats, une seule cuisine."
            )
        elif d.get("cuisine_count", 0) > 2:
            reasons.append(
                f"Carte dispersée : {d['cuisine_count']} cuisines différentes."
            )
        if d.get("language_count", 0) >= 4:
            reasons.append(f"Carte traduite en {d['language_count']} langues.")
        if d.get("has_tourist_menu"):
            reasons.append("Propose une formule « menu touristique ».")

    lang = s["language"]
    n = lang["details"]["review_count"]
    if n > 0:
        pct = round(lang["value"] * 100)
        reasons.append(f"Environ {pct}% des avis sont en langue locale ({n} avis).")
    else:
        reasons.append("Aucun avis disponible. Évaluation fondée sur les autres signaux.")

    price = s["price"]
    if price["available"]:
        delta = price["details"]["delta_percent"]
        if delta <= -15:
            reasons.append(f"Prix {abs(delta):.0f}% sous la médiane du quartier.")
        elif delta >= 20:
            reasons.append(f"Prix {delta:.0f}% au-dessus de la médiane du quartier.")

    if s["tourist_zone"]["value"] < 0.5:
        reasons.append("Situé dans une zone touristique très fréquentée.")

    if local["confidence"] < 0.4:
        reasons.append("Information limitée, score provisoire.")

    return reasons


# =============================================================================
# CLASSEMENT
# =============================================================================

def rank_restaurants(
    restaurants: list[dict],
    user_lat: float,
    user_lng: float,
    tourist_sites: list[dict],
    target_lang: str = None,
) -> list[dict]:
    """
    Score et trie les restaurants.

    Classement = Local Signal, modulé par la proximité (D-008) :
    le Local Signal domine, mais un excellent restaurant à 8 km ne doit pas
    devancer un très bon restaurant à 200 m.

    Returns:
        Liste enrichie d'une clé 'scoring', triée par score décroissant.
    """
    beta = config.RANKING_WEIGHT_PROXIMITY
    scored = []

    for resto in restaurants:
        # `peers` = tous les autres restaurants du lot, pour la médiane de prix.
        local = compute_local_signal(
            resto, tourist_sites, peers=restaurants, target_lang=target_lang
        )
        relevance = compute_relevance(resto, user_lat, user_lng)

        final = local["local_signal"] * (1 - beta) + relevance["proximity"] * 100 * beta

        scoring = {
            "score_final": round(final, 2),
            "local_signal": local["local_signal"],
            "confidence": local["confidence"],
            "signals": local["signals"],
            "relevance": relevance,
            "reasons": explain(local, relevance),

            # --- Clés de compatibilité (consommées par les interfaces actuelles) ---
            # À retirer quand le front aura été mis à jour sur le nouveau format.
            "score_geo_user": relevance["proximity"],
            "score_geo_tourist": local["signals"]["tourist_zone"]["value"],
            "score_language": local["signals"]["language"]["value"],
            "score_stars": round(score_stars(resto.get("rating", 0)), 4),
        }

        scored.append({**resto, "scoring": scoring})

    scored.sort(key=lambda r: r["scoring"]["score_final"], reverse=True)
    return scored


# Nom historique conservé : utilisé par backend/main.py et legacy/streamlit_app.py.
score_all_restaurants = rank_restaurants
