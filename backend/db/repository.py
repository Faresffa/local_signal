# backend/db/repository.py
# Accès aux données.
#
# Point d'architecture (D-008) : les lectures de restaurants renvoient le
# Local Signal **déjà calculé et stocké**. Le chemin d'une requête utilisateur
# ne recalcule JAMAIS un signal statique — il ne fait que filtrer, mesurer la
# distance et trier.

import json
import math

from backend.db.models import get_connection
from datetime import datetime


# =============================================================================
# RESTAURANTS
# =============================================================================

def _row_to_restaurant(row) -> dict:
    """Convertit une ligne SQLite en dict exploitable par l'API."""
    r = dict(row)
    if r.get("signals_json"):
        r["signals"] = json.loads(r["signals_json"])
    r.pop("signals_json", None)
    return r


def get_restaurants(zone: str = None, limit: int = None) -> list[dict]:
    """Récupère les restaurants, optionnellement filtrés par zone."""
    conn = get_connection()
    sql = "SELECT * FROM restaurants"
    params = []
    if zone:
        sql += " WHERE zone = ?"
        params.append(zone)
    sql += " ORDER BY local_signal DESC"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [_row_to_restaurant(r) for r in rows]


def get_restaurants_near(
    lat: float,
    lng: float,
    radius_m: float = 2000,
    limit: int = 200,
) -> list[dict]:
    """
    Restaurants dans un rayon donné, avec leur Local Signal précalculé.

    Pré-filtre par une boîte englobante en SQL (indexée sur lat/lng), puis
    affine par Haversine en Python. SQLite n'ayant pas d'index spatial, c'est
    le meilleur compromis à cette échelle — PostGIS prendra le relais
    (docs/ROADMAP.md §4).
    """
    # 1° de latitude ≈ 111 km ; la longitude se resserre avec la latitude.
    d_lat = radius_m / 111_000
    d_lng = radius_m / (111_000 * max(math.cos(math.radians(lat)), 0.01))

    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM restaurants
         WHERE lat BETWEEN ? AND ?
           AND lng BETWEEN ? AND ?
    """, (lat - d_lat, lat + d_lat, lng - d_lng, lng + d_lng)).fetchall()
    conn.close()

    from backend.core.scoring.geo_score import haversine

    results = []
    for row in rows:
        r = _row_to_restaurant(row)
        distance = haversine(r["lat"], r["lng"], lat, lng)
        if distance <= radius_m:
            r["distance_m"] = round(distance)
            results.append(r)

    results.sort(key=lambda x: x["distance_m"])
    return results[:limit]


def get_restaurant(restaurant_id: str) -> dict | None:
    """Récupère un restaurant par son identifiant."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)
    ).fetchone()
    conn.close()
    return _row_to_restaurant(row) if row else None


