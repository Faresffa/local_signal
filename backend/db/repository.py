# backend/db/repository.py
# Accès aux données.
#
# Point d'architecture (D-008) : les lectures de restaurants renvoient le
# Local Signal **déjà calculé et stocké**. Le chemin d'une requête utilisateur
# ne recalcule JAMAIS un signal statique — il ne fait que filtrer, mesurer la
# distance et trier.

import json
import math
import uuid

from backend.db.models import get_connection
from datetime import datetime, timezone


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


# Un restaurant est, du point de vue restaurateur (D-055 à D-057), dans
# exactement un de ces trois états — jamais calculé côté Python à partir de
# deux tables séparées : répété tel quel dans le WHERE et le ORDER BY pour
# que filtrage et tri restent cohérents entre eux.
_RESTAURATEUR_VALIDE = "r.owner_user_id IS NOT NULL"
_CLAIM_EN_ATTENTE_EXISTE = (
    "EXISTS (SELECT 1 FROM restaurant_claims c "
    "WHERE c.restaurant_id = r.id AND c.status = 'en_attente')"
)
_RESTAURATEUR_EN_ATTENTE = f"r.owner_user_id IS NULL AND {_CLAIM_EN_ATTENTE_EXISTE}"
_RESTAURATEUR_SANS = f"r.owner_user_id IS NULL AND NOT {_CLAIM_EN_ATTENTE_EXISTE}"
_RESTAURATEUR_RANG = f"CASE WHEN {_RESTAURATEUR_VALIDE} THEN 0 WHEN {_RESTAURATEUR_EN_ATTENTE} THEN 1 ELSE 2 END"

_RESTAURATEUR_CLAUSES = {
    "valide": _RESTAURATEUR_VALIDE,
    "en_attente": _RESTAURATEUR_EN_ATTENTE,
    "sans": _RESTAURATEUR_SANS,
}


def get_restaurants(
    zone: str = None, limit: int = None, offset: int = 0, q: str = None,
    restaurateur_statut: str = None, avec_statut_restaurateur: bool = False,
) -> list[dict]:
    """
    Récupère les restaurants, optionnellement filtrés par zone, nom, ou
    statut restaurateur (LS-refonte, D-057 : vue d'ensemble admin).

    `restaurateur_statut` : `"valide"` (fiche possédée), `"en_attente"`
    (demande déposée, pas encore tranchée) ou `"sans"` (aucune des deux).
    Sans filtre mais avec `avec_statut_restaurateur=True`, l'ordre place
    quand même les fiches validées en tête, puis les demandes en attente,
    puis le reste — pour que l'essentiel de ce qu'un admin doit traiter
    (D-055 : validation humaine) soit visible sans qu'il ait à activer un
    filtre pour le voir.

    `avec_statut_restaurateur` PAR DÉFAUT À FAUX : la sous-requête `EXISTS`
    qui calcule le statut coûte un aller-retour sur `restaurant_claims` PAR
    LIGNE. Sur les deux autres appelants de cette fonction — la recherche
    par nom (10 résultats) et `/api/cuisines` (TOUTE la base, sur chaque
    chargement de Découvrir) — ce coût n'achèterait rien : seule la page
    admin affiche ou filtre ce statut.

    `offset` : pagination pour la page d'administration (LS-refonte), qui
    parcourt TOUTE la base plutôt qu'un rayon autour d'un point — aucun autre
    appelant n'en a besoin aujourd'hui, mais l'ajouter ici évite une deuxième
    fonction presque identique.
    """
    conn = get_connection()
    avec_statut = avec_statut_restaurateur or bool(restaurateur_statut)
    if avec_statut:
        sql = f"SELECT r.*, ({_RESTAURATEUR_RANG}) AS restaurateur_rang FROM restaurants r"
    else:
        sql = "SELECT r.* FROM restaurants r"
    clauses = []
    params = []
    if zone:
        clauses.append("r.zone = ?")
        params.append(zone)
    if q:
        clauses.append("r.name LIKE ?")
        params.append(f"%{q}%")
    if restaurateur_statut:
        clauses.append(_RESTAURATEUR_CLAUSES.get(restaurateur_statut, "1=1"))
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY restaurateur_rang ASC, r.local_signal DESC" if avec_statut else " ORDER BY r.local_signal DESC"
    if limit:
        sql += " LIMIT ? OFFSET ?"
        params.append(limit)
        params.append(offset)

    rows = conn.execute(sql, params).fetchall()
    conn.close()
    restaurants = [_row_to_restaurant(r) for r in rows]
    if avec_statut:
        for r in restaurants:
            r["restaurateur_statut"] = {0: "valide", 1: "en_attente", 2: "sans"}[r.pop("restaurateur_rang")]
    return restaurants


