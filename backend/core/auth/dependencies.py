# backend/core/auth/dependencies.py
# Dépendance FastAPI pour les routes qui exigent un utilisateur connecté.
# Toute future route protégée (dont les avantages réservés aux comptes,
# à venir) dépend de `get_current_user`.

from datetime import datetime, timezone

from fastapi import HTTPException, Request

from backend import config
from backend.core.auth import security
from backend.db import repository as repo


def jeton_de_session(request: Request) -> str | None:
    """
    Le jeton de session, d'où qu'il vienne — cookie ou en-tête.

    DEUX TRANSPORTS POUR UNE SEULE SESSION (LS-40). Le web reçoit un cookie
    `httpOnly` : c'est le seul transport qu'un script de la page ne peut pas
    lire, donc la meilleure défense contre le vol de session par XSS.

    Le mobile ne peut pas s'en servir. React Native n'a pas de bocal à cookies
    fiable — il dépend de la plateforme, se vide à la réinstallation, et
    n'existe pas du tout sur certaines configurations. L'application garde donc
    le jeton dans le stockage sécurisé du téléphone (Keychain / Keystore, via
    `expo-secure-store`) et le présente en en-tête.

    C'EST LE MÊME JETON, LA MÊME TABLE, LA MÊME EXPIRATION. Il n'y a pas deux
    systèmes d'authentification à maintenir, seulement deux façons de présenter
    la même preuve — et un compte créé sur le web ouvre le mobile, comme
    demandé.

    Le cookie est lu en premier : quand les deux sont présents (un navigateur
    qui poserait aussi l'en-tête), c'est le transport le plus sûr qui gagne.
    """
    cookie = request.cookies.get(config.SESSION_COOKIE_NAME)
    if cookie:
        return cookie

    entete = request.headers.get("authorization") or ""
    schema, _, valeur = entete.partition(" ")
    if schema.lower() == "bearer" and valeur.strip():
        return valeur.strip()

    return None


def _resolve_user(request: Request) -> dict | None:
    """Même résolution que `get_current_user`, sans jamais lever d'exception."""
    token = jeton_de_session(request)
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
