# backend/ingestion/menu_scan/providers/claude_provider.py
# Fournisseur de vision alternatif — Claude (D-017).
#
# N'est PAS le défaut : Groq l'est, pour la latence et le coût. Ce provider est
# conservé comme référence de qualité — il sert à mesurer, sur le jeu labellisé,
# combien de précision d'extraction on perd avec un modèle plus léger.
#
# Ce comparatif est un résultat du mémoire, pas une dépense inutile : il coûte
# environ 5 € pour 150 cartes.

import base64

import anthropic

from backend import config
from backend.ingestion.menu_scan.providers.base import media_type


class ClaudeVisionProvider:
    name = "claude"

    def __init__(self, model: str = None, api_key: str = None):
        self.model = model or config.CLAUDE_VISION_MODEL
        self._api_key = api_key or config.ANTHROPIC_API_KEY
        if not self._api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY absente. Renseigner la variable d'environnement "
                "(ne JAMAIS écrire la clé dans backend/config.py, qui est versionné)."
            )
        self._client = anthropic.Anthropic(api_key=self._api_key)

    def analyze(
        self, image_bytes: bytes, filename: str, system_prompt: str
    ) -> dict | None:
        # Import local : évite de coupler le schéma Pydantic au provider par
        # défaut, qui n'en a pas besoin.
        from backend.ingestion.menu_scan.schema import MenuAnalysis

        encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

        response = self._client.messages.parse(
            model=self.model,
            max_tokens=2048,
            system=system_prompt,
            output_format=MenuAnalysis,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type(filename),
                            "data": encoded,
                        },
                    },
                    {
                        "type": "text",
                        "text": "Extrais les observations de cette carte de restaurant.",
                    },
                ],
            }],
        )

        # Une image refusée est traitée comme illisible, pas comme une erreur (D-012).
        if response.stop_reason == "refusal":
            return None

        return response.parsed_output.model_dump()
