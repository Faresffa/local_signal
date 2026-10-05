# backend/main.py
# API REST FastAPI — sert le front web et l'application mobile.
#
# Architecture (D-008) : les endpoints de lecture renvoient le Local Signal
# **précalculé en base**. Aucun signal statique n'est recalculé ici — seule la
# pertinence (distance, filtres) est évaluée à la requête. C'est ce qui permet
# de rester instantané sur une base nationale.

import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional

from backend import config
from backend.core.auth import limitation, security
from backend.core.auth.dependencies import (
    get_current_user, get_current_user_optional, jeton_de_session, require_admin,
)
from backend.core.cuisines import label as cuisine_label, options as cuisine_options
from backend.core.filters.criteres import (
    appliquer as appliquer_filtres, est_ouvert,
)
from backend.core.scoring.engine import explain
from backend.core.scoring.geo_score import haversine, score_geo_user
from backend.core.scoring.menu_score import score_menu
from backend.ingestion.menu_scan.client import analyze_menu_image
from backend.db.models import init_db
from backend.db import repository as repo
from backend.core.journal import JournalRequetes, configurer as configurer_journal
from backend.core.stockage import ErreurStockage, stockage

# --- Init ---
# La journalisation d'abord : sans elle, une erreur pendant `init_db` ne
# laisserait aucune trace (LS-25).
configurer_journal()

# Amorçage depuis une archive, pour un premier déploiement sur un volume
# vide (Railway notamment — pas d'équivalent SQLite au `DATABASE_URL` de
# Postgres, donc pas de base déjà peuplée à brancher).
#
# `SEED_DB_URL` (facultatif, vide partout ailleurs — aucun effet en local
# ni en CI) pointe vers une copie de `local_signal.db` déjà peuplée
# (restaurants importés, vérité terrain, comptes de démonstration…).
# NE S'EXÉCUTE QUE SI LE FICHIER N'EXISTE PAS ENCORE à `DB_PATH` : un
# redémarrage ne doit jamais écraser une base qui a depuis reçu de vraies
# inscriptions ou de vrais comptes restaurateur.
_seed_url = os.environ.get("SEED_DB_URL", "").strip()
if _seed_url and not config.DATABASE_URL and not os.path.exists(config.DB_PATH):
    logging.getLogger("api").info("Amorçage de la base depuis SEED_DB_URL…")
    _reponse = requests.get(_seed_url, timeout=120)
    _reponse.raise_for_status()
    os.makedirs(os.path.dirname(config.DB_PATH) or ".", exist_ok=True)
    with open(config.DB_PATH, "wb") as _f:
        _f.write(_reponse.content)
    logging.getLogger("api").info(
        "Base amorcée (%d octets) depuis %s", len(_reponse.content), _seed_url,
    )

init_db()

# Les sessions expirees sont des donnees personnelles conservees sans raison
# (LS-29). Purgees au demarrage : a raison d'un deploiement par jour, cela
# suffit sans ajouter de tache planifiee.
_purgees = repo.purge_expired_sessions()
if _purgees:
    logging.getLogger("api").info("%d session(s) expiree(s) purgee(s)", _purgees)

app = FastAPI(
    title="Local Signal API",
    description="API REST pour l'application Local Signal — scoring et filtrage de restaurants",
    version="0.1.0",
)

# --- Journalisation : une ligne par requete, avec sa duree (LS-25) ---
# Enregistre AVANT le CORS pour que la trace couvre aussi les requetes que le
# CORS rejette — sinon un blocage d'origine serait invisible cote serveur.
app.add_middleware(JournalRequetes)

# --- CORS (permet au frontend React de consommer l'API) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_origin_regex=config.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Modèles Pydantic ---
class ReservationRequest(BaseModel):
    restaurant_id: str
    restaurant_name: str
    user_name: str
    user_email: str
    num_persons: int = 2
    date: str
    time_slot: str
    # Piège à robots (retour utilisateur : anti-spam) : un champ que
    # Reserve.jsx cache visuellement, mais qu'un robot qui remplit tous les
    # champs d'un formulaire renseigne quand même. Un humain ne le voit
    # jamais, donc ne le remplit jamais.
    site_web: Optional[str] = None


class ReservationResponse(BaseModel):
    id: int
    message: str


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    # Case à cocher obligatoire (retour utilisateur), preuve de consentement
    # RGPD aux CGU/politique de confidentialité — voir `accepted_terms_at`
    # dans backend/db/models.py.
    accepted_terms: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordChangeRequest(BaseModel):
    mot_de_passe_actuel: str
    nouveau_mot_de_passe: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    # "user" (défaut), "admin", "restaurateur" ou "hotel" (D-067 ; l'ancien
    # "subscriber" du Pass Voyageur est migré en "user"). Renvoyé au
    # client pour qu'il puisse, par exemple, afficher un lien vers un futur
    # panneau d'administration — mais AUCUNE route protégée ne doit se fier
    # à ce que le client affirme : `require_admin` relit toujours le rôle en
    # base, jamais une valeur transmise par le front.
    role: str = "user"
    # Rendu UNIQUEMENT aux clients qui le réclament par l'en-tête
    # `X-Jeton-Session` — le mobile. Un navigateur reçoit `None` et s'appuie
    # sur son cookie httpOnly, qu'aucun script de la page ne peut lire : lui
    # renvoyer le jeton en clair annulerait cette protection (LS-40).
    token: Optional[str] = None


class RestaurateurClaimRequest(BaseModel):
    # `restaurant_id` renseigné = revendication d'une fiche existante.
    # Laissé vide = proposition d'un nouveau restaurant, avec les champs
    # `proposed_*` — au moins `proposed_name`/`proposed_lat`/`proposed_lng`
    # dans ce cas (vérifié dans la route, pas ici : les deux usages du même
    # modèle ont des champs obligatoires différents).
    restaurant_id: Optional[str] = None
    message: Optional[str] = None
    proposed_name: Optional[str] = None
    proposed_address: Optional[str] = None
    proposed_lat: Optional[float] = None
    proposed_lng: Optional[float] = None
    proposed_cuisine: Optional[str] = None
    proposed_phone: Optional[str] = None


class RestaurateurContactRequest(BaseModel):
    phone: Optional[str] = None
    reservation_url: Optional[str] = None
    opening_hours: Optional[str] = None


class SignupHotelRequest(BaseModel):
    """Inscription d'un hôtel ou d'une conciergerie (D-067)."""
    email: str
    password: str
    name: Optional[str] = None
    accepted_terms: bool = False
    nom: str
    adresse: Optional[str] = None
    lat: float
    lng: float


class AbonnementRequest(BaseModel):
    # "visibilite" (29 €), "visibilite_plus" (59 €) pour un restaurateur,
    # "hotel" (49 €) pour un hôtel — voir repository.OFFRES_RESTAURATEUR.
    offre: str


class HotelUpdateRequest(BaseModel):
    nom: Optional[str] = None
    adresse: Optional[str] = None
    couleur: Optional[str] = None
    message: Optional[str] = None


class SignupRestaurateurRequest(BaseModel):
    # Champs de compte, mêmes règles que `SignupRequest` (D-055 v2 : un
    # compte restaurateur n'est jamais un compte client requalifié, il a
    # donc son propre formulaire d'inscription, pas un formulaire client
    # suivi d'une demande séparée).
    email: str
    password: str
    name: Optional[str] = None
    accepted_terms: bool = False
    # Mêmes champs que `RestaurateurClaimRequest` : revendication
    # (`restaurant_id`) ou proposition (`proposed_*`), déposée dans le même
    # geste que la création du compte.
    restaurant_id: Optional[str] = None
    message: Optional[str] = None
    proposed_name: Optional[str] = None
    proposed_address: Optional[str] = None
    proposed_lat: Optional[float] = None
    proposed_lng: Optional[float] = None
    proposed_cuisine: Optional[str] = None
    proposed_phone: Optional[str] = None


