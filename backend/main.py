# backend/main.py
# API REST FastAPI — sert le front web et l'application mobile.
#
# Architecture (D-008) : les endpoints de lecture renvoient le Local Signal
# **précalculé en base**. Aucun signal statique n'est recalculé ici — seule la
# pertinence (distance, filtres) est évaluée à la requête. C'est ce qui permet
# de rester instantané sur une base nationale.

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from backend import config
from backend.core.scoring.geo_score import score_geo_user
from backend.core.scoring.menu_score import score_menu
from backend.ingestion.menu_scan.client import analyze_menu_image
from backend.db.models import init_db
from backend.db import repository as repo

# --- Init ---
init_db()

app = FastAPI(
    title="Local Signal API",
    description="API REST pour l'application Local Signal — scoring et filtrage de restaurants",
    version="0.1.0",
)

# --- CORS (permet au frontend React de consommer l'API) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En prod, restreindre à l'URL du front
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


class ReservationResponse(BaseModel):
    id: int
    message: str


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
    limit: int = Query(50, description="Nombre maximum de résultats"),
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

    # --- Classement : Local Signal modulé par la proximité (D-008) ---
    beta = config.RANKING_WEIGHT_PROXIMITY
    for r in restaurants:
        proximity = score_geo_user(r["lat"], r["lng"], lat, lng)
        local = r.get("local_signal") or 0.0
        r["proximity"] = round(proximity, 4)
        r["score_final"] = round(local * (1 - beta) + proximity * 100 * beta, 2)

    restaurants.sort(key=lambda r: r["score_final"], reverse=True)

    return {"count": len(restaurants), "restaurants": restaurants[:limit]}


@app.get("/api/restaurant/{restaurant_id}")
def get_restaurant(restaurant_id: str):
    """Détail d'un restaurant, avec sa dernière carte scannée si elle existe."""
    resto = repo.get_restaurant(restaurant_id)
    if not resto:
        raise HTTPException(status_code=404, detail="Restaurant non trouvé.")

    resto["menu"] = repo.get_latest_menu(restaurant_id)
    repo.log_consultation(restaurant_id, resto["name"], resto.get("local_signal"))
    return resto


@app.get("/api/stats")
def stats(zone: Optional[str] = Query(None, description="Filtrer par zone")):
    """
    État de la base : combien de restaurants, combien de labels.

    Sert à suivre l'avancement de la vérité terrain (D-006), qui conditionne
    toute calibration.
    """
    return repo.label_stats(zone)


@app.post("/api/reservations", response_model=ReservationResponse)
def create_reservation(req: ReservationRequest):
    """Crée une nouvelle réservation."""
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

    return {
        "provider": provider or config.VISION_PROVIDER,
        "readable": analysis.readable,
        "observations": analysis.model_dump(exclude={"readable", "notes"}),
        "menu_score": scored["score"],
        "details": scored["details"],
        "notes": analysis.notes,
    }