def count_restaurants(zone: str = None, q: str = None, restaurateur_statut: str = None) -> int:
    """Nombre total de restaurants — pour la pagination de la page admin."""
    conn = get_connection()
    sql = "SELECT COUNT(*) FROM restaurants r"
    clauses = []
    params = []
    if zone:
        clauses.append("r.zone = ?")
        params.append(zone)
    if q:
        clauses.append("r.name LIKE ?")
        params.append(f"%{q}%")
    if restaurateur_statut:
        clauses.append(_RESTAURATEUR_CLAUSES.get(restaurateur_statut, "1=1"))
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    total = conn.execute(sql, params).fetchone()[0]
    conn.close()
    return total


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


def log_consultation(
    restaurant_id: str, restaurant_name: str, score: float = None,
    user_id: int | None = None,
):
    """
    Enregistre la consultation d'un restaurant.

    `user_id` : renseigné uniquement pour une personne connectée (D-055,
    rôle restaurateur) — un visiteur non connecté n'a pas d'identifiant
    stable, la colonne reste NULL. C'est ce qui permet à un restaurateur
    abonné de voir qui a consulté sa fiche ; le consentement passe par la
    case CGU à l'inscription, pas par un opt-in séparé.
    """
    conn = get_connection()
    conn.execute("""
        INSERT INTO consultations (restaurant_id, restaurant_name, score_final, user_id)
        VALUES (?, ?, ?, ?)
    """, (restaurant_id, restaurant_name, score, user_id))
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


def count_consultations(restaurant_id: str) -> int:
    """Nombre total de consultations d'un restaurant — vue restaurateur, palier gratuit."""
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM consultations WHERE restaurant_id = ?",
        (restaurant_id,),
    ).fetchone()
    conn.close()
    return dict(row)["n"]


def get_recent_visitor_names(restaurant_id: str, limit: int = 5) -> list[str]:
    """
    Quelques noms de visiteurs récents connectés — palier gratuit restaurateur.

    Ne remonte que les consultations rattachées à un compte (`user_id` non
    NULL) : un visiteur non connecté n'a pas de nom à montrer. Un même
    utilisateur n'apparaît qu'une fois, dans l'ordre de sa visite la plus
    récente.
    """
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.name, u.email, MAX(c.consulted_at) AS derniere_visite
        FROM consultations c
        JOIN users u ON u.id = c.user_id
        WHERE c.restaurant_id = ? AND c.user_id IS NOT NULL
        GROUP BY c.user_id
        ORDER BY derniere_visite DESC
        LIMIT ?
    """, (restaurant_id, limit)).fetchall()
    conn.close()
    return [dict(r)["name"] or dict(r)["email"] for r in rows]


def get_visitor_details(restaurant_id: str, limit: int = 100) -> list[dict]:
    """Détail des visites connectées — palier abonné restaurateur (analytics)."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT u.id AS user_id, u.name, u.email, c.consulted_at
        FROM consultations c
        JOIN users u ON u.id = c.user_id
        WHERE c.restaurant_id = ? AND c.user_id IS NOT NULL
        ORDER BY c.consulted_at DESC
        LIMIT ?
    """, (restaurant_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# =============================================================================
# RÔLE RESTAURATEUR — DEMANDES DE REVENDICATION / CRÉATION (D-055, D-056)
# =============================================================================
#
# Un compte devient restaurateur en le demandant, jamais en se l'attribuant :
# `create_restaurant_claim` ne touche à rien de public, seule `approve_claim`
# pose `owner_user_id` sur la fiche (existante ou nouvellement créée).
# Validation humaine uniquement pour l'instant — décision explicite de
# l'utilisateur, pas d'auto-validation tant que le volume ne l'impose pas.
#
# La toute première demande d'un compte se crée avec le compte lui-même
# (`create_restaurateur_account`, D-056) : un compte restaurateur est séparé
# d'un compte client dès l'inscription, il n'existe plus de chemin où un
# compte client se requalifie en restaurateur. `create_restaurant_claim`
# reste utilisée pour une demande ultérieure d'un compte déjà restaurateur
# (seconde adresse, nouvelle tentative après un refus).

def create_restaurant_claim(
    user_id: int, restaurant_id: str | None = None, message: str | None = None,
    proposed_name: str | None = None, proposed_address: str | None = None,
    proposed_lat: float | None = None, proposed_lng: float | None = None,
    proposed_cuisine: str | None = None, proposed_phone: str | None = None,
) -> int:
    """Crée une demande restaurateur (revendication si `restaurant_id`, sinon proposition de fiche)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO restaurant_claims (
            user_id, restaurant_id, proposed_name, proposed_address,
            proposed_lat, proposed_lng, proposed_cuisine, proposed_phone, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, restaurant_id, proposed_name, proposed_address,
          proposed_lat, proposed_lng, proposed_cuisine, proposed_phone, message))
    conn.commit()
    claim_id = cursor.lastrowid
    conn.close()
    return claim_id


