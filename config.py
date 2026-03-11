# config.py — Configuration globale Local Signal V0.1

# =============================================================================
# API Google
# =============================================================================
GOOGLE_API_KEY = ""  # Laisser vide = mode mock automatique
USE_MOCK_DATA = True  # Force le mode mock même si la clé est renseignée

# =============================================================================
# Scoring — Pondérations (doivent totaliser 1.0)
# =============================================================================
WEIGHT_GEO_TOURIST = 0.30  # 30% — Distance au site touristique le plus proche
WEIGHT_GEO_USER = 0.25     # 25% — Distance à l'utilisateur
WEIGHT_LANGUAGE = 0.20     # 20% — Score de langue des avis
WEIGHT_STARS = 0.25        # 25% — Note moyenne (étoiles)

# Rayon max de normalisation (en mètres)
MAX_DISTANCE_TOURIST = 2000  # Au-delà de 2km d'un site → score géo tourist = 0
MAX_DISTANCE_USER = 5000     # Au-delà de 5km de l'user → score géo user = 0

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
DB_PATH = "local_signal.db"
