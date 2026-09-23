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


def get_restaurants(
    zone: str = None, limit: int = None, offset: int = 0, q: str = None
) -> list[dict]:
    """
    Récupère les restaurants, optionnellement filtrés par zone ou par nom.

    `offset` : pagination pour la page d'administration (LS-refonte), qui
    parcourt TOUTE la base plutôt qu'un rayon autour d'un point — aucun autre
    appelant n'en a besoin aujourd'hui, mais l'ajouter ici évite une deuxième
    fonction presque identique.
    """
    conn = get_connection()
    sql = "SELECT * FROM restaurants"
    clauses = []
    params = []
    if zone:
        clauses.append("zone = ?")
        params.append(zone)
    if q:
        clauses.append("name LIKE ?")
        params.append(f"%{q}%")
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY local_signal DESC"
    if limit:
        sql += " LIMIT ? OFFSET ?"
        params.append(limit)
        params.append(offset)

    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [_row_to_restaurant(r) for r in rows]


def count_restaurants(zone: str = None, q: str = None) -> int:
    """Nombre total de restaurants — pour la pagination de la page admin."""
    conn = get_connection()
    sql = "SELECT COUNT(*) FROM restaurants"
    clauses = []
    params = []
    if zone:
        clauses.append("zone = ?")
        params.append(zone)
    if q:
        clauses.append("name LIKE ?")
        params.append(f"%{q}%")
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

    Les consultations ne sont PAS rattachées à un compte — elles n'enregistrent
    qu'un restaurant et une date, sans identifiant d'utilisateur. Il n'y a donc
    rien à en extraire, et c'est délibéré.
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

    conn.close()
    return {
        "compte": utilisateur,
        "sessions": sessions,
        "reservations": reservations,
        "avis": avis,
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

    curseur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    compte = curseur.rowcount

    conn.commit()
    conn.close()
    return {"sessions": sessions, "reservations": reservations,
            "avis": avis, "cartes_deliees": cartes_deliees, "compte": compte}


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