# Rôles qui ont les fonctionnalités voyageur (favoris…). "subscriber" reste
# accepté le temps que la migration D-067 passe sur toutes les bases.
ROLES_VOYAGEUR = ("user", "subscriber", "admin")


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/api/restaurants")
def list_restaurants(
    lat: float = Query(..., description="Latitude de l'utilisateur"),
    lng: float = Query(..., description="Longitude de l'utilisateur"),
    radius: int = Query(2000, description="Rayon de recherche en mètres"),
    cuisines: Optional[str] = Query(None, description="Types de cuisine (séparés par des virgules)"),
    budget_min: Optional[int] = Query(None, description="Budget minimum"),
    budget_max: Optional[int] = Query(None, description="Budget maximum"),
    # --- Filtres issus des donnees collectees (D-034) ---
    # Ils retirent des lignes, ils ne reordonnent rien : le classement reste
    # celui du Local Signal module par la proximite (D-008).
    ouvert: bool = Query(False, description="Uniquement ceux ouverts maintenant"),
    reservation: bool = Query(False, description="Uniquement ceux qui acceptent les reservations"),
    avec_carte: bool = Query(False, description="Uniquement ceux dont la carte a ete lue"),
    # Ouvert à tous depuis D-067 (le voyageur ne paie plus rien).
    score_min: Optional[float] = Query(None, description="Local Signal minimum, 0-100"),
    score_max: Optional[float] = Query(None, description="Local Signal maximum, 0-100"),
    limit: int = Query(50, description="Nombre maximum de résultats"),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Restaurants autour d'un point, triés par pertinence.

    Le Local Signal vient de la base (précalculé). Seule la proximité est
    évaluée ici — c'est la séparation statique / dynamique de D-008.

    `lat` et `lng` sont OBLIGATOIRES : pas de coordonnées par défaut, le projet
    doit fonctionner dans n'importe quelle ville (CLAUDE.md §8).
    """
    restaurants = repo.get_restaurants_near(lat, lng, radius_m=radius, limit=500)

    # --- Filtres (pertinence, dynamique) ---
    if cuisines:
        wanted = {c.strip().lower() for c in cuisines.split(",")}
        restaurants = [
            r for r in restaurants
            if r.get("cuisine") and wanted & set(r["cuisine"].lower().split(";"))
        ]
    if budget_min is not None or budget_max is not None:
        lo = budget_min if budget_min is not None else 0
        hi = budget_max if budget_max is not None else 10_000
        # Un restaurant sans prix connu n'est PAS exclu : on ne pénalise pas
        # une information manquante (D-012).
        restaurants = [
            r for r in restaurants
            if r.get("price") is None or lo <= r["price"] <= hi
        ]

    # --- Filtres (D-034) ---
    # Appliques AVANT le calcul de pertinence : inutile de scorer des lignes
    # qu'on va retirer. Une donnee manquante n'exclut jamais, sauf pour le
    # filtre qui porte sur la presence meme (`avec_carte`).
    restaurants = appliquer_filtres(
        restaurants,
        ouvert_maintenant=ouvert,
        avec_reservation=reservation,
        avec_carte=avec_carte,
        score_min=score_min,
        score_max=score_max,
    )

    # --- Classement : Local Signal modulé par la proximité (D-008) ---
    for r in restaurants:
        r["scoring"] = _build_scoring(r, lat, lng, radius=radius)

        # Libelle francais de la cuisine : l'interface ne doit jamais avoir a
        # traduire une etiquette OpenStreetMap elle-meme.
        r["cuisine_label"] = cuisine_label(r.get("cuisine"))
        # Etat d'ouverture, calcule ici car il depend de l'instant de la
        # requete — donc dynamique au sens de D-008. `None` signifie « horaires
        # inconnus », et ne doit pas etre affiche comme « ferme ».
        r["ouvert_maintenant"] = est_ouvert(r.get("opening_hours"))

    restaurants.sort(key=lambda r: r["scoring"]["score_final"], reverse=True)

    # GRATUIT POUR LE VOYAGEUR (D-067) : plus de quota de recherches ni de
    # limite de résultats réservée à un Pass. Le tri a eu lieu au-dessus.
    resultats = restaurants[:limit]

    # Étiquette « partenaire » (D-067), posée APRÈS le tri : elle ne change ni
    # le score ni l'ordre. L'encart « À découvrir dans le quartier » (offre
    # Visibilité+) est une liste SÉPARÉE, jamais mêlée au classement.
    _marquer_partenaires(restaurants)
    _marquer_photo_google(resultats)
    a_decouvrir = [r for r in restaurants if r.get("partenaire") == "visibilite_plus"][:3]

    # Marque les favoris de tout compte connecté — un seul aller-retour base.
    if user:
        favoris = repo.get_favorite_ids(user["id"])
        for r in resultats:
            r["favori"] = r["id"] in favoris

    return {
        "count": len(restaurants),
        "restaurants": resultats,
        "a_decouvrir": a_decouvrir,
    }


@app.get("/api/restaurants/recherche")
def rechercher_restaurants(q: str = Query(..., min_length=2, description="Nom recherché")):
    """
    Recherche par nom, sans position — pour associer une carte scannée au bon
    restaurant (retour utilisateur : « on ne saura même pas c'est quel
    restaurant »).

    PUBLIQUE, PAS `require_admin` : le nom et l'adresse d'un restaurant ne
    sont pas des données sensibles, ils sont déjà visibles via la recherche
    géographique (`/api/restaurants`). Champs minimaux — c'est un sélecteur,
    pas une liste de résultats classée : le scoring n'a rien à y faire.
    """
    restaurants = repo.get_restaurants(limit=10, q=q.strip())
    return {
        "restaurants": [
            {
                "id": r["id"],
                "name": r["name"],
                "address": r.get("address"),
                "cuisine_label": cuisine_label(r.get("cuisine")),
            }
            for r in restaurants
        ]
    }


def _build_scoring(
    restaurant: dict, user_lat: float, user_lng: float, radius: float = None
) -> dict:
    """
    Assemble le bloc `scoring` attendu par les interfaces.

    MÊME FORME que `engine.rank_restaurants` — c'est le contrat unique, et les
    tests portent dessus. Cet endpoint le produisait auparavant à plat
    (`local_signal`, `score_final` à la racine, aucune `reasons`), ce qui ne
    correspondait à rien de ce que le front consommait : d'où des fiches
    entièrement vides côté web et mobile.

    La différence avec `rank_restaurants` est délibérée et tient à D-008 : le
    Local Signal n'est PAS recalculé ici, il est lu tel quel en base. Seules la
    pertinence et l'explication — toutes deux dépendantes de l'utilisateur —
    sont produites à la requête.

    `radius` est le rayon demandé par l'utilisateur. Le transmettre est ce qui
    rend le poids de la proximité honnête (D-027) : normalisée sur une constante
    de 5 km, une recherche à 400 m plaçait tous les résultats entre 0,92 et 0,98
    et la proximité ne pesait plus que 17,5 % au lieu des 30 % annoncés.
    """
    beta = config.RANKING_WEIGHT_PROXIMITY

    signals = restaurant.get("signals") or {}
    local = {
        "local_signal": restaurant.get("local_signal") or 0.0,
        "confidence": restaurant.get("confidence") or 0.0,
        "signals": signals,
    }
    relevance = {
        "proximity": round(
            score_geo_user(
                restaurant["lat"], restaurant["lng"], user_lat, user_lng,
                radius=radius,
            ),
            4,
        ),
        "distance_m": round(
            haversine(restaurant["lat"], restaurant["lng"], user_lat, user_lng)
        ),
    }

    final = local["local_signal"] * (1 - beta) + relevance["proximity"] * 100 * beta

    return {
        "score_final": round(final, 2),
        "local_signal": local["local_signal"],
        "confidence": local["confidence"],
        "signals": signals,
        "relevance": relevance,
        # `explain` tolère un signal absent : il produit alors « information
        # limitée » plutôt que de lever (D-012).
        "reasons": explain(local, relevance) if signals else [],
    }


@app.get("/api/restaurant/{restaurant_id}")
def get_restaurant(
    restaurant_id: str,
    lat: Optional[float] = Query(None, description="Latitude de l'utilisateur"),
    lng: Optional[float] = Query(None, description="Longitude de l'utilisateur"),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Détail d'un restaurant, avec sa dernière carte scannée si elle existe.

    `lat`/`lng` sont facultatifs : sans eux, le bloc `scoring` est renvoyé sans
    distance ni proximité — le Local Signal, lui, ne dépend pas de qui regarde
    (D-008), donc la fiche reste utile même consultée hors contexte.
    """
    resto = repo.get_restaurant(restaurant_id)
    if not resto:
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")

    if lat is not None and lng is not None:
        resto["scoring"] = _build_scoring(resto, lat, lng)
    else:
        resto["scoring"] = _scoring_sans_position(resto)

    resto["cuisine_label"] = cuisine_label(resto.get("cuisine"))
    resto["menu"] = repo.get_latest_menu(restaurant_id)
    resto["ouvert_maintenant"] = est_ouvert(resto.get("opening_hours"))
    _marquer_partenaires([resto])
    _marquer_photo_google([resto])
    if user and user.get("role") in ROLES_VOYAGEUR:
        resto["favori"] = restaurant_id in repo.get_favorite_ids(user["id"])

    # --- Detail du calcul, pour inspection (D-034) ---
    #
    # Ce bloc n'est PAS destine a l'utilisateur final : D-009 impose de ne
    # montrer aucun score par defaut, et une liste de restaurants n'est pas un
    # tableau de bord. Il sert a verifier le calcul pendant le developpement et
    # a instruire le memoire — d'ou son nom explicite.
    #
    # Il expose ce qu'aucune explication en langage naturel ne peut rendre :
    # la contribution chiffree de chaque indicateur, le poids redistribue, et
    # les observations brutes qui ont produit la note.
    # VERROUILLEE PAR DEFAUT (LS-16). D-009 impose de ne montrer aucun score :
    # ce panneau expose l'algorithme indicateur par indicateur. Il reste
    # indispensable pour verifier le calcul et instruire le memoire, mais il
    # n'a rien a faire devant un utilisateur.
    # `EXPOSE_DETAIL_CALCUL=true` l'active pour tout le monde en développement
    # et pour la soutenance ; un compte admin le voit dans tous les cas
    # (LS-refonte) — c'est le seul rôle pour qui ce panneau a un usage réel une
    # fois le produit en ligne.
    if config.EXPOSE_DETAIL_CALCUL or (user and user.get("role") == "admin"):
        resto["detail_calcul"] = _detail_calcul(resto)
    repo.log_consultation(
        restaurant_id, resto["name"], resto.get("local_signal"),
        user_id=user["id"] if user else None,
    )
    return resto


def _scoring_sans_position(resto: dict) -> dict:
    """
    Bloc `scoring` d'un restaurant regardé hors contexte utilisateur.

    Même forme que `_build_scoring`, mais sans `lat`/`lng` : `score_final` et
    la proximité restent `None` puisqu'il n'y a personne dont mesurer la
    distance. Le Local Signal, lui, ne dépend pas de qui regarde (D-008), donc
    reste plein — c'est ce qui rend cette vue utile pour la page admin, qui
    parcourt toute la base sans point de départ.
    """
    signals = resto.get("signals") or {}
    local = {
        "local_signal": resto.get("local_signal") or 0.0,
        "confidence": resto.get("confidence") or 0.0,
        "signals": signals,
    }
    relevance = {"proximity": None, "distance_m": None}
    return {
        "score_final": None,
        **local,
        "relevance": relevance,
        "reasons": explain(local, relevance) if signals else [],
    }


def _detail_calcul(resto: dict) -> dict:
    """
    Decompose le Local Signal indicateur par indicateur.

    Montre, pour chacun : sa valeur, son poids declare, le poids qu'il pese
    REELLEMENT apres redistribution, et sa contribution en points. La somme des
    contributions doit egaler le Local Signal — c'est la verification que le
    lecteur peut faire lui-meme.
    """
    signaux = resto.get("signals") or {}
    if not signaux:
        return {"disponible": False, "raison": "aucun signal calcule"}

    utilisables = {k: s for k, s in signaux.items() if s.get("value") is not None}
    poids_total = sum(s["weight"] for s in utilisables.values())
    poids_declare = sum(s["weight"] for s in signaux.values())

    lignes = []
    for cle, s in signaux.items():
        dispo = s.get("value") is not None
        # Le poids EFFECTIF n'est pas le poids declare : quand un indicateur
        # manque, le sien est reparti sur les autres (D-012).
        effectif = (s["weight"] / poids_total) if (dispo and poids_total) else 0.0
        lignes.append({
            "indicateur": cle,
            "disponible": dispo,
            "valeur": s.get("value"),
            "poids_declare": s["weight"],
            "poids_effectif": round(effectif, 4),
            "contribution": round((s["value"] or 0) * effectif * 100, 2) if dispo else 0.0,
            "details": s.get("details") or {},
        })

    manquants = [l["indicateur"] for l in lignes if not l["disponible"]]

    return {
        "disponible": True,
        "local_signal": resto.get("local_signal"),
        "confiance": resto.get("confidence"),
        "indicateurs": lignes,
        "poids_declare_total": round(poids_declare, 3),
        "poids_disponible_total": round(poids_total, 3),
        "indicateurs_manquants": manquants,
        "note_methode": (
            "Le poids d'un indicateur indisponible est redistribue sur les "
            "autres (D-012) : l'absence reduit la confiance, elle ne penalise "
            "pas le score. La somme des contributions egale le Local Signal."
        ),
        "ponderations_calibrees": False,
    }


# =============================================================================
# ADMINISTRATION (LS-refonte) — réservé aux comptes `role = "admin"`
# =============================================================================
#
# Parcourt TOUTE la base, pas un rayon autour d'un point : ces deux routes
# n'ont donc pas de `lat`/`lng`, contrairement à `/api/restaurants`. Le
# `scoring` renvoyé est celui de `_scoring_sans_position` — même Local Signal,
# mais sans prétendre à une pertinence qui n'a pas de sens ici.
#
# `require_admin` relit le rôle en base à chaque appel (voir sa docstring) :
# aucune de ces deux routes ne fait confiance à autre chose.

@app.get("/api/admin/restaurants")
def admin_list_restaurants(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Filtre par nom"),
    restaurateur_statut: Optional[str] = Query(
        None, description="'valide', 'en_attente' ou 'sans' (D-057)"
    ),
    admin: dict = Depends(require_admin),
):
    """
    Tous les restaurants de la base, paginés — la vue d'ensemble admin.

    Même forme que `/api/restaurants` (`scoring`, `cuisine_label`, etc.) pour
    que le front réutilise `RestaurantCard` tel quel, sans variante. Porte
    en plus `restaurateur_statut` sur chaque fiche (`valide` / `en_attente`
    / `sans`) et, sans filtre, trie les fiches validées puis en attente en
    premier (D-057) — c'est précisément ce qu'un admin doit pouvoir traiter.
    """
    restaurants = repo.get_restaurants(
        limit=limit, offset=offset, q=q,
        restaurateur_statut=restaurateur_statut, avec_statut_restaurateur=True,
    )
    for r in restaurants:
        r["scoring"] = _scoring_sans_position(r)
        r["cuisine_label"] = cuisine_label(r.get("cuisine"))
        r["ouvert_maintenant"] = est_ouvert(r.get("opening_hours"))
    return {
        "total": repo.count_restaurants(q=q, restaurateur_statut=restaurateur_statut),
        "limit": limit,
        "offset": offset,
        "restaurants": restaurants,
    }


@app.get("/api/admin/restaurants/{restaurant_id}")
def admin_get_restaurant(restaurant_id: str, admin: dict = Depends(require_admin)):
    """
    Fiche complète d'un restaurant : tous les champs bruts de la base, le
    détail du calcul (toujours, indépendamment de `EXPOSE_DETAIL_CALCUL`), le
    dernier menu lu, les photos de carte, les avis et les métadonnées des
    cartes soumises.
    """
    resto = repo.get_restaurant(restaurant_id)
    if not resto:
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")

    resto["scoring"] = _scoring_sans_position(resto)
    resto["cuisine_label"] = cuisine_label(resto.get("cuisine"))
    resto["ouvert_maintenant"] = est_ouvert(resto.get("opening_hours"))
    resto["menu"] = repo.get_latest_menu(restaurant_id)
    resto["detail_calcul"] = _detail_calcul(resto)
    resto["cartes"] = repo.get_menu_submissions(restaurant_id)
    resto["avis"] = repo.get_user_reviews(restaurant_id, limit=100)
    return resto


class AdminUpdateRestaurantRequest(BaseModel):
    opening_hours: Optional[str] = None
    cuisine: Optional[str] = None


@app.patch("/api/admin/restaurants/{restaurant_id}")
def admin_update_restaurant(
    restaurant_id: str,
    req: AdminUpdateRestaurantRequest,
    admin: dict = Depends(require_admin),
):
    """
    Corrige les horaires ou le type de cuisine d'un restaurant.

    Volontairement restreint à `CHAMPS_MODIFIABLES_ADMIN`
    (backend/db/repository.py) : ce n'est pas un CRUD générique sur la base,
    seulement la correction des deux champs les plus visiblement faux au
    quotidien. Étendre la liste se fait là, pas en assouplissant cette route.
    """
    if not repo.get_restaurant(restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")

    champs = {k: v for k, v in req.model_dump().items() if v is not None}
    if not champs:
        raise HTTPException(status_code=400, detail="Rien à modifier.")

    repo.update_restaurant_fields(restaurant_id, champs)
    return repo.get_restaurant(restaurant_id)


@app.delete("/api/admin/avis/{avis_id}")
def admin_delete_avis(avis_id: int, admin: dict = Depends(require_admin)):
    """
    Retire n'importe quel avis (modération) — `DELETE /api/restaurant/{id}/avis`
    ne retire que celui de l'appelant, délibérément (D-029) ; cette route-ci
    existe pour contourner cette limite, réservée à `require_admin`.
    """
    if not repo.delete_review_by_id(avis_id):
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    return {"message": "Avis supprimé."}


# --- File d'attente des demandes restaurateur (D-055) — validation humaine ---

@app.get("/api/admin/demandes-restaurateur")
def admin_lister_demandes(admin: dict = Depends(require_admin)):
    """Demandes restaurateur en attente, les plus anciennes d'abord."""
    return {"demandes": repo.get_pending_claims()}


@app.post("/api/admin/demandes-restaurateur/{claim_id}/valider")
def admin_valider_demande(claim_id: int, admin: dict = Depends(require_admin)):
    """
    Valide une demande : pose le propriétaire sur la fiche, la crée si elle
    n'existait pas encore (proposition d'un nouveau restaurant).
    """
    resultat = repo.approve_claim(claim_id, admin["id"])
    if not resultat:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    return resultat


@app.post("/api/admin/demandes-restaurateur/{claim_id}/refuser")
def admin_refuser_demande(claim_id: int, admin: dict = Depends(require_admin)):
    """Refuse une demande restaurateur. La fiche visée, si elle existe, n'est pas touchée."""
    repo.reject_claim(claim_id, admin["id"])
    return {"message": "Demande refusée."}


def _rafraichir_photo_google(resto: dict) -> str | None:
    """Nouvelle référence de photo Google pour ce restaurant, ou None."""
    from backend.ingestion.google.places_photos import PlacesError, list_photos

    place_id = (resto.get("google_place_id") or "").strip()
    if not place_id:
        return None
    try:
        photos = list_photos(place_id, limit=1)
    except PlacesError:
        return None
    if not photos:
        return None
    repo.set_photo_ref(resto["id"], photos[0]["name"])
    return photos[0]["name"]


def _marquer_photo_google(restaurants: list[dict]) -> None:
    """
    `photo_google` = une photo Google peut être servie par /photo (clé
    configurée et référence connue). Sans ce drapeau, l'interface demanderait
    une vignette pour chaque restaurant et recevrait des milliers de 404.
    """
    actif = bool(config.GOOGLE_API_KEY)
    for r in restaurants:
        r["photo_google"] = (actif and bool((r.get("photo_ref") or "").strip())
                             and not r.get("photo_masquee"))


@app.get("/api/restaurant/{restaurant_id}/photo")
def get_restaurant_photo(restaurant_id: str):
    """
    Photo du restaurant (D-025).

    Sert l'image telle que la fournit Google Places. Le régime — cache local ou
    relais direct — est décidé par `config.PHOTO_CACHE_ENABLED` et n'est connu
    que de `photo_cache` : cet endpoint est identique dans les deux cas.

    Retourne 404 si le restaurant n'a pas de photo connue. C'est un cas normal,
    pas une anomalie : toutes les fiches Google n'ont pas d'image, et les
    interfaces doivent simplement afficher leur visuel de repli.
    """
    resto = repo.get_restaurant(restaurant_id)
    if not resto:
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")

    photo_ref = (resto.get("photo_ref") or "").strip()
    if not photo_ref:
        raise HTTPException(status_code=404, detail="Aucune photo pour ce restaurant.")

    from backend.ingestion.google import photo_cache
    from backend.ingestion.google.places_photos import PlacesError

    try:
        data = photo_cache.read(restaurant_id, photo_ref)
    except PlacesError as e:
        # Les références de photo Google finissent par expirer : on en
        # redemande une à partir du place_id (conservable sans limite), une
        # seule fois. Quota atteint ou clé invalide : l'interface affiche son
        # repli, on ne casse jamais une page pour une vignette.
        nouvelle = _rafraichir_photo_google(resto)
        if not nouvelle:
            raise HTTPException(status_code=404, detail=str(e)) from e
        try:
            data = photo_cache.read(restaurant_id, nouvelle)
        except PlacesError as e2:
            raise HTTPException(status_code=404, detail=str(e2)) from e2

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            # Les photos Google exigent l'attribution de leur auteur. L'en-tête
            # ne la remplace pas — les interfaces doivent l'afficher — mais il
            # garde la trace de la provenance au plus près de la donnée.
            "X-Photo-Source": "Google Places",
            # Photo relayée, jamais stockée par nous (CGU Google) : le
            # navigateur peut la garder un jour, pas davantage.
            "Cache-Control": "public, max-age=86400",
        },
    )