def create_restaurateur_account(
    email: str, password_hash: str, name: str | None, accepted_terms_at: str | None,
    restaurant_id: str | None = None, message: str | None = None,
    proposed_name: str | None = None, proposed_address: str | None = None,
    proposed_lat: float | None = None, proposed_lng: float | None = None,
    proposed_cuisine: str | None = None, proposed_phone: str | None = None,
) -> dict:
    """
    Crée un compte restaurateur ET sa demande, dans le même geste (D-055 v2).

    COMPTES SÉPARÉS, PAS UN COMPTE CLIENT QUI DEVIENT RESTAURATEUR (retour
    utilisateur explicite : « il faut séparer les deux comptes [...] un
    compte, quand il est créé, il est créé directement en tant que
    restaurateur »). `role` est posé à `'restaurateur'` dès l'INSERT, jamais
    par un `set_user_role` après coup — il n'existe aucun chemin qui fait
    passer un compte client par ce rôle. La demande est créée dans la même
    connexion, avant le commit : un compte restaurateur sans demande ne doit
    jamais exister, ne serait-ce qu'un instant.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (email, password_hash, name, role, accepted_terms_at)
        VALUES (?, ?, ?, 'restaurateur', ?)
    """, (email.strip().lower(), password_hash, name, accepted_terms_at))
    user_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO restaurant_claims (
            user_id, restaurant_id, proposed_name, proposed_address,
            proposed_lat, proposed_lng, proposed_cuisine, proposed_phone, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, restaurant_id, proposed_name, proposed_address,
          proposed_lat, proposed_lng, proposed_cuisine, proposed_phone, message))
    claim_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return {"user_id": user_id, "claim_id": claim_id}


