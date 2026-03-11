# db/repository.py
# Fonctions CRUD pour interagir avec la base SQLite

from db.models import get_connection


# =============================================================================
# RESERVATIONS
# =============================================================================

def save_reservation(
    restaurant_id: str,
    restaurant_name: str,
    user_name: str,
    user_email: str,
    num_persons: int,
    date: str,
    time_slot: str,
) -> int:
    """
    Enregistre une réservation dans la base.

    Returns:
        ID de la réservation créée
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO reservations (restaurant_id, restaurant_name, user_name, user_email, num_persons, date, time_slot)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (restaurant_id, restaurant_name, user_name, user_email, num_persons, date, time_slot))
    conn.commit()
    reservation_id = cursor.lastrowid
    conn.close()
    return reservation_id


def get_reservations(user_email: str = None) -> list[dict]:
    """Récupère les réservations, optionnellement filtrées par email."""
    conn = get_connection()
    if user_email:
        rows = conn.execute(
            "SELECT * FROM reservations WHERE user_email = ? ORDER BY created_at DESC", (user_email,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM reservations ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


# =============================================================================
# CONSULTATIONS (Historique)
# =============================================================================

def log_consultation(restaurant_id: str, restaurant_name: str, score_final: float = None):
    """Enregistre qu'un restaurant a été consulté."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO consultations (restaurant_id, restaurant_name, score_final)
        VALUES (?, ?, ?)
    """, (restaurant_id, restaurant_name, score_final))
    conn.commit()
    conn.close()


def get_consultations(limit: int = 20) -> list[dict]:
    """Récupère les dernières consultations."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM consultations ORDER BY consulted_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


# =============================================================================
# RECOMMENDATIONS
# =============================================================================

def save_recommendation(restaurant_id: str, restaurant_name: str, reason: str, score_final: float):
    """Sauvegarde une recommandation."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO recommendations (restaurant_id, restaurant_name, reason, score_final)
        VALUES (?, ?, ?, ?)
    """, (restaurant_id, restaurant_name, reason, score_final))
    conn.commit()
    conn.close()


def get_recommendations(limit: int = 10) -> list[dict]:
    """Récupère les meilleures recommandations."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM recommendations ORDER BY score_final DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# =============================================================================
# UTILISATEURS (Users)
# =============================================================================

def create_user(email: str, name: str, password_hash: str, home_lat: float, home_lng: float) -> int:
    """Crée un nouvel utilisateur."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (email, name, password_hash, home_lat, home_lng)
        VALUES (?, ?, ?, ?, ?)
    """, (email, name, password_hash, home_lat, home_lng))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id

def get_user_by_email(email: str) -> dict:
    """Récupère un profil utilisateur."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None

# =============================================================================
# AVIS (Reviews)
# =============================================================================

def get_reviews_by_restaurant(restaurant_id: str) -> list[dict]:
    """Récupère tous les avis d'un restaurant, avec le nom de l'auteur."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT r.*, u.name as user_name 
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.restaurant_id = ?
        ORDER BY r.created_at DESC
    """, (restaurant_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def create_review(restaurant_id: str, user_id: int, rating: float, text: str, language: str) -> int:
    """Ajoute un nouvel avis."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO reviews (restaurant_id, user_id, rating, text, language)
        VALUES (?, ?, ?, ?, ?)
    """, (restaurant_id, user_id, rating, text, language))
    conn.commit()
    review_id = cursor.lastrowid
    conn.close()
    return review_id