@app.get("/api/restaurant/{restaurant_id}/photo-restaurateur")
def get_restaurant_photo_restaurateur(restaurant_id: str):
    """
    Photo déposée par le restaurateur propriétaire (D-059) — endpoint
    distinct de `/photo` ci-dessus (D-025, photos Google Places) : la
    provenance et le droit de redistribution ne sont pas les mêmes, mieux
    vaut deux routes explicites qu'une seule qui mélangerait les deux sans
    le dire.

    404 si aucune photo — cas normal (la plupart des fiches n'en ont pas
    encore), pas une anomalie : les interfaces retombent sur leur visuel
    de repli (`CuisineVisual`, D-035).
    """
    resto = repo.get_restaurant(restaurant_id)
    if not resto or not resto.get("photo_key"):
        raise HTTPException(status_code=404, detail="Aucune photo pour ce restaurant.")

    data = stockage().lire(resto["photo_key"])
    if data is None:
        raise HTTPException(status_code=404, detail="Aucune photo pour ce restaurant.")

    return Response(
        content=data,
        media_type=resto.get("photo_type") or "image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/cuisines")
def list_cuisines(zone: Optional[str] = Query(None, description="Filtrer par zone")):
    """
    Cuisines réellement présentes en base, avec leur libellé français.

    Alimente les filtres de l'interface : on ne propose jamais un filtre qui ne
    renverrait aucun résultat.
    """
    return cuisine_options([r.get("cuisine") for r in repo.get_restaurants(zone)])