def get_claim_active_for_user(user_id: int) -> dict | None:
    """
    Demande en cours ou déjà validée pour ce compte, s'il y en a une.

    Une seule demande active à la fois : le formulaire de demande se ferme
    dès qu'il y en a une en attente ou validée, pour ne pas empiler les
    candidatures sur le même compte.
    """
    conn = get_connection()
    row = conn.execute("""
        SELECT * FROM restaurant_claims
        WHERE user_id = ? AND status IN ('en_attente', 'valide')
        ORDER BY created_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_pending_claims() -> list[dict]:
    """File d'attente admin — demandes restaurateur non encore tranchées."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM restaurant_claims WHERE status = 'en_attente' ORDER BY created_at ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def approve_claim(claim_id: int, admin_user_id: int) -> dict:
    """
    Valide une demande restaurateur : pose `owner_user_id`, crée la fiche si besoin.

    Si `restaurant_id` était déjà renseigné (revendication), on se contente
    d'y poser le propriétaire. Sinon (proposition de nouveau restaurant), on
    crée la fiche d'abord, avec un identifiant `manuel_<uuid>` pour ne jamais
    entrer en collision avec les identifiants `osm_n...` de la collecte OSM.
    Le score reste NULL (D-012 : un signal absent n'est jamais 0) — la fiche
    apparaît comme "Non évalué" jusqu'au prochain calcul batch.
    """
    conn = get_connection()
    cursor = conn.cursor()
    claim = cursor.execute(
        "SELECT * FROM restaurant_claims WHERE id = ?", (claim_id,)
    ).fetchone()
    if not claim:
        conn.close()
        return {}
    claim = dict(claim)

    restaurant_id = claim["restaurant_id"]
    if not restaurant_id:
        restaurant_id = f"manuel_{uuid.uuid4().hex[:12]}"
        cursor.execute("""
            INSERT INTO restaurants (id, name, lat, lng, cuisine, address, phone, owner_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            restaurant_id, claim["proposed_name"], claim["proposed_lat"], claim["proposed_lng"],
            claim["proposed_cuisine"], claim["proposed_address"], claim["proposed_phone"],
            claim["user_id"],
        ))
    else:
        cursor.execute(
            "UPDATE restaurants SET owner_user_id = ? WHERE id = ?",
            (claim["user_id"], restaurant_id),
        )

    cursor.execute("""
        UPDATE restaurant_claims
        SET status = 'valide', restaurant_id = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?
        WHERE id = ?
    """, (restaurant_id, admin_user_id, claim_id))

    conn.commit()
    conn.close()
    return {"restaurant_id": restaurant_id}


def reject_claim(claim_id: int, admin_user_id: int) -> None:
    """Refuse une demande restaurateur — la fiche visée, si elle existe, n'est pas touchée."""
    conn = get_connection()
    conn.execute("""
        UPDATE restaurant_claims
        SET status = 'refuse', decided_at = CURRENT_TIMESTAMP, decided_by = ?
        WHERE id = ?
    """, (admin_user_id, claim_id))
    conn.commit()
    conn.close()


def get_restaurant_for_owner(user_id: int) -> dict | None:
    """Fiche possédée par ce compte restaurateur, s'il en a une."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM restaurants WHERE owner_user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_restaurant_contact(restaurant_id: str, **champs) -> None:
    """
    Met à jour les champs de contact d'une fiche, réservés au restaurateur propriétaire.

    Volontairement limité au contact (téléphone, lien de réservation,
    horaires) : le menu et les avis restent hors de portée du restaurateur
    pour l'instant — un menu auto-déclaré contredirait D-014 (le modèle
    observe, il ne juge pas ; laisser la fiche s'auto-décrire romprait la
    même garantie pour un humain).
    """
    colonnes_autorisees = {"phone", "reservation_url", "opening_hours"}
    a_ecrire = {k: v for k, v in champs.items() if k in colonnes_autorisees}
    if not a_ecrire:
        return
    conn = get_connection()
    assignations = ", ".join(f"{col} = ?" for col in a_ecrire)
    conn.execute(
        f"UPDATE restaurants SET {assignations} WHERE id = ?",
        (*a_ecrire.values(), restaurant_id),
    )
    conn.commit()
    conn.close()


def set_restaurant_photo(restaurant_id: str, photo_key: str, photo_type: str) -> None:
    """
    Enregistre la photo déposée par le restaurateur propriétaire (D-059).

    Remplace toujours l'entrée précédente plutôt que d'en garder l'historique :
    une seule photo de vitrine par fiche, comme les coordonnées de contact —
    pas une galerie.
    """
    conn = get_connection()
    conn.execute(
        "UPDATE restaurants SET photo_key = ?, photo_type = ? WHERE id = ?",
        (photo_key, photo_type, restaurant_id),
    )
    conn.commit()
    conn.close()


# =============================================================================
# COMPTES UTILISATEURS / SESSIONS
# =============================================================================

def create_user(
    email: str, password_hash: str, name: str | None = None,
    accepted_terms_at: str | None = None,
) -> int:
    """Crée un compte. Retourne son identifiant."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (email, password_hash, name, accepted_terms_at)
        VALUES (?, ?, ?, ?)
    """, (email.strip().lower(), password_hash, name, accepted_terms_at))
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


def set_password_hash(user_id: int, password_hash: str) -> None:
    """Remplace le hash de mot de passe d'un compte (changement de mot de passe)."""
    conn = get_connection()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
    conn.commit()
    conn.close()


def set_user_role(user_id: int, role: str) -> None:
    """
    Change le rôle d'un compte — "user", "subscriber" ou "admin".

    DÉMONSTRATION, PAS UN ENCAISSEMENT (LS-refonte). Aucun processeur de
    paiement n'est branché : cette fonction bascule le drapeau, elle ne fait
    payer personne. Elle sert à `POST /api/subscribe`, qui existe pour tester
    l'expérience abonné en attendant une vraie intégration (Stripe ou
    équivalent — décision produit qui reste à prendre).
    """
    conn = get_connection()
    conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()
    conn.close()


def check_and_count_search(user_id: int, quota: int) -> tuple[bool, int]:
    """
    Vérifie et consomme une recherche du quota quotidien d'un compte non
    abonné (LS-refonte).

    Remise à zéro AUTOMATIQUE dès que `search_count_date` n'est plus
    aujourd'hui — pas de tâche planifiée à faire tourner à minuit, le
    compteur se réinitialise tout seul à la prochaine recherche du jour.

    Retourne `(autorisee, restantes)`. `autorisee` est False quand le quota
    du jour est déjà consommé ; dans ce cas la recherche EN COURS n'est pas
    comptée une deuxième fois si l'appelant retente.
    """
    aujourdhui = datetime.now(timezone.utc).date().isoformat()

    conn = get_connection()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT search_count_today, search_count_date FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()

    compte = row["search_count_today"] or 0
    date = row["search_count_date"]
    if date != aujourdhui:
        compte = 0  # nouveau jour : le compteur d'hier ne compte plus

    if compte >= quota:
        conn.close()
        return False, 0

    compte += 1
    cur.execute(
        "UPDATE users SET search_count_today = ?, search_count_date = ? WHERE id = ?",
        (compte, aujourdhui, user_id),
    )
    conn.commit()
    conn.close()
    return True, max(0, quota - compte)


# =============================================================================
# FAVORIS — réservés aux abonnés (LS-refonte, vérifié côté route/main.py)
# =============================================================================

def add_favorite(user_id: int, restaurant_id: str) -> None:
    """Ajoute un favori. Idempotent : refaire le même ajout ne duplique rien."""
    conn = get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO favorites (user_id, restaurant_id) VALUES (?, ?)",
        (user_id, restaurant_id),
    )
    conn.commit()
    conn.close()


