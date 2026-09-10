# backend/core/auth/dependencies.py
# Dépendance FastAPI pour les routes qui exigent un utilisateur connecté.
# Toute future route protégée (dont les avantages réservés aux comptes,
# à venir) dépend de `get_current_user`.

from datetime import datetime, timezone

from fastapi import HTTPException, Request

from backend import config
from backend.core.auth import security
from backend.db import repository as repo


def get_current_user(request: Request) -> dict:
    """Résout l'utilisateur courant à partir du cookie de session, ou 401."""
    token = request.cookies.get(config.SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié.")

    session = repo.get_session(security.hash_token(token))
    if not session:
        raise HTTPException(status_code=401, detail="Session invalide.")

    expires_at = session["expires_at"]
    # SQLite renvoie le TIMESTAMP en texte (ISO) ; psycopg2 le renvoie déjà
    # converti en datetime (D-034 — même schéma, deux dialectes).
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expirée.")

    user = repo.get_user_by_id(session["user_id"])
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Compte inactif.")

    return user
