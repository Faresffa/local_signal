# backend/ingestion/menu_scan/providers/base.py
# Interface commune aux fournisseurs de vision (D-017).
#
# Le scan de carte ne dépend d'aucun fournisseur particulier : chaque provider
# reçoit une image et le prompt, et retourne un dict brut. La validation par
# schéma et la conversion vers le scoring se font en amont (schema.py), donc
# changer de modèle ne touche jamais au moteur de score.
#
# Ce découplage n'est pas de la sur-ingénierie : il permet de comparer deux
# modèles sur le jeu labellisé (précision d'extraction), ce qui est un résultat
# du mémoire à part entière.

from typing import Protocol

_MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}


def media_type(filename: str) -> str:
    """Déduit le type MIME depuis l'extension du fichier."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _MEDIA_TYPES:
        raise ValueError(
            f"Format d'image non supporté : '{ext}'. "
            f"Formats acceptés : {', '.join(sorted(set(_MEDIA_TYPES)))}"
        )
    return _MEDIA_TYPES[ext]


class VisionProvider(Protocol):
    """
    Contrat que doit remplir tout fournisseur de vision.

    Returns:
        Un dict conforme au schéma MenuAnalysis, ou None si le fournisseur a
        refusé/échoué de manière non récupérable — auquel cas l'appelant traite
        la carte comme illisible plutôt que de propager une erreur (D-012).
    """

    name: str

    def analyze(
        self, image_bytes: bytes, filename: str, system_prompt: str
    ) -> dict | None:
        ...
