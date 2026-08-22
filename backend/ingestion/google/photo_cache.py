# backend/ingestion/google/photo_cache.py
# Accès aux photos de restaurants — cache local ou relais direct (D-025).
#
# TOUT LE MODULE EXISTE POUR QU'UN SEUL RÉGLAGE SÉPARE LES DEUX RÉGIMES.
#
#   config.PHOTO_CACHE_ENABLED = True   -> l'image est écrite une fois sur
#                                          disque, puis servie depuis là.
#   config.PHOTO_CACHE_ENABLED = False  -> l'image est relayée à chaque
#                                          affichage, jamais écrite.
#
# Le régime « cache » est un choix de DÉMONSTRATION, assumé comme tel : les CGU
# Google interdisent la conservation durable des photos, et celles-ci
# appartiennent à leurs auteurs (D-021). Le dossier est hors dépôt et gitignoré
# — ce qui maintient la copie dans le registre du fichier de travail local,
# jamais dans celui de la redistribution.
#
# Le jour où le projet est mis en ligne, basculer le drapeau suffit : aucun
# appelant de ce module ne connaît le régime en vigueur.

from pathlib import Path

from backend import config
from backend.ingestion.google.places_photos import fetch_photo

# Les photos Google sont servies en JPEG. On ne devine pas le type à partir des
# octets : l'API le garantit, et une extension unique garde le cache lisible.
EXTENSION = ".jpg"


def cache_path(restaurant_id: str) -> Path:
    """Emplacement de l'image d'un restaurant, qu'elle existe ou non."""
    return Path(config.PHOTO_CACHE_DIR) / f"{restaurant_id}{EXTENSION}"


def cached(restaurant_id: str) -> Path | None:
    """Chemin de l'image si elle est déjà sur disque, sinon None."""
    if not config.PHOTO_CACHE_ENABLED:
        return None
    path = cache_path(restaurant_id)
    return path if path.exists() and path.stat().st_size > 0 else None


def store(restaurant_id: str, photo_ref: str) -> Path:
    """
    Télécharge une photo et l'écrit dans le cache.

    Raises:
        PlacesError: si l'appel à l'API échoue.
        RuntimeError: si le cache est désactivé — l'appeler alors serait un
            contournement silencieux du réglage, pas une erreur bénigne.
    """
    if not config.PHOTO_CACHE_ENABLED:
        raise RuntimeError(
            "PHOTO_CACHE_ENABLED est à false : les images ne doivent pas être "
            "écrites sur disque dans ce régime."
        )

    data = fetch_photo(photo_ref, max_width=config.PHOTO_MAX_WIDTH)

    path = cache_path(restaurant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def read(restaurant_id: str, photo_ref: str) -> bytes:
    """
    Octets de la photo d'un restaurant, quel que soit le régime en vigueur.

    En régime « cache », l'image est téléchargée au premier appel puis relue
    depuis le disque. En régime « direct », elle est relayée à chaque fois.

    Raises:
        PlacesError: si l'API est injoignable ou la référence invalide.
    """
    existing = cached(restaurant_id)
    if existing:
        return existing.read_bytes()

    if config.PHOTO_CACHE_ENABLED:
        return store(restaurant_id, photo_ref).read_bytes()

    return fetch_photo(photo_ref, max_width=config.PHOTO_MAX_WIDTH)


def purge() -> int:
    """
    Vide le cache. Retourne le nombre de fichiers supprimés.

    Existe pour que le retour à la conformité soit une commande, pas une
    opération manuelle qu'on oublie de faire.
    """
    directory = Path(config.PHOTO_CACHE_DIR)
    if not directory.exists():
        return 0

    removed = 0
    for path in directory.glob(f"*{EXTENSION}"):
        path.unlink()
        removed += 1
    return removed
