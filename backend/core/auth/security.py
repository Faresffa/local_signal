# backend/core/auth/security.py
# Primitives de sécurité pour les comptes utilisateurs — logique pure, sans
# FastAPI ni base de données, pour rester facilement testable isolément.

import hashlib
import secrets

import bcrypt


def hash_password(password: str) -> str:
    """
    Hache un mot de passe avec bcrypt.

    bcrypt tronque silencieusement au-delà de 72 octets — sans conséquence
    pratique ici (un mot de passe de cette longueur n'apporte rien de plus
    en entropie une fois ce seuil dépassé).
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Vérifie un mot de passe en clair contre son hash bcrypt stocké."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def generate_session_token() -> str:
    """Jeton de session opaque, transmis au client via un cookie httpOnly."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """
    Hash du jeton, seul stocké en base (table `sessions`).

    Le jeton en clair ne transite jamais que dans le cookie : une fuite de la
    base ne permet donc pas de rejouer une session, contrairement à un jeton
    stocké tel quel.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