@app.get("/api/stats")
def stats(zone: Optional[str] = Query(None, description="Filtrer par zone")):
    """
    État de la base : combien de restaurants, combien de labels.

    Sert à suivre l'avancement de la vérité terrain (D-006), qui conditionne
    toute calibration.
    """
    return repo.label_stats(zone)


def _issue_session(response: Response, user_id: int) -> str:
    """
    Ouvre une session, pose le cookie httpOnly, et rend le jeton.

    Le jeton rendu n'est transmis au client que s'il l'a demandé
    (`_jeton_demande`). Le cookie, lui, est posé dans tous les cas.
    """
    token = security.generate_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=config.SESSION_TTL_DAYS)
    repo.create_session(user_id, security.hash_token(token), expires_at.isoformat())
    response.set_cookie(
        key=config.SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=config.SESSION_COOKIE_SECURE,
        samesite=config.SESSION_COOKIE_SAMESITE,
        max_age=config.SESSION_TTL_DAYS * 86400,
        path="/",
    )
    return token


def _jeton_demande(request: Request) -> bool:
    """
    Le client réclame-t-il le jeton dans le corps de la réponse ?

    Explicite plutôt que deviné. On pourrait renifler l'agent utilisateur pour
    reconnaître un mobile : ce serait fragile et silencieusement faux le jour
    où l'agent change. Un en-tête que seul le client mobile pose dit exactement
    ce qu'il veut, et le web n'a rien à faire pour continuer à ne pas le
    recevoir.
    """
    return (request.headers.get("x-jeton-session") or "").lower() in {"1", "oui", "true"}


def _to_user_response(user: dict, token: Optional[str] = None) -> UserResponse:
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user.get("name"),
        role=user.get("role") or "user",
        token=token,
    )


@app.post("/api/auth/signup", response_model=UserResponse)
def signup(req: SignupRequest, request: Request, response: Response):
    """Crée un compte et ouvre immédiatement une session (connexion auto)."""
    # Avant toute validation : créer des comptes en masse n'a aucun usage
    # légitime, et chaque création coûte un hachage bcrypt (LS-28).
    limitation.garder_inscription(request)

    email = req.email.strip().lower()
    nom = (req.name or "").strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Adresse email invalide.")
    # Nom d'utilisateur obligatoire (LS-refonte) : c'est lui qui s'affiche
    # partout (avis, en-tête) — un compte sans nom retombait sur l'email,
    # que D-039 interdit justement de montrer à d'autres utilisateurs.
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom d'utilisateur est requis.")
    if len(req.password) < 8:
        raise HTTPException(
            status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères."
        )
    # Case à cocher obligatoire (retour utilisateur) — sans preuve de
    # consentement, les CGU/politique de confidentialité ne sont que du
    # texte affiché, jamais accepté.
    if not req.accepted_terms:
        raise HTTPException(
            status_code=400,
            detail="Vous devez accepter les CGU et la politique de confidentialité.",
        )
    if repo.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé.")

    user_id = repo.create_user(
        email=email, password_hash=security.hash_password(req.password), name=nom,
        accepted_terms_at=datetime.now(timezone.utc).isoformat(),
    )
    jeton = _issue_session(response, user_id)
    return _to_user_response(
        repo.get_user_by_id(user_id), jeton if _jeton_demande(request) else None
    )


@app.post("/api/auth/signup-restaurateur", response_model=UserResponse)
def signup_restaurateur(req: SignupRestaurateurRequest, request: Request, response: Response):
    """
    Crée un compte restaurateur et sa demande de revendication/création,
    dans le même geste, et ouvre la session (D-055 v2).

    MÊMES VALIDATIONS QUE `signup`, PLUS CELLES DE LA DEMANDE. Un compte
    restaurateur n'est jamais moins bien protégé qu'un compte client parce
    qu'il vient d'un formulaire différent.
    """
    limitation.garder_inscription(request)

    email = req.email.strip().lower()
    nom = (req.name or "").strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Adresse email invalide.")
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom d'utilisateur est requis.")
    if len(req.password) < 8:
        raise HTTPException(
            status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères."
        )
    if not req.accepted_terms:
        raise HTTPException(
            status_code=400,
            detail="Vous devez accepter les CGU et la politique de confidentialité.",
        )
    if repo.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé.")

    if req.restaurant_id:
        if not repo.get_restaurant(req.restaurant_id):
            raise HTTPException(status_code=404, detail="Restaurant non trouvé.")
    elif not (req.proposed_name and req.proposed_lat is not None and req.proposed_lng is not None):
        raise HTTPException(
            status_code=400,
            detail="Nom, latitude et longitude sont nécessaires pour proposer un nouveau restaurant.",
        )

    resultat = repo.create_restaurateur_account(
        email=email, password_hash=security.hash_password(req.password), name=nom,
        accepted_terms_at=datetime.now(timezone.utc).isoformat(),
        restaurant_id=req.restaurant_id, message=req.message,
        proposed_name=req.proposed_name, proposed_address=req.proposed_address,
        proposed_lat=req.proposed_lat, proposed_lng=req.proposed_lng,
        proposed_cuisine=req.proposed_cuisine, proposed_phone=req.proposed_phone,
    )
    jeton = _issue_session(response, resultat["user_id"])
    return _to_user_response(
        repo.get_user_by_id(resultat["user_id"]), jeton if _jeton_demande(request) else None
    )


