# backend/core/journal.py
#
# JOURNALISATION (LS-25).
#
# Le backend n'en avait aucune. Une erreur en production était donc
# strictement invisible : pas de trace, pas de contexte, pas de moyen de savoir
# qu'elle s'était produite. On l'apprenait par un utilisateur, ou jamais.
#
# CE QUI EST JOURNALISÉ, ET CE QUI NE L'EST PAS.
#
# Chaque requête laisse une ligne : méthode, chemin, code, durée. C'est ce qui
# permet de répondre à « depuis quand est-ce lent ? » et « cette route
# est-elle seulement appelée ? ».
#
# Les erreurs 5xx laissent en plus la trace complète de l'exception.
#
# NE SONT JAMAIS ÉCRITS : mots de passe, jetons de session, cookies,
# en-têtes d'autorisation. La journalisation est faite pour être lue par des
# humains et conservée par un hébergeur — y déverser un secret revient à le
# publier. Le filtre `_SENSIBLES` est là pour que l'oubli soit impossible, pas
# seulement improbable.
#
# Les paramètres de requête sont conservés (ils portent la position et les
# filtres, utiles au diagnostic) SAUF ceux dont le nom trahit un secret.

import logging
import os
import sys
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware

# Noms de paramètres et d'en-têtes dont la valeur ne doit jamais apparaître.
# Comparaison sur le nom en minuscules, par inclusion : `session_token` comme
# `X-Session-Token` sont couverts par « token ».
_SENSIBLES = ("password", "token", "secret", "cookie", "authorization", "api_key", "cle")

_MASQUE = "[masqué]"


def _assainir(parametres) -> str:
    """Rend les paramètres de requête lisibles, secrets masqués."""
    morceaux = []
    for cle, valeur in parametres.items():
        bas = cle.lower()
        masquer = any(s in bas for s in _SENSIBLES)
        morceaux.append(f"{cle}={_MASQUE if masquer else valeur}")
    return "&".join(morceaux)


def configurer(niveau: str = None) -> None:
    """
    Installe la journalisation du processus.

    Sortie sur `stdout` et non dans un fichier : c'est ce qu'attendent tous les
    hébergeurs conteneurisés, Railway compris. Écrire dans un fichier
    reviendrait à perdre les journaux au redémarrage du conteneur.
    """
    if niveau is None:
        niveau = os.environ.get("LOG_LEVEL", "INFO").upper()

    racine = logging.getLogger()
    if racine.handlers:  # déjà configuré (rechargement à chaud, tests)
        return

    sortie = logging.StreamHandler(sys.stdout)
    sortie.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    racine.addHandler(sortie)
    racine.setLevel(niveau)

    # Uvicorn journalise déjà chaque requête à sa façon. Le laisser faire
    # doublerait chaque ligne avec un format différent — on le réduit aux
    # erreurs et on garde notre propre trace, qui porte la durée.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class JournalRequetes(BaseHTTPMiddleware):
    """
    Une ligne par requête : identifiant, méthode, chemin, code, durée.

    L'IDENTIFIANT DE REQUÊTE EST RENVOYÉ AU CLIENT dans `X-Request-ID`. Quand
    un utilisateur signale une erreur, ce seul identifiant permet de retrouver
    la ligne correspondante — sans lui, on cherche dans le journal à l'heure
    approximative, ce qui ne marche jamais.
    """

    async def dispatch(self, request, call_next):
        journal = logging.getLogger("api")
        identifiant = uuid.uuid4().hex[:8]
        depart = time.monotonic()

        chemin = request.url.path
        parametres = _assainir(request.query_params)
        if parametres:
            chemin = f"{chemin}?{parametres}"

        try:
            reponse = await call_next(request)
        except Exception:
            duree = (time.monotonic() - depart) * 1000
            # `exception` inclut la trace complète — c'est tout l'intérêt.
            journal.exception(
                "%s %s %s  ECHEC en %.0f ms",
                identifiant, request.method, chemin, duree,
            )
            raise

        duree = (time.monotonic() - depart) * 1000
        # Une 5xx est une défaillance de notre côté, une 4xx une requête
        # invalide : la première mérite d'être vue, la seconde pas.
        niveau = logging.ERROR if reponse.status_code >= 500 else logging.INFO
        journal.log(
            niveau, "%s %s %s -> %s en %.0f ms",
            identifiant, request.method, chemin, reponse.status_code, duree,
        )

        reponse.headers["X-Request-ID"] = identifiant
        return reponse
