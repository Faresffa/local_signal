# backend/ingestion/menu_scan/providers/text.py
# Fournisseurs d'extraction sur une carte en TEXTE (D-023).
#
# Pendant textuel de providers/{groq,claude}_provider.py, qui travaillent sur
# une image. Même schéma de sortie, même principe : le modèle OBSERVE, il ne
# JUGE pas (D-014). Le score reste calculé par menu_score.py.
#
# Pourquoi un module séparé plutôt qu'un paramètre : une carte lue sur le web
# arrive déjà sous forme de texte. Lui faire traverser un modèle de vision
# coûterait plus cher et perdrait de l'information pour rien.

import json
import os
import re
import time

from backend import config

# Le schéma est le même que côté vision : c'est le contrat de MenuAnalysis.
from backend.ingestion.menu_scan.providers.groq_provider import (
    _JSON_SCHEMA, _extract_json,
)

# Budget de sortie. Le raisonnement étant désactivé (voir `analyze`), la réponse
# se réduit au JSON du schéma : quelques centaines de tokens suffisent.
#
# ATTENTION : Groq compte le quota par minute comme entrée + budget de sortie
# RÉSERVÉ, pas consommé. Réserver large n'est donc pas gratuit — sur le tier
# gratuit (8 000 TPM), une entrée de 2 000 tokens et un budget de 6 000 font
# 8 748 et l'appel est rejeté en 413 avant même de tourner.
_MAX_COMPLETION_TOKENS = int(os.environ.get("GROQ_MAX_COMPLETION_TOKENS", "1500"))

_MAX_RETRIES = 4
_RETRY_BASE = 20  # s — ordre de grandeur d'une fenêtre de quota Groq

# Groq indique le délai d'attente dans le message d'erreur ; le respecter évite
# de repartir trop tôt et de consommer une tentative pour rien.
_RETRY_HINT = re.compile(r"try again in ([\d.]+)s", re.IGNORECASE)


def _retry_after(error) -> float | None:
    """Extrait le délai d'attente suggéré par Groq, s'il est présent."""
    match = _RETRY_HINT.search(str(getattr(error, "message", "")) or str(error))
    if not match:
        return None
    try:
        return min(float(match.group(1)) + 1.0, 60.0)
    except ValueError:
        return None


class GroqTextProvider:
    """Fournisseur par défaut — même raison que pour la vision : latence et coût."""

    name = "groq-text"

    def __init__(self, model: str = None, api_key: str = None):
        import groq

        self.model = model or config.GROQ_TEXT_MODEL
        self._api_key = api_key or config.GROQ_API_KEY
        if not self._api_key:
            raise RuntimeError(
                "GROQ_API_KEY absente. Renseigner la variable d'environnement "
                "(ne JAMAIS écrire la clé dans backend/config.py, qui est versionné)."
            )
        self._groq = groq
        self._client = groq.Groq(api_key=self._api_key)

    def analyze(self, menu_text: str, system_prompt: str) -> dict | None:
        instructions = (
            f"{system_prompt}\n\n"
            f"Réponds UNIQUEMENT par un objet JSON valide respectant ce schéma, "
            f"sans texte autour :\n{json.dumps(_JSON_SCHEMA, ensure_ascii=False)}\n\n"
            f"--- TEXTE DE LA PAGE ---\n{menu_text}"
        )

        for attempt in range(_MAX_RETRIES):
            try:
                response = self._client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": instructions}],
                    max_completion_tokens=_MAX_COMPLETION_TOKENS,
                    temperature=0.0,  # extraction factuelle : pas de créativité
                    # Le modèle par défaut raisonne avant de répondre. Sur une
                    # extraction contrainte par un schéma, ce raisonnement
                    # n'améliore rien et coûte tout : mesuré à 288 tokens de
                    # sortie contre 6 sans lui, soit un facteur 48. Sur un tier
                    # limité en tokens par minute, il faisait tronquer la
                    # réponse AVANT le JSON — le restaurant était perdu après
                    # avoir été facturé.
                    reasoning_effort="none",
                )
            except self._groq.APIStatusError as e:
                # 429 = quota par minute atteint, pas une erreur de fond : le
                # tier gratuit plafonne à 8 000 tokens/minute et une carte en
                # consomme la moitié. Réessayer suffit ; abandonner ferait
                # perdre un restaurant récupérable.
                if e.status_code == 429 and attempt < _MAX_RETRIES - 1:
                    wait = _retry_after(e) or (_RETRY_BASE * (attempt + 1))
                    print(f"[Groq-text] Quota atteint, reprise dans {wait:.0f} s…")
                    time.sleep(wait)
                    continue
                # Autre erreur fournisseur : la carte est traitée comme absente,
                # son poids redistribué plutôt que de pénaliser le restaurant (D-012).
                print(f"[Groq-text] Erreur {e.status_code}: {e.message}")
                return None

            raw = response.choices[0].message.content
            parsed = _extract_json(raw)
            if parsed is None:
                finish = response.choices[0].finish_reason
                if finish == "length":
                    print(
                        f"[Groq-text] Réponse tronquée à {_MAX_COMPLETION_TOKENS} "
                        f"tokens avant le JSON — augmenter GROQ_MAX_COMPLETION_TOKENS."
                    )
                else:
                    print(f"[Groq-text] Aucun JSON exploitable : {raw[:150]}")
            return parsed

        return None


class ClaudeTextProvider:
    """Référence de qualité, pour le comparatif d'extraction (D-017)."""

    name = "claude-text"

    def __init__(self, model: str = None, api_key: str = None):
        import anthropic

        self.model = model or config.CLAUDE_VISION_MODEL
        self._api_key = api_key or config.ANTHROPIC_API_KEY
        if not self._api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY absente. Renseigner la variable d'environnement "
                "(ne JAMAIS écrire la clé dans backend/config.py, qui est versionné)."
            )
        self._client = anthropic.Anthropic(api_key=self._api_key)

    def analyze(self, menu_text: str, system_prompt: str) -> dict | None:
        from backend.ingestion.menu_scan.schema import MenuAnalysis

        response = self._client.messages.parse(
            model=self.model,
            max_tokens=2048,
            system=system_prompt,
            output_format=MenuAnalysis,
            messages=[{
                "role": "user",
                "content": (
                    "Extrais les observations de cette carte de restaurant, "
                    f"publiée sur le web.\n\n--- TEXTE DE LA PAGE ---\n{menu_text}"
                ),
            }],
        )

        if response.stop_reason == "refusal":
            return None

        return response.parsed_output.model_dump()