def get_tourist_sites(zone: str = None) -> list[dict]:
    """Sites touristiques, optionnellement filtrés par zone."""
    conn = get_connection()
    if zone:
        rows = conn.execute(
            "SELECT * FROM tourist_sites WHERE zone = ?", (zone,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM tourist_sites").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# =============================================================================
# CARTES SCANNÉES — l'actif du projet (D-004)
# =============================================================================

def save_menu_scan(
    restaurant_id: str,
    provider: str,
    observations: dict,
    menu_score: float | None,
    readable: bool,
    source_url: str | None = None,
) -> int:
    """
    Enregistre un scan de carte.

    Chaque scan enrichit la base de menus — le seul avantage concurrentiel
    défendable du projet (CLAUDE.md §3).

    Args:
        source_url: provenance de la carte pour une récolte web (D-023).
            Reste None pour un scan utilisateur, dont la photo n'est jamais
            conservée. Permet de mesurer le biais de la voie web en comparant
            les scores par provenance — sans cette colonne, le biais existe
            quand même mais devient invérifiable.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO menus (restaurant_id, provider, observations_json,
                           menu_score, readable, source_url)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        restaurant_id, provider,
        json.dumps(observations, ensure_ascii=False),
        menu_score, int(readable), source_url,
    ))
    conn.commit()
    scan_id = cursor.lastrowid
    conn.close()
    return scan_id


def get_latest_menu(restaurant_id: str) -> dict | None:
    """Dernier scan exploitable d'un restaurant."""
    conn = get_connection()
    row = conn.execute("""
        SELECT * FROM menus
         WHERE restaurant_id = ? AND readable = 1
         ORDER BY scanned_at DESC LIMIT 1
    """, (restaurant_id,)).fetchone()
    conn.close()

    if not row:
        return None
    m = dict(row)
    m["observations"] = json.loads(m.pop("observations_json"))
    return m


# =============================================================================
# VÉRITÉ TERRAIN (D-006)
# =============================================================================

def set_label(
    restaurant_id: str,
    label: str,
    confidence: str,
    sources: dict,
    notes: str = "",
    human_validated: bool = False,
) -> None:
    """
    Enregistre un label de vérité terrain.

    RAPPEL CRITIQUE : le label ne doit JAMAIS dériver des features du modèle
    (distance aux monuments, langue des avis, contenu du menu). Il vient d'une
    source indépendante — le jugement éditorial d'humains. Sinon l'évaluation
    est circulaire et ne mesure rien (docs/data/README.md).
    """
    if label not in ("local", "touristique", "ambigu"):
        raise ValueError(
            f"Label invalide : '{label}'. Valeurs : local, touristique, ambigu."
        )

    conn = get_connection()
    conn.execute("""
        UPDATE restaurants
           SET label = ?, label_confidence = ?, label_sources = ?,
               label_notes = ?, human_validated = ?
         WHERE id = ?
    """, (
        label, confidence, json.dumps(sources, ensure_ascii=False),
        notes, int(human_validated), restaurant_id,
    ))
    conn.commit()
    conn.close()


def get_labeled(zone: str = None) -> list[dict]:
    """Restaurants disposant d'un label de vérité terrain."""
    conn = get_connection()
    sql = "SELECT * FROM restaurants WHERE label IS NOT NULL"
    params = []
    if zone:
        sql += " AND zone = ?"
        params.append(zone)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [_row_to_restaurant(r) for r in rows]


def label_stats(zone: str = None) -> dict:
    """Avancement de la labellisation — combien reste-t-il à faire."""
    conn = get_connection()
    where = "WHERE zone = ?" if zone else ""
    params = [zone] if zone else []

    total = conn.execute(
        f"SELECT COUNT(*) AS n FROM restaurants {where}", params
    ).fetchone()["n"]
    rows = conn.execute(
        f"SELECT label, COUNT(*) AS n FROM restaurants {where} "
        f"{'AND' if where else 'WHERE'} label IS NOT NULL GROUP BY label", params
    ).fetchall()
    validated = conn.execute(
        f"SELECT COUNT(*) AS n FROM restaurants {where} "
        f"{'AND' if where else 'WHERE'} human_validated = 1", params
    ).fetchone()["n"]
    conn.close()

    return {
        "total": total,
        "labeled": sum(r["n"] for r in rows),
        "by_label": {r["label"]: r["n"] for r in rows},
        "human_validated": validated,
    }


# =============================================================================
# RÉSERVATIONS / CONSULTATIONS
# =============================================================================

def save_reservation(
    restaurant_id: str, restaurant_name: str, user_name: str,
    user_email: str, num_persons: int, date: str, time_slot: str,
) -> int:
    """Enregistre une réservation. Retourne son identifiant."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO reservations (restaurant_id, restaurant_name, user_name,
                                  user_email, num_persons, date, time_slot)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (restaurant_id, restaurant_name, user_name, user_email,
          num_persons, date, time_slot))
    conn.commit()
    reservation_id = cursor.lastrowid
    conn.close()
    return reservation_id


def get_reservations(user_email: str = None) -> list[dict]:
    """Réservations, optionnellement filtrées par email."""
    conn = get_connection()
    if user_email:
        rows = conn.execute(
            "SELECT * FROM reservations WHERE user_email = ? ORDER BY created_at DESC",
            (user_email,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM reservations ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def log_consultation(restaurant_id: str, restaurant_name: str, score: float = None):
    """Enregistre la consultation d'un restaurant."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO consultations (restaurant_id, restaurant_name, score_final)
        VALUES (?, ?, ?)
    """, (restaurant_id, restaurant_name, score))
    conn.commit()
    conn.close()


def get_consultations(limit: int = 20) -> list[dict]:
    """Dernières consultations."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM consultations ORDER BY consulted_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# =============================================================================
# COMPTES UTILISATEURS / SESSIONS
# =============================================================================

def create_user(email: str, password_hash: str, name: str | None = None) -> int:
    """Crée un compte. Retourne son identifiant."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (email, password_hash, name)
        VALUES (?, ?, ?)
    """, (email.strip().lower(), password_hash, name))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


def get_user_by_email(email: str) -> dict | None:
    """Récupère un compte par email (insensible à la casse)."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    """Récupère un compte par identifiant."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_session(user_id: int, token_hash: str, expires_at: str) -> None:
    """Ouvre une session — le jeton en clair n'est jamais stocké, seul son hash l'est."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    """, (user_id, token_hash, expires_at))
    conn.commit()
    conn.close()


