# backend/core/auth/dependencies.py
# Dépendance FastAPI pour les routes qui exigent un utilisateur connecté.
# Toute future route protégée (dont les avantages réservés aux comptes,
# à venir) dépend de `get_current_user`.

from datetime import datetime, timezone

from fastapi import HTTPException, Request

from backend import config
from backend.core.auth import security
from backend.db import repository as repo


def _resolve_user(request: Request) -> dict | None:
    """Même résolution que `get_current_user`, sans jamais lever d'exception."""
    token = request.cookies.get(config.SESSION_COOKIE_NAME)
    if not token:
        return None

    session = repo.get_session(security.hash_token(token))
    if not session:
        return None

    expires_at = session["expires_at"]
    # SQLite renvoie le TIMESTAMP en texte (ISO) ; psycopg2 le renvoie déjà
    # converti en datetime (D-034 — même schéma, deux dialectes).
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None

    user = repo.get_user_by_id(session["user_id"])
    if not user or not user["is_active"]:
        return None

    return user


def get_current_user(request: Request) -> dict:
    """Résout l'utilisateur courant à partir du cookie de session, ou 401."""
    user = _resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié.")
    return user


def get_current_user_optional(request: Request) -> dict | None:
    """
    Comme `get_current_user`, mais renvoie None au lieu de lever une 401.

    Pour les endpoints publics dont le comportement varie selon la connexion
    (ex. nombre de résultats affichés) sans les rendre obligatoirement
    authentifiés.
    """
    return _resolve_user(request)
