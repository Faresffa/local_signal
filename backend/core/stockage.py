# backend/core/stockage.py
#
# STOCKAGE DES FICHIERS — corpus de cartes (LS-38).
#
# CE QUI CHANGE, ET POURQUOI. Jusqu'ici les images étaient analysées puis
# détruites (D-021, D-025), pour ne pas redistribuer des œuvres qui ne nous
# appartiennent pas. La conséquence était qu'aucune lecture n'était
# vérifiable a posteriori : impossible de rouvrir une carte pour contrôler ce
# que l'OCR en avait tiré, et tout retraitement imposait une nouvelle collecte
# payante.
#
# LA DISTINCTION QUI REND LA CONSERVATION DÉFENDABLE :
#
#   CONSERVER pour vérifier et retraiter     corpus interne, jamais servi
#   SERVIR les images depuis nos serveurs    redistribution — écarté
#
# Le corpus est un matériau de recherche, comme tout jeu de données annoté. Il
# n'est pas publié, pas exposé par l'API, pas versionné. L'application continue
# d'afficher l'URL de l'hébergeur d'origine.
#
# POURQUOI PAS DANS LA BASE. Mettre des images en BLOB dans PostgreSQL gonfle
# les sauvegardes, ralentit les requêtes et alourdit toute restauration. Aucune
# équipe ne fait ça passé le prototype. La base ne garde qu'un CHEMIN et une
# EMPREINTE ; le fichier vit ailleurs.
#
# POURQUOI UNE ABSTRACTION PLUTÔT QU'UN FOURNISSEUR. Le choix entre Supabase
# Storage, S3 et Cloudflare R2 se tranche au déploiement, pas aujourd'hui — il
# dépend du volume réel et de qui héberge. Le code appelle `deposer` et `lire`
# sans savoir lequel tourne derrière. En développement c'est un dossier local ;
# en production ce sera l'un des trois, et seul ce fichier changera.
#
# L'EMPREINTE SHA-256 SERT DE NOM. Deux fois la même image ne crée qu'un
# fichier : la même photo de carte soumise par deux utilisateurs différents est
# stockée une fois, et l'égalité des empreintes le prouve. C'est aussi ce qui
# rend le stockage idempotent — rejouer un import n'accumule rien.

import hashlib
import os
from pathlib import Path

from backend import config

# Types acceptés. La liste est fermée : accepter n'importe quoi ouvrirait la
# porte au dépôt de fichiers arbitraires par l'API.
EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


class ErreurStockage(RuntimeError):
    """Le fichier n'a pas pu être déposé ou relu."""


def empreinte(contenu: bytes) -> str:
    """Empreinte SHA-256, qui sert d'identifiant et de nom de fichier."""
    return hashlib.sha256(contenu).hexdigest()


class StockageLocal:
    """
    Dossier du système de fichiers. Le mode de développement.

    Les fichiers sont rangés par préfixe de deux caractères — `a3/a3f2…jpg` —
    plutôt qu'à plat. Un dossier de plusieurs milliers d'entrées devient lent à
    lister sur la plupart des systèmes de fichiers, et cette répartition est ce
    que font Git et les caches de navigateur pour la même raison.
    """

    def __init__(self, racine: Path):
        self.racine = Path(racine)

    def _chemin(self, cle: str, extension: str) -> Path:
        return self.racine / cle[:2] / f"{cle}{extension}"

    def deposer(self, contenu: bytes, type_mime: str) -> str:
        extension = EXTENSIONS.get((type_mime or "").lower())
        if not extension:
            raise ErreurStockage(f"Type de fichier non accepté : {type_mime or 'inconnu'}")

        cle = empreinte(contenu)
        chemin = self._chemin(cle, extension)

        # Déjà présent : on ne réécrit pas. Même image, même empreinte, même
        # fichier — c'est la propriété qui rend l'opération idempotente.
        if chemin.exists():
            return cle

        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(contenu)
        return cle

    def lire(self, cle: str) -> bytes | None:
        for extension in set(EXTENSIONS.values()):
            chemin = self._chemin(cle, extension)
            if chemin.exists():
                return chemin.read_bytes()
        return None

    def existe(self, cle: str) -> bool:
        return any(
            self._chemin(cle, e).exists() for e in set(EXTENSIONS.values())
        )

    def supprimer(self, cle: str) -> bool:
        for extension in set(EXTENSIONS.values()):
            chemin = self._chemin(cle, extension)
            if chemin.exists():
                chemin.unlink()
                return True
        return False

    def volume(self) -> dict:
        """Nombre de fichiers et taille totale — pour surveiller la croissance."""
        fichiers = [f for f in self.racine.rglob("*") if f.is_file()]
        return {
            "fichiers": len(fichiers),
            "octets": sum(f.stat().st_size for f in fichiers),
        }


_instance = None


def stockage():
    """
    Le stockage configuré pour cet environnement.

    Instancié une seule fois : créer le dossier à chaque appel serait inutile,
    et un futur client S3 ouvrirait une connexion par appel.
    """
    global _instance
    if _instance is None:
        # Un futur `STOCKAGE_FOURNISSEUR=supabase|s3|r2` se branchera ici, sans
        # que rien d'autre dans le code ne change.
        _instance = StockageLocal(Path(config.CORPUS_DIR))
    return _instance