@app.post("/api/auth/login", response_model=UserResponse)
def login(req: LoginRequest, request: Request, response: Response):
    """Vérifie les identifiants et ouvre une session."""
    # AVANT la vérification du mot de passe, jamais après : un compteur qui ne
    # s'incrémente qu'en cas d'échec avéré laisse passer autant de tentatives
    # qu'on veut tant qu'elles échouent vite (LS-28).
    limitation.garder_connexion(request, req.email)

    user = repo.get_user_by_email(req.email)
    # Message générique dans les deux cas : ne jamais révéler si l'email existe.
    if not user or not security.verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    # Connexion réussie : on efface le compteur du compte, pour ne pas pénaliser
    # l'utilisateur maladroit qui finit par retrouver son mot de passe.
    limitation.liberer_connexion(req.email)

    jeton = _issue_session(response, user["id"])
    return _to_user_response(user, jeton if _jeton_demande(request) else None)


# --- Connexion Google (OAuth 2.0) — LS-refonte ------------------------------
#
# Flux "authorization code" côté serveur (RFC 6749 §4.1), pas le flux
# implicite : le Client Secret ne quitte jamais ce serveur, contrairement à un
# jeton émis directement au navigateur.
#
# `state` protège contre le CSRF (RFC 6749 §10.12) : un attaquant qui forgerait
# un lien vers /callback avec son propre `code` ne connaît pas la valeur posée
# dans le cookie `ls_oauth_state`, donc sa requête est rejetée avant tout appel
# à Google.
#
# Ces deux routes sont des NAVIGATIONS DE PAGE (le navigateur y est redirigé
# par Google), pas des appels `fetch` — d'où `RedirectResponse` plutôt qu'un
# `UserResponse` JSON : il n'y a personne côté React pour lire un JSON ici.

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
_OAUTH_STATE_COOKIE = "ls_oauth_state"


@app.get("/api/auth/google/login")
def google_login(response: Response):
    """Redirige vers l'écran de consentement Google."""
    if not config.GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Connexion Google non configurée (GOOGLE_OAUTH_CLIENT_ID manquant).",
        )

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": config.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": config.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        # Réaffiche le compte Google déjà connu au lieu de forcer un choix de
        # compte à chaque connexion — un aller-retour de moins.
        "prompt": "select_account",
    }
    redirect = RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}")
    redirect.set_cookie(
        key=_OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=config.SESSION_COOKIE_SECURE,
        samesite=config.SESSION_COOKIE_SAMESITE,
        max_age=600,  # le temps de l'aller-retour Google, pas plus
        path="/api/auth/google",
    )
    return redirect


@app.get("/api/auth/google/callback")
def google_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Échange le code contre un profil Google, ouvre ou crée le compte."""
    echec = f"{config.FRONTEND_URL}/?erreur=google"

    if error or not code:
        return RedirectResponse(echec)

    cookie_state = request.cookies.get(_OAUTH_STATE_COOKIE)
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return RedirectResponse(echec)

    jeton = requests.post(
        _GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": config.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": config.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": config.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if jeton.status_code != 200:
        logging.getLogger("local_signal").error(
            "google_oauth: echange de code refuse (%s)", jeton.status_code
        )
        return RedirectResponse(echec)

    access_token = jeton.json().get("access_token")
    profil = requests.get(
        _GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if profil.status_code != 200:
        return RedirectResponse(echec)

    infos = profil.json()
    google_id = infos.get("sub")
    email = (infos.get("email") or "").strip().lower()
    if not google_id or not email:
        return RedirectResponse(echec)

    user = repo.get_user_by_google_id(google_id)
    if not user:
        existant = repo.get_user_by_email(email)
        if existant:
            # Même produit, même compte (D-037) : quelqu'un qui a un compte
            # par mot de passe et se connecte un jour avec Google ne doit pas
            # se retrouver avec deux comptes distincts.
            repo.link_google_id(existant["id"], google_id)
            user = existant
        else:
            # Mot de passe aléatoire, jamais révélé à personne : rend la
            # connexion par mot de passe infaisable pour ce compte tant qu'il
            # n'en a pas choisi un explicitement (D-016 : jamais de secret
            # prévisible, y compris pour un compte qu'on crée nous-mêmes).
            secret_inutilisable = security.hash_password(secrets.token_urlsafe(32))
            user_id = repo.create_google_user(
                email=email,
                password_hash=secret_inutilisable,
                name=infos.get("name"),
                google_id=google_id,
            )
            user = repo.get_user_by_id(user_id)

    redirect = RedirectResponse(config.FRONTEND_URL)
    redirect.delete_cookie(_OAUTH_STATE_COOKIE, path="/api/auth/google")
    _issue_session(redirect, user["id"])
    return redirect


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    """Révoque la session courante (si elle existe) et efface le cookie."""
    # Même lecture que l'authentification : un mobile se déconnecte par
    # l'en-tête, faute de cookie à envoyer (LS-40).
    token = jeton_de_session(request)
    if token:
        repo.delete_session(security.hash_token(token))
    response.delete_cookie(config.SESSION_COOKIE_NAME, path="/")
    return {"message": "Déconnecté."}


@app.get("/api/auth/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    """Utilisateur actuellement connecté."""
    return _to_user_response(user)


@app.post("/api/auth/mot-de-passe")
def changer_mot_de_passe(req: PasswordChangeRequest, user: dict = Depends(get_current_user)):
    """
    Change le mot de passe du compte connecté.

    Fonctionne aussi pour un compte ouvert par Google : son mot de passe
    actuel est un secret aléatoire que personne ne connaît (backend/main.py,
    `google_callback`), donc `mot_de_passe_actuel` échouera toujours pour lui
    tant qu'il n'en a pas déjà choisi un — ce qui est le comportement voulu,
    pas un bug : personne ne doit pouvoir changer un mot de passe qu'il ne
    connaît pas déjà.
    """
    if not security.verify_password(req.mot_de_passe_actuel, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect.")
    if len(req.nouveau_mot_de_passe) < 8:
        raise HTTPException(
            status_code=400, detail="Le nouveau mot de passe doit contenir au moins 8 caractères."
        )
    repo.set_password_hash(user["id"], security.hash_password(req.nouveau_mot_de_passe))
    return {"message": "Mot de passe modifié."}


# =============================================================================
# FAVORIS — ouverts à tout compte voyageur (D-067)
# =============================================================================
#
# Le Pass Voyageur a disparu : un compte suffit. Les comptes professionnels
# (restaurateur, hôtel) n'ont pas les fonctionnalités voyageur (D-055 v2).

def _require_voyageur(user: dict) -> None:
    if user.get("role") not in ROLES_VOYAGEUR:
        raise HTTPException(
            status_code=403, detail="Réservé aux comptes voyageurs."
        )


@app.get("/api/favoris")
def lister_favoris(user: dict = Depends(get_current_user)):
    """Restaurants favoris du compte connecté, même forme qu'une recherche."""
    _require_voyageur(user)
    favoris = repo.get_favorite_restaurants(user["id"])
    for r in favoris:
        r["scoring"] = _scoring_sans_position(r)
        r["cuisine_label"] = cuisine_label(r.get("cuisine"))
        r["ouvert_maintenant"] = est_ouvert(r.get("opening_hours"))
        r["favori"] = True
    return {"restaurants": favoris}