def remove_favorite(user_id: int, restaurant_id: str) -> None:
    conn = get_connection()
    conn.execute(
        "DELETE FROM favorites WHERE user_id = ? AND restaurant_id = ?",
        (user_id, restaurant_id),
    )
    conn.commit()
    conn.close()


def get_favorite_ids(user_id: int) -> set[str]:
    """Identifiants favoris d'un compte — pour marquer les cartes côté front."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT restaurant_id FROM favorites WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()
    return {r["restaurant_id"] for r in rows}


def get_favorite_restaurants(user_id: int) -> list[dict]:
    """
    Restaurants favoris, même forme que `get_restaurants` (D-008 : pas de
    recalcul, le Local Signal vient tel quel de la base).
    """
    ids = list(get_favorite_ids(user_id))
    if not ids:
        return []
    conn = get_connection()
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT * FROM restaurants WHERE id IN ({placeholders})", ids
    ).fetchall()
    conn.close()
    return [_row_to_restaurant(r) for r in rows]


def get_user_by_google_id(google_id: str) -> dict | None:
    """Récupère un compte déjà lié à cet identifiant Google, s'il existe."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE oauth_google_id = ?", (google_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_google_user(
    email: str, password_hash: str, name: str | None, google_id: str
) -> int:
    """
    Crée un compte ouvert par Google.

    `password_hash` porte le hash bcrypt d'un secret aléatoire, jamais connu
    de personne — pas de colonne nullable à gérer, et la connexion par mot de
    passe reste simplement infaisable pour ce compte tant qu'aucun mot de
    passe n'a été choisi explicitement (fonctionnalité future, hors périmètre
    ici).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO users (email, password_hash, name, oauth_provider, oauth_google_id)
        VALUES (?, ?, ?, 'google', ?)
        """,
        (email.strip().lower(), password_hash, name, google_id),
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


