# backend/config.py — Configuration globale Local Signal
#
# Règle (D-006) : toute constante numérique du scoring porte un commentaire
# indiquant son statut — « à calibrer », « dérivé des labels », ou « justifié par … ».
# Aucune valeur magique sans justification traçable.

import os
from pathlib import Path

from dotenv import load_dotenv

# Racine du dépôt — permet d'exécuter depuis n'importe quel répertoire
ROOT_DIR = Path(__file__).resolve().parent.parent

# Charge le .env de la racine (D-016). `override=False` : une variable déjà
# définie dans l'environnement l'emporte sur le fichier — c'est ce qu'on veut
# en production, où les secrets viennent de la plateforme et non d'un fichier.
load_dotenv(ROOT_DIR / ".env", override=False)

# =============================================================================
# SECRETS — jamais en dur dans ce fichier, qui est versionné (D-011)
# =============================================================================
# Les clés se règlent par variable d'environnement, ou via un .env non versionné.
#   PowerShell : $env:GROQ_API_KEY = "gsk_..."
#   bash       : export GROQ_API_KEY="gsk_..."
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# =============================================================================
# Scan de carte — fournisseur de vision (D-004, D-017)
# =============================================================================
# Le fournisseur est interchangeable. Groq par défaut : latence (l'utilisateur
# est debout devant le restaurant) et coût. Claude sert de référence de qualité
# pour mesurer la perte de précision d'extraction sur le jeu labellisé.
VISION_PROVIDER = os.environ.get("VISION_PROVIDER", "groq")  # "groq" | "claude"

GROQ_VISION_MODEL = "qwen/qwen3.6-27b"
CLAUDE_VISION_MODEL = "claude-opus-5"

# Récolte web (D-023) : la carte arrive déjà en texte, la traiter par un modèle
# de vision serait inutilement coûteux.
#
# Volontairement le MÊME modèle que la vision : les observations des deux voies
# alimentent le même scorer et le même jeu labellisé. Deux modèles différents
# ajouteraient une variable à isoler lors de la calibration (D-006) sans
# bénéfice démontré. Surchargeable par variable d'environnement, le catalogue
# Groq évoluant plus vite que ce fichier.
GROQ_TEXT_MODEL = os.environ.get("GROQ_TEXT_MODEL", GROQ_VISION_MODEL)

MENU_SCAN_MAX_IMAGE_MB = 5  # refus au-delà, avant tout appel facturé

# =============================================================================
# Sources de données
# =============================================================================
# Google Places reste désactivé : impasse juridique pour un produit (D-005).
# Le référentiel cible est OpenStreetMap / Overpass.
USE_MOCK_DATA = True

# =============================================================================
# LOCAL SIGNAL — pondérations du score statique  (D-008)
# =============================================================================
# « Ce qu'est le restaurant », indépendamment de qui cherche.
#
# STATUT : PROVISOIRES. Ces valeurs sont des points de départ, PAS des résultats.
# Elles doivent être dérivées du jeu labellisé (D-006) selon la procédure décrite
# dans docs/methodologie/evaluation.md. Ne pas les présenter comme justifiées.
#
# Le signal menu domine car c'est le seul disponible pour un restaurant sans
# aucun avis — la contrainte n°1 du projet (D-001, D-004).
WEIGHT_MENU = 0.40          # à calibrer — signal menu (scan de carte)
WEIGHT_LANGUAGE = 0.30      # à calibrer — langue des avis, lissée
WEIGHT_PRICE = 0.15         # à calibrer — anomalie de prix vs quartier
WEIGHT_TOURIST_ZONE = 0.15  # à calibrer — pénalité de zone touristique

# Les étoiles ne participent plus au classement (D-007) : elles contredisent
# l'intention du produit, ne discriminent rien, et dépendent de la popularité.
# La note reste affichée à l'utilisateur comme simple information.