@app.post("/api/favoris/{restaurant_id}")
def ajouter_favori(restaurant_id: str, user: dict = Depends(get_current_user)):
    _require_voyageur(user)
    if not repo.get_restaurant(restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")
    repo.add_favorite(user["id"], restaurant_id)
    return {"message": "Ajouté aux favoris."}


@app.delete("/api/favoris/{restaurant_id}")
def retirer_favori(restaurant_id: str, user: dict = Depends(get_current_user)):
    _require_voyageur(user)
    repo.remove_favorite(user["id"], restaurant_id)
    return {"message": "Retiré des favoris."}


# =============================================================================
# RÔLE RESTAURATEUR (D-055)
# =============================================================================
#
# COMPTE SÉPARÉ, PAS UN COMPTE CLIENT QUI DEVIENT RESTAURATEUR (retour
# utilisateur explicite, D-055 v2) : `POST /api/auth/signup-restaurateur`
# crée le compte avec `role = 'restaurateur'` dès l'inscription, avec sa
# demande de revendication ou de création jointe dans le même geste
# (`repo.create_restaurateur_account`). La fiche visée n'est modifiée qu'à
# la validation humaine (`approve_claim`), comme avant. Le statut
# d'abonnement restaurateur (`abonne` sur `restaurant_claims`) reste
# distinct du `role` client (`user`/`subscriber`/`admin`) — un compte
# restaurateur n'a d'ailleurs plus aucune des fonctionnalités client.

@app.post("/api/restaurateur/demande")
def demander_restaurateur(req: RestaurateurClaimRequest, user: dict = Depends(get_current_user)):
    """
    Dépose une SECONDE demande pour un compte restaurateur déjà existant
    (par exemple après un refus, ou pour une seconde adresse) — la première
    demande se fait exclusivement à l'inscription
    (`POST /api/auth/signup-restaurateur`). Réservée aux comptes déjà
    restaurateurs : un compte client n'a plus ce chemin (D-055 v2).
    """
    if user.get("role") != "restaurateur":
        raise HTTPException(status_code=403, detail="Réservé aux comptes restaurateur.")
    if repo.get_claim_active_for_user(user["id"]):
        raise HTTPException(status_code=409, detail="Une demande est déjà en cours ou validée.")

    if req.restaurant_id:
        if not repo.get_restaurant(req.restaurant_id):
            raise HTTPException(status_code=404, detail="Restaurant non trouvé.")
    elif not (req.proposed_name and req.proposed_lat is not None and req.proposed_lng is not None):
        raise HTTPException(
            status_code=400,
            detail="Nom, latitude et longitude sont nécessaires pour proposer un nouveau restaurant.",
        )

    claim_id = repo.create_restaurant_claim(
        user_id=user["id"], restaurant_id=req.restaurant_id, message=req.message,
        proposed_name=req.proposed_name, proposed_address=req.proposed_address,
        proposed_lat=req.proposed_lat, proposed_lng=req.proposed_lng,
        proposed_cuisine=req.proposed_cuisine, proposed_phone=req.proposed_phone,
    )
    return {"id": claim_id, "message": "Demande envoyée, en attente de validation."}


@app.get("/api/restaurateur/statut")
def statut_restaurateur(user: dict = Depends(get_current_user)):
    """État de la demande du compte connecté, et sa fiche si elle est validée."""
    claim = repo.get_claim_active_for_user(user["id"])
    if not claim:
        return {"claim": None, "restaurant": None}
    restaurant = repo.get_restaurant(claim["restaurant_id"]) if claim["status"] == "valide" else None
    return {"claim": claim, "restaurant": restaurant}


def _require_restaurateur(user: dict) -> dict:
    """Fiche possédée par le compte connecté, ou 403 si aucune."""
    restaurant = repo.get_restaurant_for_owner(user["id"])
    if not restaurant:
        raise HTTPException(status_code=403, detail="Aucune fiche restaurateur validée pour ce compte.")
    return restaurant


@app.get("/api/restaurateur/mon-restaurant")
def mon_restaurant(user: dict = Depends(get_current_user)):
    """Fiche du restaurant possédé par le compte connecté."""
    restaurant = _require_restaurateur(user)
    restaurant["cuisine_label"] = cuisine_label(restaurant.get("cuisine"))
    restaurant["menu"] = repo.get_latest_menu(restaurant["id"])
    return restaurant


@app.patch("/api/restaurateur/mon-restaurant")
def modifier_mon_restaurant(
    req: RestaurateurContactRequest, user: dict = Depends(get_current_user),
):
    """
    Corrige les champs de contact de la fiche possédée — téléphone, lien de
    réservation, horaires. Le menu et les avis restent hors de portée (D-014).
    """
    restaurant = _require_restaurateur(user)
    champs = {k: v for k, v in req.model_dump().items() if v is not None}
    if not champs:
        raise HTTPException(status_code=400, detail="Rien à modifier.")
    repo.update_restaurant_contact(restaurant["id"], **champs)
    return repo.get_restaurant(restaurant["id"])


@app.post("/api/restaurateur/mon-restaurant/photo")
async def deposer_photo_restaurant(
    image: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Dépose la photo de vitrine de la fiche possédée (D-059). Remplace la
    précédente si elle existe — une seule photo, pas une galerie.

    STOCKÉE PUIS REDISTRIBUÉE, CONTRAIREMENT AU CORPUS DE CARTES (D-038).
    Ce n'est pas une contradiction : le corpus de cartes contient des œuvres
    tierces (menus photographiés en vitrine, jamais republiées) ; ici,
    c'est le restaurateur déjà vérifié (D-055) qui dépose la photo de son
    propre établissement — il a le droit de la voir affichée.
    """
    restaurant = _require_restaurateur(user)
    contenu = await image.read()
    if not contenu:
        raise HTTPException(status_code=400, detail="Image vide.")

    plafond = config.MENU_SCAN_MAX_IMAGE_MB * 1024 * 1024
    if len(contenu) > plafond:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop volumineuse (max {config.MENU_SCAN_MAX_IMAGE_MB} Mo).",
        )

    try:
        cle = stockage().deposer(contenu, image.content_type)
    except ErreurStockage as e:
        raise HTTPException(status_code=400, detail=str(e))

    repo.set_restaurant_photo(restaurant["id"], cle, image.content_type)
    return repo.get_restaurant(restaurant["id"])


@app.get("/api/restaurateur/tableau-de-bord")
def tableau_de_bord_restaurateur(user: dict = Depends(get_current_user)):
    """
    Tableau de bord du restaurateur (D-068).

    CE QUI EST GRATUIT, CE QUI EST RÉSERVÉ (mémoire §4.3, tableau 27) :
    - gratuit pour toute fiche : score et rang, total des consultations du
      mois, demandes de table ;
    - offre Visibilité ou Visibilité+ : statistiques de vues — courbe sur
      30 jours, évolution, heures de visite — et la liste des clients
      (voyageurs connectés qui ont consulté la fiche).
    Les blocs réservés valent `None` sans offre : l'interface affiche alors
    ce qu'ils contiendraient, verrouillé, avec le bouton d'essai.
    """
    restaurant = _require_restaurateur(user)
    abonnement = repo.get_abonnement_actif(user["id"])
    stats = repo.stats_restaurant(restaurant["id"])
    reserve = abonnement is None
    return {
        "restaurant": {
            "id": restaurant["id"], "name": restaurant["name"],
            "local_signal": restaurant.get("local_signal"),
            "confidence": restaurant.get("confidence"),
            "cuisine_label": cuisine_label(restaurant.get("cuisine")),
        },
        "rang": repo.rang_dans_zone(restaurant),
        "abonnement": abonnement,
        "consultations": stats["consultations"],
        "periode_jours": stats["periode_jours"],
        "reservations": repo.reservations_restaurant(restaurant["id"]),
        # --- Réservé à l'offre Visibilité ---
        "statistiques": None if reserve else {
            "consultations_precedentes": stats["consultations_precedentes"],
            "consultations_connectees": stats["consultations_connectees"],
            "serie": stats["serie"],
            "heures": stats["heures"],
        },
        "clients": None if reserve else repo.clients_restaurant(restaurant["id"]),
    }


@app.get("/api/pro/abonnement/historique")
def historique_abonnement(user: dict = Depends(get_current_user)):
    """Toutes les souscriptions du compte pro, la plus récente d'abord."""
    if user.get("role") not in ("restaurateur", "hotel"):
        raise HTTPException(status_code=403, detail="Réservé aux comptes professionnels.")
    return {"historique": repo.historique_abonnements(user["id"])}


@app.get("/api/restaurateur/mon-restaurant/visites")
def visites_mon_restaurant(user: dict = Depends(get_current_user)):
    """
    Fréquentation de la fiche possédée.

    Le TOTAL des consultations reste gratuit pour tout restaurateur ; le
    DÉTAIL des visites fait partie de l'offre Visibilité (statistiques de
    vues, mémoire §4.3, D-067). Sans offre, `visites` est None et
    `detail_reserve` le signale à l'interface.
    """
    restaurant = _require_restaurateur(user)
    abonne = repo.get_abonnement_actif(user["id"]) is not None
    return {
        "total": repo.count_consultations(restaurant["id"]),
        "visites": repo.get_visitor_details(restaurant["id"]) if abonne else None,
        "detail_reserve": not abonne,
    }


# =============================================================================
# OFFRES PROFESSIONNELLES ET HÔTELS (D-067)
# =============================================================================
#
# DÉMONSTRATION, AUCUN PAIEMENT RÉEL : souscrire ouvre l'offre sans encaisser.
# Le jour où Stripe (ou équivalent) sera branché, son webhook de paiement
# confirmé appellera `repo.souscrire` — ces routes seront complétées, pas
# remplacées.
#
# RÈGLE DE NEUTRALITÉ : aucune de ces routes ne touche au score ni à l'ordre
# du classement. Voir `_marquer_partenaires`, appelé APRÈS le tri.

_COULEUR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _slug(texte: str) -> str:
    import unicodedata
    base = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:48] or "hotel"
    candidat, n = base, 2
    while not repo.slug_hotel_disponible(candidat):
        candidat, n = f"{base}-{n}", n + 1
    return candidat


def _require_hotel(user: dict) -> dict:
    hotel = repo.get_hotel_by_user(user["id"])
    if user.get("role") != "hotel" or not hotel:
        raise HTTPException(status_code=403, detail="Réservé aux comptes hôtel.")
    return hotel


def _marquer_partenaires(restaurants: list[dict]) -> None:
    """
    Pose `partenaire` (offre en cours, ou None) sur chaque restaurant.
    Appelé APRÈS le classement : c'est une étiquette d'affichage, elle ne
    change ni le score ni l'ordre (règle de neutralité, D-067).
    """
    offres = repo.offres_partenaires([r["id"] for r in restaurants])
    for r in restaurants:
        r["partenaire"] = offres.get(r["id"])


@app.post("/api/auth/signup-hotel", response_model=UserResponse)
def signup_hotel(req: SignupHotelRequest, request: Request, response: Response):
    """Crée un compte hôtel et sa fiche, puis ouvre la session (D-067)."""
    limitation.garder_inscription(request)

    email = req.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Adresse email invalide.")
    if not (req.nom or "").strip():
        raise HTTPException(status_code=400, detail="Le nom de l'hôtel est requis.")
    if len(req.password) < 8:
        raise HTTPException(
            status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères."
        )
    if not req.accepted_terms:
        raise HTTPException(
            status_code=400,
            detail="Vous devez accepter les CGU et la politique de confidentialité.",
        )
    if not (-90 <= req.lat <= 90 and -180 <= req.lng <= 180):
        raise HTTPException(status_code=400, detail="Position de l'hôtel invalide.")
    if repo.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé.")

    resultat = repo.create_hotel_account(
        email=email, password_hash=security.hash_password(req.password),
        name=(req.name or req.nom).strip(),
        accepted_terms_at=datetime.now(timezone.utc).isoformat(),
        nom=req.nom.strip(), adresse=(req.adresse or "").strip() or None,
        lat=req.lat, lng=req.lng, slug=_slug(req.nom),
    )
    jeton = _issue_session(response, resultat["user_id"])
    return _to_user_response(
        repo.get_user_by_id(resultat["user_id"]), jeton if _jeton_demande(request) else None
    )


@app.get("/api/pro/abonnement")
def mon_abonnement(user: dict = Depends(get_current_user)):
    """Offre en cours du compte pro connecté (None s'il n'en a pas)."""
    if user.get("role") not in ("restaurateur", "hotel"):
        raise HTTPException(status_code=403, detail="Réservé aux comptes professionnels.")
    return {"abonnement": repo.get_abonnement_actif(user["id"])}


@app.post("/api/pro/abonnement")
def souscrire_offre(req: AbonnementRequest, user: dict = Depends(get_current_user)):
    """
    Souscrit (ou change) l'offre du compte pro. Démonstration, sans paiement.
    Un restaurateur doit avoir une fiche validée : on ne vend pas de la
    visibilité pour un restaurant qu'il n'a pas encore prouvé tenir.
    """
    role = user.get("role")
    if role == "restaurateur":
        if req.offre not in repo.OFFRES_RESTAURATEUR:
            raise HTTPException(status_code=400, detail="Offre inconnue.")
        restaurant = _require_restaurateur(user)
        return {"abonnement": repo.souscrire(user["id"], req.offre, restaurant_id=restaurant["id"])}
    if role == "hotel":
        if req.offre != repo.OFFRE_HOTEL:
            raise HTTPException(status_code=400, detail="Offre inconnue.")
        hotel = _require_hotel(user)
        return {"abonnement": repo.souscrire(user["id"], req.offre, hotel_id=hotel["id"])}
    raise HTTPException(status_code=403, detail="Réservé aux comptes professionnels.")


@app.post("/api/pro/abonnement/resilier")
def resilier_offre(user: dict = Depends(get_current_user)):
    if user.get("role") not in ("restaurateur", "hotel"):
        raise HTTPException(status_code=403, detail="Réservé aux comptes professionnels.")
    repo.resilier(user["id"])
    return {"abonnement": None}


@app.get("/api/hotel/mon-hotel")
def mon_hotel(user: dict = Depends(get_current_user)):
    """Fiche, abonnement et nombre de visites de la page de l'hôtel connecté."""
    hotel = _require_hotel(user)
    return {
        **hotel,
        "abonnement": repo.get_abonnement_actif(user["id"]),
        "visites": repo.count_hotel_visites(hotel["id"]),
    }


@app.patch("/api/hotel/mon-hotel")
def modifier_mon_hotel(req: HotelUpdateRequest, user: dict = Depends(get_current_user)):
    hotel = _require_hotel(user)
    champs = {k: v.strip() for k, v in req.model_dump(exclude_none=True).items()}
    if "couleur" in champs and not _COULEUR_RE.match(champs["couleur"]):
        raise HTTPException(status_code=400, detail="Couleur invalide (format #RRGGBB).")
    if "nom" in champs and not champs["nom"]:
        raise HTTPException(status_code=400, detail="Le nom de l'hôtel est requis.")
    repo.update_hotel(hotel["id"], champs)
    return mon_hotel(user)


@app.get("/api/hotels/{slug}")
def page_hotel(slug: str):
    """
    Données publiques de la page « Où manger autour de l'hôtel ». La page
    affiche ensuite le classement NORMAL autour de l'hôtel (même appel que
    la recherche) : l'hôtel ne choisit pas ses restaurants, il les prescrit.
    Une page n'est servie que si l'abonnement de l'hôtel est en cours.
    """
    hotel = repo.get_hotel_by_slug(slug)
    if not hotel or not repo.get_abonnement_actif(hotel["user_id"]):
        raise HTTPException(status_code=404, detail="Page introuvable.")
    repo.log_hotel_visite(hotel["id"])
    return {k: hotel[k] for k in ("nom", "adresse", "lat", "lng", "slug", "couleur", "message")}


@app.get("/api/auth/mes-donnees")
def mes_donnees(user: dict = Depends(get_current_user)):
    """
    Toutes les donnees rattachees au compte connecte.

    Droit d'acces et droit a la portabilite d'un seul coup : la reponse est du
    JSON, donc un format structure et lisible par machine, ce que le reglement
    demande pour la portabilite.

    L'empreinte du mot de passe n'y figure jamais : elle n'aide en rien la
    personne et faciliterait une attaque hors ligne si l'export fuitait.
    """
    return repo.export_user_data(user["id"])


@app.delete("/api/auth/compte")
def supprimer_compte(request: Request, response: Response,
                     user: dict = Depends(get_current_user)):
    """
    Efface definitivement le compte connecte et tout ce qui s'y rattache.

    SUPPRESSION REELLE, PAS DESACTIVATION. Basculer `is_active` laisserait
    l'adresse en base : c'est un masquage, pas un effacement.

    Le cookie est retire dans la foulee : sans cela le navigateur continuerait
    d'envoyer un jeton devenu orphelin, et l'utilisateur verrait une erreur
    d'authentification au lieu d'une deconnexion propre.
    """
    efface = repo.delete_user(user["id"])
    response.delete_cookie(config.SESSION_COOKIE_NAME, path="/")
    return {
        "message": "Compte supprime.",
        "efface": efface,
    }


@app.post("/api/reservations", response_model=ReservationResponse)
def create_reservation(req: ReservationRequest, request: Request):
    """
    Crée une nouvelle réservation.

    Route publique, sans authentification — c'était le seul formulaire du
    site sans aucune garde anti-spam (retour utilisateur). Deux protections,
    comme sur l'inscription (LS-28) : une limite de débit par adresse, et un
    piège à robots.
    """
    # Un robot qui remplit tout le formulaire touche ce champ ; un humain ne
    # le voit jamais (Reserve.jsx) et ne le remplit donc jamais. On renvoie
    # un succès de façade plutôt qu'une erreur, pour ne pas apprendre au
    # robot à retirer ce champ précis la prochaine fois.
    if (req.site_web or "").strip():
        return ReservationResponse(
            id=0, message=f"Réservation confirmée pour {req.user_name} à {req.restaurant_name}",
        )

    limitation.garder_reservation(request)

    reservation_id = repo.save_reservation(
        restaurant_id=req.restaurant_id,
        restaurant_name=req.restaurant_name,
        user_name=req.user_name,
        user_email=req.user_email,
        num_persons=req.num_persons,
        date=req.date,
        time_slot=req.time_slot,
    )
    return ReservationResponse(
        id=reservation_id,
        message=f"Réservation confirmée pour {req.user_name} à {req.restaurant_name}",
    )


@app.get("/api/reservations")
def list_reservations(email: Optional[str] = None):
    """Liste les réservations."""
    return repo.get_reservations(email)


@app.get("/api/consultations")
def list_consultations(limit: int = 20):
    """Liste l'historique des consultations."""
    return repo.get_consultations(limit)


@app.get("/api/tourist-sites")
def list_tourist_sites(zone: Optional[str] = Query(None, description="Filtrer par zone")):
    """Sites touristiques servant la pénalité de zone (D-002)."""
    return repo.get_tourist_sites(zone)


@app.post("/api/menu/scan")
async def scan_menu(
    image: UploadFile = File(...),
    restaurant_id: Optional[str] = Query(
        None,
        description="Restaurant auquel rattacher la carte. Sans lui, l'analyse "
                    "est rendue mais n'enrichit pas la base (LS-07).",
    ),
    provider: Optional[str] = Query(
        None,
        description="Forcer un fournisseur de vision ('groq' ou 'claude'). "
                    "Sert au comparatif de précision d'extraction (D-017).",
    ),
):
    """
    Analyse la photo d'une carte de restaurant (D-004).

    Fonctionnalité centrale de l'app mobile : l'utilisateur photographie la carte
    affichée en vitrine et obtient une évaluation immédiate — sans qu'aucun avis
    ne soit nécessaire, ce qui est la réponse au paradoxe de l'invisibilité (D-001).

    Returns:
        {
            "readable": bool,
            "observations": {...},   # ce que le modèle a vu sur la carte
            "menu_score": float|None,
            "details": {...},        # sous-scores, pour l'explication
            "notes": str,
        }
    """
    # Le restaurant est vérifié AVANT de lire l'image et d'appeler le modèle :
    # un identifiant erroné ne doit pas coûter un appel de vision (LS-07).
    if restaurant_id and not repo.get_restaurant(restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant inconnu.")

    content = await image.read()

    max_bytes = config.MENU_SCAN_MAX_IMAGE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop volumineuse (max {config.MENU_SCAN_MAX_IMAGE_MB} Mo).",
        )
    if not content:
        raise HTTPException(status_code=400, detail="Image vide.")

    try:
        analysis = analyze_menu_image(
            content, image.filename or "menu.jpg", provider=provider
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # Clé API non configurée — erreur de déploiement, pas de la requête.
        raise HTTPException(status_code=503, detail=str(e))

    signal = analysis.to_menu_signal()
    scored = score_menu(signal)

    # LE SCAN ENRICHIT LA BASE (LS-07, CLAUDE.md §3).
    #
    # L'analyse etait jusqu'ici rendue puis jetee : la base de menus, presentee
    # comme le seul actif defendable du projet, ne se construisait pas par les
    # scans. Elle le fait desormais — des qu'un restaurant est designe.
    #
    # LA PHOTO EST CONSERVEE, ELLE AUSSI, QUAND UN RESTAURANT EST DESIGNE
    # (D-038). Cette route et `POST /api/restaurant/{id}/carte` font le meme
    # geste ; en conserver l'image d'un cote et la jeter de l'autre rendait la
    # verification possible ou impossible selon le chemin emprunte par
    # l'utilisateur, ce qui n'a aucun sens. Le corpus reste interne et n'est
    # jamais servi.
    #
    # SANS RESTAURANT, ON NE CONSERVE RIEN. Une carte qu'on ne peut rattacher a
    # aucun etablissement ne documente rien de verifiable : la garder ferait
    # grossir un stock d'images sans usage, ce qui est exactement ce que D-021
    # refusait. L'analyse est rendue a l'ecran, et c'est tout.
    enregistre = False
    conservee = False

    if restaurant_id:
        menu_id = repo.save_menu_scan(
            restaurant_id=restaurant_id,
            provider=provider or config.VISION_PROVIDER,
            observations=analysis.model_dump(exclude={"readable", "notes"}),
            menu_score=scored["score"],
            readable=analysis.readable,
        )
        enregistre = True

        # L'echec du depot ne doit pas annuler une analyse reussie : le score
        # est deja calcule et il est juste. On perd la piece justificative,
        # pas la mesure.
        try:
            cle = stockage().deposer(contenu=content, type_mime=image.content_type)
            repo.save_menu_submission(
                restaurant_id=restaurant_id,
                corpus_key=cle,
                mime=image.content_type,
                octets=len(content),
                user_id=None,
                menu_id=menu_id,
            )
            conservee = True
        except ErreurStockage:
            conservee = False

    return {
        "enregistre": enregistre,
        "conservee": conservee,
        "provider": provider or config.VISION_PROVIDER,
        "readable": analysis.readable,
        "observations": analysis.model_dump(exclude={"readable", "notes"}),
        "menu_score": scored["score"],
        "details": scored["details"],
        "notes": analysis.notes,
    }


# =============================================================================
# AVIS LAISSÉS PAR NOS UTILISATEURS — RETIRÉS (D-063)
# =============================================================================
#
# Les routes publiques de lecture et d'écriture d'avis (LS-39, D-039) ont été
# retirées : on ne peut plus laisser d'avis sur un restaurant. Les avis déjà
# déposés restent en base (table des avis, droit d'accès RGPD, modération
# admin via `DELETE /api/admin/avis/{id}`) — rien n'est effacé, seulement
# plus exposé ni alimenté.


# =============================================================================
# CARTE SOUMISE DEPUIS LA FICHE D'UN RESTAURANT (LS-38)
# =============================================================================


@app.post("/api/restaurant/{restaurant_id}/carte")
async def soumettre_carte(
    restaurant_id: str,
    image: UploadFile = File(...),
    analyser: bool = Query(True, description="Lire la carte dans la foulée"),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Reçoit la photo d'une carte, la conserve, et la lit.

    C'EST LE MÉCANISME PAR LEQUEL L'ACTIF DU PROJET SE CONSTRUIT
    (CLAUDE.md §3). Jusqu'ici le scan existait en écran séparé, sans restaurant
    rattaché : l'analyse était rendue puis perdue. Ici la carte est liée au
    restaurant dès l'envoi.

    L'IMAGE EST CONSERVÉE DANS LE CORPUS, jamais servie (LS-38). Ce qui rend la
    conservation défendable, c'est précisément qu'elle n'est pas redistribuée :
    on garde un matériau de vérification, on ne republie pas l'œuvre.

    La connexion n'est PAS exigée : le premier réflexe d'un utilisateur devant
    une carte affichée en vitrine est de la photographier, pas de créer un
    compte. La soumission est alors simplement anonyme.
    """
    if not repo.get_restaurant(restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant inconnu.")

    contenu = await image.read()
    if not contenu:
        raise HTTPException(status_code=400, detail="Image vide.")

    plafond = config.MENU_SCAN_MAX_IMAGE_MB * 1024 * 1024
    if len(contenu) > plafond:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop volumineuse (max {config.MENU_SCAN_MAX_IMAGE_MB} Mo).",
        )

    try:
        cle = stockage().deposer(contenu, image.content_type)
    except ErreurStockage as e:
        raise HTTPException(status_code=400, detail=str(e))

    # L'ANALYSE PEUT ÉCHOUER SANS PERDRE LA CARTE. Le fichier est déjà déposé :
    # si le modèle est indisponible, la contribution est conservée et relisible
    # plus tard. L'inverse — analyser puis stocker — perdrait la photo à chaque
    # panne du fournisseur.
    menu_id = None
    analyse = None
    erreur_analyse = None

    if analyser:
        try:
            resultat = analyze_menu_image(contenu, image.filename or "carte.jpg")
            note = score_menu(resultat.to_menu_signal())
            menu_id = repo.save_menu_scan(
                restaurant_id=restaurant_id,
                provider=config.VISION_PROVIDER,
                observations=resultat.model_dump(exclude={"readable", "notes"}),
                menu_score=note["score"],
                readable=resultat.readable,
            )
            analyse = {
                "readable": resultat.readable,
                "menu_score": note["score"],
                "details": note["details"],
            }
        except Exception as e:
            erreur_analyse = type(e).__name__

    repo.save_menu_submission(
        restaurant_id=restaurant_id,
        corpus_key=cle,
        mime=image.content_type,
        octets=len(contenu),
        user_id=user["id"] if user else None,
        menu_id=menu_id,
    )

    return {
        "message": "Merci — la carte est enregistrée.",
        "conservee": True,
        "analysee": analyse is not None,
        "analyse": analyse,
        "erreur_analyse": erreur_analyse,
    }


@app.get("/api/restaurant/{restaurant_id}/cartes")
def lister_cartes(restaurant_id: str):
    """
    Cartes soumises pour ce restaurant.

    Rend des MÉTADONNÉES, jamais les images : le corpus n'est pas servi. Ce qui
    est exposé, c'est qu'une contribution existe et quand elle a eu lieu — de
    quoi dire « 3 cartes ont été envoyées », pas de quoi les afficher.
    """
    if not repo.get_restaurant(restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant inconnu.")
    soumissions = repo.get_menu_submissions(restaurant_id)
    return {
        "nombre": len(soumissions),
        "cartes": [
            {
                "id": s["id"],
                "soumise_le": s["submitted_at"],
                "lue": s["menu_id"] is not None,
            }
            for s in soumissions
        ],
    }