def link_google_id(user_id: int, google_id: str) -> None:
    """
    Rattache un identifiant Google à un compte existant créé par mot de passe.

    Même adresse email des deux côtés (D-037 : c'est le même compte, pas un
    doublon) : quelqu'un qui s'est inscrit avec mot de passe peut ensuite se
    connecter avec Google sans se retrouver avec deux comptes distincts.
    """
    conn = get_connection()
    conn.execute(
        "UPDATE users SET oauth_provider = 'google', oauth_google_id = ? WHERE id = ?",
        (google_id, user_id),
    )
    conn.commit()
    conn.close()


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

    Les consultations sont rattachées à un compte depuis D-055 (rôle
    restaurateur) — un restaurant consulté en étant connecté est visible
    du restaurateur propriétaire, donc c'est une donnée personnelle au même
    titre que les avis, et elle entre dans le droit d'accès.
    """
    conn = get_connection()
    utilisateur = conn.execute(
        "SELECT id, email, name, is_active, created_at, accepted_terms_at "
        "FROM users WHERE id = ?",
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

    # Les avis laisses par la personne sont des donnees personnelles : ils
    # entrent dans le droit d'acces au meme titre que le compte (LS-39).
    avis = [
        dict(r) for r in conn.execute(
            "SELECT restaurant_id, rating, text, created_at, updated_at "
            "FROM user_reviews WHERE user_id = ?", (user_id,)
        ).fetchall()
    ]

    consultations = [
        dict(r) for r in conn.execute(
            "SELECT restaurant_id, restaurant_name, consulted_at "
            "FROM consultations WHERE user_id = ? ORDER BY consulted_at DESC", (user_id,)
        ).fetchall()
    ]

    conn.close()
    return {
        "compte": utilisateur,
        "sessions": sessions,
        "reservations": reservations,
        "avis": avis,
        "consultations": consultations,
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

    # Les avis laisses portent le texte ecrit par la personne : ils partent
    # avec elle (LS-39). Oublier une table est exactement ce qui vide un droit
    # a l'effacement de son sens.
    curseur.execute("DELETE FROM user_reviews WHERE user_id = ?", (user_id,))
    avis = curseur.rowcount

    # Les cartes soumises, elles, sont DELIEES et non supprimees : la photo
    # d'une carte de restaurant ne designe personne, et le corpus perdrait sa
    # valeur a chaque depart. Seul le lien vers la personne disparait.
    curseur.execute(
        "UPDATE menu_submissions SET user_id = NULL WHERE user_id = ?", (user_id,)
    )
    cartes_deliees = curseur.rowcount

    # Les consultations, comme les cartes soumises, sont DELIEES et non
    # supprimees : un restaurateur garde un compte de visites correct, mais
    # plus aucune ligne ne designe la personne apres son depart (D-055).
    curseur.execute(
        "UPDATE consultations SET user_id = NULL WHERE user_id = ?", (user_id,)
    )
    consultations_deliees = curseur.rowcount

    curseur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    compte = curseur.rowcount

    conn.commit()
    conn.close()
    return {"sessions": sessions, "reservations": reservations,
            "avis": avis, "cartes_deliees": cartes_deliees,
            "consultations_deliees": consultations_deliees, "compte": compte}


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


# =============================================================================
# AVIS LAISSÉS PAR NOS UTILISATEURS (LS-39)
# =============================================================================
#
# Ils sont stockés et affichés. Ils n'entrent dans AUCUN calcul de score
# aujourd'hui, et c'est délibéré : les faire compter avant d'avoir mesuré leur
# biais reviendrait à réintroduire la popularité par la porte de service
# (D-001, D-007). La note affichée suit la même règle que celle de Google.


def save_user_review(restaurant_id: str, user_id: int, rating: int | None,
                     text: str | None, lang: str | None = None) -> int:
    """
    Enregistre ou met à jour l'avis d'un utilisateur sur un restaurant.

    UN SEUL AVIS PAR PERSONNE ET PAR RESTAURANT. On modifie, on n'empile pas :
    sans cette règle, un double clic crée deux avis, et une personne pourrait
    peser deux fois sur un restaurant le jour où ces avis compteront.
    """
    conn = get_connection()
    curseur = conn.cursor()
    curseur.execute("""
        INSERT INTO user_reviews (restaurant_id, user_id, rating, text, lang)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(restaurant_id, user_id) DO UPDATE SET
            rating = excluded.rating,
            text = excluded.text,
            lang = excluded.lang,
            updated_at = CURRENT_TIMESTAMP
    """, (restaurant_id, user_id, rating, text, lang))
    conn.commit()
    identifiant = curseur.lastrowid
    conn.close()
    return identifiant


def get_user_reviews(restaurant_id: str, limit: int = 20) -> list[dict]:
    """
    Avis laissés sur un restaurant, du plus récent au plus ancien.

    Le nom de l'auteur accompagne l'avis ; son adresse e-mail, jamais — elle
    n'a aucune raison d'apparaître devant d'autres utilisateurs. `author_role`
    accompagne aussi désormais (LS-refonte) : le badge "Abonné" affiché à
    côté d'un avis (retour utilisateur) en dépend.
    """
    conn = get_connection()
    lignes = conn.execute("""
        SELECT v.id, v.rating, v.text, v.created_at, v.updated_at,
               u.name AS author, u.role AS author_role
          FROM user_reviews v
          LEFT JOIN users u ON u.id = v.user_id
         WHERE v.restaurant_id = ?
         ORDER BY COALESCE(v.updated_at, v.created_at) DESC
         LIMIT ?
    """, (restaurant_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in lignes]


def get_own_review(restaurant_id: str, user_id: int) -> dict | None:
    """L'avis de cet utilisateur sur ce restaurant, pour pouvoir le modifier."""
    conn = get_connection()
    ligne = conn.execute(
        "SELECT * FROM user_reviews WHERE restaurant_id = ? AND user_id = ?",
        (restaurant_id, user_id),
    ).fetchone()
    conn.close()
    return dict(ligne) if ligne else None


