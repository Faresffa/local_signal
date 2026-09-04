# backend/ingestion/menu_scan/providers/groq_provider.py
# Fournisseur de vision par défaut — Groq (D-017).
#
# Choisi pour la LATENCE avant tout : l'utilisateur est debout devant le
# restaurant, chaque seconde compte. Le coût est un bénéfice secondaire.
#
# Contrepartie à mesurer : un modèle plus léger lit-il correctement une carte
# photographiée de travers, avec des reflets, une écriture manuscrite ? C'est
# une question empirique, tranchée sur le jeu labellisé (docs/methodologie).

import base64
import json
import re

import groq

from backend import config
from backend.ingestion.menu_scan.providers.base import media_type

# Les modèles à raisonnement (qwen…) émettent un bloc <think> avant leur réponse.
# Le mode `json_object` strict de Groq le rejette, d'où l'extraction manuelle.
_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)
_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(raw: str) -> dict | None:
    """
    Isole l'objet JSON d'une réponse pouvant contenir du raisonnement,
    des balises de bloc de code, ou du texte d'introduction.
    """
    if not raw:
        return None

    text = _THINK_BLOCK.sub("", raw).strip()

    fenced = _JSON_FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()

    # Dernier recours : du premier { à la dernière } de la réponse.
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None

    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None

# Schéma JSON transmis au modèle. Volontairement redondant avec schema.py :
# les modèles ouverts suivent mieux un schéma explicite dans la requête qu'une
# description en prose. La validation reste faite par Pydantic côté Python.
_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "cuisines": {"type": "array", "items": {"type": "string"}},
        "dish_count": {"type": "integer"},
        "languages": {"type": "array", "items": {"type": "string"}},
        "vernacular_ratio": {"type": "number"},
        "has_tourist_menu": {"type": "boolean"},
        "has_dish_photos": {"type": "boolean"},
        "readable": {"type": "boolean"},
        "notes": {"type": "string"},
    },
    "required": [
        "cuisines", "dish_count", "languages", "vernacular_ratio",
        "has_tourist_menu", "has_dish_photos", "readable", "notes",
    ],
}


class GroqVisionProvider:
    name = "groq"

    def __init__(self, model: str = None, api_key: str = None):
        self.model = model or config.GROQ_VISION_MODEL
        self._api_key = api_key or config.GROQ_API_KEY
        if not self._api_key:
            raise RuntimeError(
                "GROQ_API_KEY absente. Renseigner la variable d'environnement "
                "(ne JAMAIS écrire la clé dans backend/config.py, qui est versionné)."
            )
        self._client = groq.Groq(api_key=self._api_key)

    def analyze(
        self, image_bytes: bytes, filename: str, system_prompt: str
    ) -> dict | None:
        encoded = base64.standard_b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{media_type(filename)};base64,{encoded}"

        # Groq n'accepte pas de message `system` séparé sur ses modèles vision :
        # les instructions sont placées dans le tour utilisateur, avec l'image.
        instructions = (
            f"{system_prompt}\n\n"
            f"Réponds UNIQUEMENT par un objet JSON valide respectant ce schéma, "
            f"sans texte autour :\n{json.dumps(_JSON_SCHEMA, ensure_ascii=False)}"
        )

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": instructions},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }],
                # Pas de `response_format` strict : les modèles à raisonnement
                # préfixent leur sortie d'un bloc <think>, que le validateur
                # de Groq rejette avant même de nous la transmettre.
                # `reasoning_effort="none"` : ce modele est un modele de
                # raisonnement. Sans bride, il epuise son budget de jetons en
                # reflexion et n'emet jamais le JSON — constate sur trois
                # cartes d'affilee. Les seules valeurs acceptees sont « none »
                # et « default ».
                reasoning_effort="none",
                # 700 et non 3000. Le palier gratuit plafonne la SORTIE a
                # 1000 jetons par minute, et refuse toute requete qui en
                # reserve davantage — meme si la reponse reelle est courte.
                # Notre JSON d'observations fait environ 200 jetons ; 700
                # laisse une marge confortable sans declencher le refus.
                max_completion_tokens=700,
                temperature=0.0,  # extraction factuelle : pas de créativité souhaitée
            )
        except groq.RateLimitError:
            # Limite de debit atteinte. Le palier gratuit plafonne la sortie a
            # 1000 jetons par minute pour toute l'organisation : en lot, on la
            # touche forcement. Sans reprise, un refus PASSAGER marquerait la
            # carte « illisible » de facon DEFINITIVE — le module de lecture ne
            # repasse jamais sur un restaurant deja enregistre. On attend donc
            # et on retente, plutot que de perdre la donnee.
            raise
        except groq.APIStatusError as e:
            # Erreur fournisseur : on ne fait pas planter l'app, la carte est
            # traitée comme illisible et son poids redistribué (D-012).
            print(f"[Groq] Erreur {e.status_code}: {e.message}")
            return None

        raw = response.choices[0].message.content
        parsed = _extract_json(raw)
        if parsed is None:
            print(f"[Groq] Aucun JSON exploitable dans la réponse : {raw[:200]}")
        return parsed
