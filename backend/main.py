# backend/main.py
# API REST FastAPI — sert le même backend au Streamlit ET au React

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sys
import os

# Ajouter le dossier parent au path pour les imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.mock_data import MOCK_RESTAURANTS
from data.mock_tourist_sites import TOURIST_SITES
from scoring.engine import score_all_restaurants
from filters.restaurant_filter import apply_filters
from api.google_places import search_nearby
from db.models import init_db
from db.repository import save_reservation, get_reservations, log_consultation, get_consultations

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
def get_restaurants(
    lat: float = Query(48.8566, description="Latitude de l'utilisateur"),
    lng: float = Query(2.3522, description="Longitude de l'utilisateur"),
    lieu: Optional[str] = Query(None, description="Ville"),
    types: Optional[str] = Query(None, description="Types de nourriture (séparés par des virgules)"),
    ambiances: Optional[str] = Query(None, description="Ambiances (séparées par des virgules)"),
    allergenes: Optional[str] = Query(None, description="Contraintes alimentaires (séparées par virgules)"),
    budget_min: int = Query(0, description="Budget minimum"),
    budget_max: int = Query(200, description="Budget maximum"),
    target_lang: str = Query("fr", description="Langue cible pour le scoring"),
):
    """
    Retourne la liste des restaurants scorés et filtrés.
    """
    # Récupération des restaurants (mock ou API)
    restaurants = search_nearby(lat, lng)

    # Construction des critères de filtre
    criteria = {
        "budget": (budget_min, budget_max),
    }
    if lieu:
        criteria["lieu"] = lieu
    if types:
        criteria["types_nourriture"] = [t.strip() for t in types.split(",")]
    if ambiances:
        criteria["ambiance"] = [a.strip() for a in ambiances.split(",")]
    if allergenes:
        criteria["allergenes"] = [a.strip() for a in allergenes.split(",")]

    # Filtrage
    filtered = apply_filters(restaurants, criteria)

    # Scoring
    scored = score_all_restaurants(
        filtered,
        user_lat=lat,
        user_lng=lng,
        tourist_sites=TOURIST_SITES,
        target_lang=target_lang,
    )

    # Nettoyage pour la sérialisation JSON (enlever les tuples des horaires)
    results = []
    for r in scored:
        clean = {**r}
        clean["horaires"] = [
            {"start": h[0], "end": h[1]} for h in r.get("horaires", [])
        ]
        results.append(clean)

    return {"count": len(results), "restaurants": results}


@app.get("/api/restaurant/{restaurant_id}")
def get_restaurant(restaurant_id: str):
    """Retourne les détails d'un restaurant par son ID."""
    restaurants = search_nearby(48.8566, 2.3522)
    resto = next((r for r in restaurants if r.get("id") == restaurant_id), None)
    if not resto:
        return {"error": "Restaurant non trouvé"}

    clean = {**resto}
    clean["horaires"] = [
        {"start": h[0], "end": h[1]} for h in resto.get("horaires", [])
    ]
    return clean


@app.post("/api/reservations", response_model=ReservationResponse)
def create_reservation(req: ReservationRequest):
    """Crée une nouvelle réservation."""
    reservation_id = save_reservation(
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
    return get_reservations(email)


@app.get("/api/consultations")
def list_consultations(limit: int = 20):
    """Liste l'historique des consultations."""
    return get_consultations(limit)


@app.get("/api/tourist-sites")
def list_tourist_sites():
    """Liste les sites touristiques."""
    return TOURIST_SITES