def delete_user_review(restaurant_id: str, user_id: int) -> bool:
    """Retire l'avis d'un utilisateur. Il en reste maître."""
    conn = get_connection()
    curseur = conn.cursor()
    curseur.execute(
        "DELETE FROM user_reviews WHERE restaurant_id = ? AND user_id = ?",
        (restaurant_id, user_id),
    )
    conn.commit()
    supprime = curseur.rowcount > 0
    conn.close()
    return supprime


def delete_review_by_id(review_id: int) -> bool:
    """
    Retire N'IMPORTE QUEL avis par son identifiant (modération admin,
    LS-refonte) — `delete_user_review` ne retire que le sien, volontairement
    (D-029) ; celle-ci existe uniquement pour `require_admin`.
    """
    conn = get_connection()
    curseur = conn.cursor()
    curseur.execute("DELETE FROM user_reviews WHERE id = ?", (review_id,))
    conn.commit()
    supprime = curseur.rowcount > 0
    conn.close()
    return supprime


# Champs qu'un admin peut corriger à la main (LS-refonte). Liste blanche
# volontairement courte : la base est alimentée par la collecte, pas par la
# saisie manuelle (CLAUDE.md §9) — ce n'est pas un CRUD générique, seulement
# la correction des deux champs les plus visiblement faux au quotidien.
CHAMPS_MODIFIABLES_ADMIN = {"opening_hours", "cuisine"}


def update_restaurant_fields(restaurant_id: str, fields: dict) -> bool:
    """Met à jour un sous-ensemble de `CHAMPS_MODIFIABLES_ADMIN` pour un restaurant."""
    a_ecrire = {k: v for k, v in fields.items() if k in CHAMPS_MODIFIABLES_ADMIN}
    if not a_ecrire:
        return False

    conn = get_connection()
    curseur = conn.cursor()
    colonnes = ", ".join(f"{k} = ?" for k in a_ecrire)
    curseur.execute(
        f"UPDATE restaurants SET {colonnes} WHERE id = ?",
        (*a_ecrire.values(), restaurant_id),
    )
    conn.commit()
    modifie = curseur.rowcount > 0
    conn.close()
    return modifie


# =============================================================================
# CARTES SOUMISES PAR LES UTILISATEURS (LS-38)
# =============================================================================


def save_menu_submission(restaurant_id: str, corpus_key: str, mime: str,
                         octets: int, user_id: int | None = None,
                         menu_id: int | None = None) -> int:
    """
    Trace une carte envoyée : qui, quand, et où le fichier est rangé.

    `corpus_key` est l'empreinte du fichier. Deux personnes qui envoient la
    même photo produisent la même empreinte : le fichier n'est stocké qu'une
    fois, mais les DEUX soumissions sont tracées — c'est ce qui permettra de
    mesurer combien de personnes ont contribué, et non combien de fichiers
    existent.
    """
    conn = get_connection()
    curseur = conn.cursor()
    curseur.execute("""
        INSERT INTO menu_submissions
            (restaurant_id, user_id, corpus_key, mime, octets, menu_id)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (restaurant_id, user_id, corpus_key, mime, octets, menu_id))
    conn.commit()
    identifiant = curseur.lastrowid
    conn.close()
    return identifiant


def get_menu_submissions(restaurant_id: str) -> list[dict]:
    """Cartes soumises pour un restaurant, de la plus récente à la plus ancienne."""
    conn = get_connection()
    lignes = conn.execute("""
        SELECT id, corpus_key, mime, octets, menu_id, submitted_at
          FROM menu_submissions
         WHERE restaurant_id = ?
         ORDER BY submitted_at DESC
    """, (restaurant_id,)).fetchall()
    conn.close()
    return [dict(r) for r in lignes]