def get_session(token_hash: str) -> dict | None:
    """Session active correspondant au hash de jeton fourni."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM sessions WHERE token_hash = ?", (token_hash,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token_hash: str) -> None:
    """Révoque une session (logout) — suppression immédiate, pas d'expiration différée."""
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    conn.commit()
    conn.close()


# =============================================================================
# DROITS DE LA PERSONNE — RGPD (LS-29)
# =============================================================================
#
# Le produit collecte une adresse e-mail et un mot de passe. Trois droits en
# découlent, et ils ne sont pas optionnels : accès, effacement, portabilité.
# Les implémenter côté base plutôt que dans la route les rend testables et
# réutilisables — et surtout, les rend EXHAUSTIFS : c'est ici qu'on sait
# quelles tables portent une donnée personnelle.


def export_user_data(user_id: int) -> dict:
    """
    Toutes les données rattachées à une personne, pour son droit d'accès.

    CE QUI EST RENDU, ET CE QUI NE L'EST PAS. Le compte, ses sessions ouvertes
    et ses réservations. Jamais l'empreinte du mot de passe : elle est
    strictement un mécanisme d'authentification, la rendre n'aide en rien la
    personne et faciliterait une attaque hors ligne si l'export fuitait.

    Les consultations ne sont PAS rattachées à un compte — elles n'enregistrent
    qu'un restaurant et une date, sans identifiant d'utilisateur. Il n'y a donc
    rien à en extraire, et c'est délibéré.
    """
    conn = get_connection()
    utilisateur = conn.execute(
        "SELECT id, email, name, is_active, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()

    if not utilisateur:
        conn.close()
        return {}

    utilisateur = dict(utilisateur)

    sessions = [
        {"created_at": r["created_at"], "expires_at": r["expires_at"]}
        for r in conn.execute(
            "SELECT created_at, expires_at FROM sessions WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    ]

    # Les réservations portent l'e-mail, pas l'identifiant : c'est ce lien qui
    # les rattache à la personne.
    reservations = [
        dict(r) for r in conn.execute(
            "SELECT * FROM reservations WHERE user_email = ?", (utilisateur["email"],)
        ).fetchall()
    ]

    conn.close()
    return {
        "compte": utilisateur,
        "sessions": sessions,
        "reservations": reservations,
    }


def delete_user(user_id: int) -> dict:
    """
    Efface un compte et tout ce qui s'y rattache. Droit à l'effacement.

    SUPPRESSION RÉELLE, PAS DÉSACTIVATION. Basculer `is_active` à faux
    laisserait l'adresse e-mail en base : ce n'est pas un effacement, c'est un
    masquage, et ça ne satisfait pas la demande.

    Les sessions partent en premier : une session qui survivrait à son compte
    donnerait un accès à un utilisateur qui n'existe plus.

    Returns:
        Le compte de ce qui a été supprimé, pour pouvoir le confirmer à la
        personne — elle a le droit de savoir ce qui a disparu.
    """
    conn = get_connection()
    utilisateur = conn.execute(
        "SELECT email FROM users WHERE id = ?", (user_id,)
    ).fetchone()

    if not utilisateur:
        conn.close()
        return {"sessions": 0, "reservations": 0, "compte": 0}

    email = dict(utilisateur)["email"]
    curseur = conn.cursor()

    curseur.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    sessions = curseur.rowcount

    curseur.execute("DELETE FROM reservations WHERE user_email = ?", (email,))
    reservations = curseur.rowcount

    curseur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    compte = curseur.rowcount

    conn.commit()
    conn.close()
    return {"sessions": sessions, "reservations": reservations, "compte": compte}


def purge_expired_sessions() -> int:
    """
    Supprime les sessions dépassées.

    Une session expirée n'est plus valide mais reste en base : c'est une donnée
    personnelle conservée sans raison, et le RGPD demande une durée de
    conservation limitée à la finalité. Appelée au démarrage, ce qui suffit à
    l'échelle actuelle — un déploiement par jour purge quotidiennement.
    """
    conn = get_connection()
    curseur = conn.cursor()
    curseur.execute("DELETE FROM sessions WHERE expires_at < ?",
                    (datetime.now().isoformat(timespec="seconds"),))
    conn.commit()
    n = curseur.rowcount
    conn.close()
    return n
