# backend/core/auth/limitation.py
#
# LIMITATION DE DÉBIT SUR L'AUTHENTIFICATION (LS-28).
#
# Les routes de connexion et d'inscription acceptaient un nombre illimité de
# tentatives. Une attaque par force brute sur un compte connu ne demandait donc
# aucun effort : quelques milliers de requêtes suffisent à épuiser un mot de
# passe faible, et rien ne les ralentissait.
#
# DEUX COMPTEURS, PAS UN SEUL.
#
# Compter par adresse IP protège un compte contre un attaquant isolé. Compter
# par email protège un compte contre une attaque répartie sur plusieurs IP —
# c'est le cas le plus courant, et celui qu'un compteur par IP laisse passer
# entièrement. Les deux sont donc appliqués, et le plus strict l'emporte.
#
# UNE CONNEXION RÉUSSIE EFFACE LE COMPTEUR DE L'EMAIL. Sans cela, un
# utilisateur qui se trompe quatre fois puis réussit resterait pénalisé pour
# ses prochaines connexions — on punirait la maladresse au lieu de l'attaque.
#
# CE QUE CETTE IMPLÉMENTATION NE FAIT PAS, ET IL FAUT LE SAVOIR.
#
# Le compteur vit EN MÉMOIRE DU PROCESSUS. Il est donc remis à zéro à chaque
# redémarrage, et deux instances de l'API ne partagent pas leurs compteurs. À
# l'échelle actuelle — une instance, un déploiement par jour — c'est un
# compromis acceptable, et il évite d'ajouter Redis pour une seule
# fonctionnalité. Dès qu'il y aura plusieurs instances, ce module devra passer
# sur un stockage partagé : le reste du code n'aura pas à changer, seule la
# structure `_tentatives` est concernée.

import threading
import time
from collections import deque

from fastapi import HTTPException, Request

# Connexion : 10 tentatives par quart d'heure. Assez large pour un utilisateur
# qui hésite sur son mot de passe, assez étroit pour qu'une force brute soit
# ralentie de plusieurs ordres de grandeur.
MAX_CONNEXIONS = 10
FENETRE_CONNEXION_S = 15 * 60

# Inscription : plus strict. Créer des comptes en masse n'a aucun usage
# légitime, et chaque création coûte un hachage bcrypt — donc du temps serveur.
MAX_INSCRIPTIONS = 5
FENETRE_INSCRIPTION_S = 60 * 60

# Garde-fou mémoire : au-delà, les clés les plus anciennes sont purgées. Sans
# cela, un attaquant ferait grossir le dictionnaire indéfiniment en variant
# l'email à chaque requête — la protection deviendrait elle-même l'attaque.
MAX_CLES = 10_000

_tentatives: dict[str, deque] = {}
_verrou = threading.Lock()


def _purger(horodatages: deque, fenetre: float, maintenant: float) -> None:
    """Retire les tentatives sorties de la fenêtre glissante."""
    while horodatages and maintenant - horodatages[0] > fenetre:
        horodatages.popleft()


def adresse_client(request: Request) -> str:
    """
    Adresse de l'appelant.

    Derrière un reverse proxy — c'est le cas sur Railway — `request.client.host`
    est l'adresse du proxy, identique pour tout le monde : le compteur par IP
    deviendrait un compteur global et bloquerait tous les utilisateurs à la
    fois. On lit donc `X-Forwarded-For` en priorité, dont le PREMIER élément
    est le client d'origine.
    """
    transmis = request.headers.get("x-forwarded-for", "")
    if transmis:
        return transmis.split(",")[0].strip()
    return request.client.host if request.client else "inconnu"


def verifier(cle: str, maximum: int, fenetre_s: float) -> None:
    """
    Enregistre une tentative et refuse si le quota est dépassé.

    Raises:
        HTTPException 429 avec l'en-tête `Retry-After`, pour que le client
        sache combien de temps attendre plutôt que de réessayer en boucle.
    """
    maintenant = time.monotonic()

    with _verrou:
        if len(_tentatives) > MAX_CLES:
            # Purge grossière : on ne garde que les clés encore actives.
            for k in [k for k, v in _tentatives.items() if not v]:
                del _tentatives[k]
            if len(_tentatives) > MAX_CLES:
                _tentatives.clear()

        horodatages = _tentatives.setdefault(cle, deque())
        _purger(horodatages, fenetre_s, maintenant)

        if len(horodatages) >= maximum:
            attente = int(fenetre_s - (maintenant - horodatages[0])) + 1
            raise HTTPException(
                status_code=429,
                detail="Trop de tentatives. Réessayez dans quelques minutes.",
                headers={"Retry-After": str(max(attente, 1))},
            )

        horodatages.append(maintenant)


def liberer(cle: str) -> None:
    """
    Efface le compteur d'une clé, après une opération réussie.

    APPELÉ SUR L'EMAIL, JAMAIS SUR L'ADRESSE. Quelqu'un qui se trompe puis
    retrouve son mot de passe ne doit pas rester pénalisé : son compte est
    libéré. Mais l'adresse, elle, continue de compter — sans quoi un attaquant
    disposant d'un seul compte valide remettrait son propre quota à zéro à
    volonté, entre deux séries de tentatives sur d'autres comptes. Le compteur
    par adresse serait alors purement décoratif.
    """
    with _verrou:
        _tentatives.pop(cle, None)


def garder_connexion(request: Request, email: str) -> None:
    """Double garde sur la connexion : par adresse, et par compte visé."""
    verifier(f"login:ip:{adresse_client(request)}", MAX_CONNEXIONS, FENETRE_CONNEXION_S)
    verifier(f"login:email:{email.strip().lower()}", MAX_CONNEXIONS, FENETRE_CONNEXION_S)


def liberer_connexion(email: str) -> None:
    """Remet à zéro le compteur du compte après une connexion réussie."""
    liberer(f"login:email:{email.strip().lower()}")


def garder_inscription(request: Request) -> None:
    """Garde sur l'inscription : par adresse uniquement — l'email est libre."""
    verifier(
        f"signup:ip:{adresse_client(request)}", MAX_INSCRIPTIONS, FENETRE_INSCRIPTION_S
    )


def reinitialiser() -> None:
    """Vide tous les compteurs. Réservé aux tests."""
    with _verrou:
        _tentatives.clear()