# =============================================================================
# Pénalité de zone touristique  (D-002)
# =============================================================================
# La proximité d'un site touristique majeur est une PÉNALITÉ, pas une récompense.
# Justification (jeu à un coup) : voir D-002 dans docs/DECISIONS.md.
#
# Implémenté comme une pénalité de zone à rayon court, et non comme une récompense
# linéaire à l'éloignement — sinon l'algorithme recommanderait des zones
# industrielles au seul motif qu'elles sont loin de tout.
TOURIST_ZONE_RADIUS = 500   # m — à calibrer sur le jeu labellisé
TOURIST_PENALTY_MAX = 1.0   # pénalité pleine au pied du monument — à calibrer

# =============================================================================
# Lissage bayésien du score de langue  (D-003)
# =============================================================================
# score = (n_locaux + α × prior) / (n_total + α)
#
# Empêche qu'un restaurant avec 2 avis obtienne le score maximal, et empêche
# surtout qu'un restaurant SANS avis soit noté 0 — il doit être *incertain*,
# pas *pénalisé* (D-001).
LANGUAGE_SMOOTHING_ALPHA = 5.0    # à calibrer — force du lissage
LANGUAGE_PRIOR = 0.5              # a priori neutre en l'absence d'avis — à calibrer
LANGUAGE_CONFIDENCE_FULL = 20     # nb d'avis au-delà duquel l'info est jugée fiable

# =============================================================================
# Anomalie de prix
# =============================================================================
# Un prix nettement au-dessus de la médiane du quartier pour la même cuisine
# est un signal d'attrape-touristes. Répond au « se faire scam » du cahier des charges.
PRICE_PEERS_MIN = 3        # nb minimum de comparables pour que le signal soit calculable
PRICE_RATIO_MAX = 1.5      # à calibrer — ratio au-delà duquel le score tombe à 0

# =============================================================================
# PERTINENCE — score dynamique, calculé à la requête  (D-008)
# =============================================================================
MAX_DISTANCE_USER = 5000   # m — au-delà, score de proximité = 0

# Part de la proximité dans le classement final.
# Le Local Signal domine, mais la distance module : un excellent restaurant à 8 km
# ne doit pas devancer un très bon restaurant à 200 m.
RANKING_WEIGHT_PROXIMITY = 0.30  # à calibrer

# Langue cible pour le score de langue
TARGET_LANGUAGE = "fr"

# =============================================================================
# UI — Design System
# =============================================================================
PRIMARY_COLOR = "#c1121f"
BACKGROUND_COLOR = "#fffbf3"
CARD_INFO_BG = "#fffbf3"

# =============================================================================
# Base de données
# =============================================================================
# Chemin absolu : la base ne dépend plus du répertoire d'où on lance la commande.
DB_PATH = str(ROOT_DIR / "local_signal.db")

# =============================================================================
# Assets (images de démonstration)
# =============================================================================
ASSETS_DIR = ROOT_DIR / "backend" / "data" / "assets"

# =============================================================================
# Photos de restaurants — Google Places (D-025)
# =============================================================================
# LE DRAPEAU QUI COMPTE.
#
# True  : les photos sont téléchargées une fois et servies depuis le disque.
#         Rapide, gratuit à l'affichage — mais les CGU Google interdisent la
#         mise en cache durable, et les photos appartiennent à leurs auteurs.
#         Choix ASSUMÉ pour la démonstration, pas pour une mise en ligne.
# False : chaque affichage relaie l'image depuis l'API, sans jamais l'écrire.
#         Conforme, mais consomme un appel facturé par vignette affichée.
#
# Le reste du code est identique dans les deux cas : basculer se fait ici,
# et nulle part ailleurs. C'est la condition pour que « on verra plus tard »
# reste une décision d'une ligne plutôt qu'une réécriture.
PHOTO_CACHE_ENABLED = os.environ.get("PHOTO_CACHE_ENABLED", "true").lower() == "true"

# Hors du dépôt et gitignoré : le cache ne doit jamais être versionné ni
# redistribué — c'est ce qui le maintient dans le registre « copie locale de
# travail » et non « republication ».
PHOTO_CACHE_DIR = ROOT_DIR / ".photo-cache"

# Largeur demandée à l'API. 800 px suffit pour une vignette et une fiche ;
# au-delà on paie le même prix pour des octets que personne ne regarde.
PHOTO_MAX_WIDTH = 800
