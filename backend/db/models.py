# backend/db/models.py
# Schéma SQLite.
#
# La table `restaurants` porte trois natures d'information, à ne pas confondre :
#
#   1. FAITS OSM        — nom, coordonnées, cuisine, adresse. Réimportables à tout
#                          moment depuis Overpass, jamais édités à la main.
#   2. LOCAL SIGNAL     — score statique précalculé (D-008). Recalculé en batch,
#                          jamais dans le chemin d'une requête utilisateur.
#   3. VÉRITÉ TERRAIN   — label local/touristique et ses sources (D-006). Produit
#                          par recherche documentaire, INDÉPENDANT des features du
#                          modèle, sous peine d'évaluation circulaire.
#
# Le mélange de ces trois natures dans une même table est assumé : à l'échelle
# du projet, une jointure de plus coûterait plus qu'elle n'apporte.

import sqlite3

from backend import config


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion à la base SQLite."""
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """
    Initialise la base. Idempotent (IF NOT EXISTS).
    """
    conn = get_connection()
    cursor = conn.cursor()

    # --- Restaurants ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS restaurants (
            id TEXT PRIMARY KEY,

            -- Faits OpenStreetMap
            osm_type TEXT,
            osm_id INTEGER,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            cuisine TEXT,
            address TEXT,
            city TEXT,
            zone TEXT,
            website TEXT,
            menu_url TEXT,          -- tag OSM website:menu, quand il existe (D-023)
            phone TEXT,
            opening_hours TEXT,
            price REAL,

            -- Local Signal (statique, recalculé en batch — D-008)
            local_signal REAL,
            confidence REAL,
            signals_json TEXT,
            scored_at TIMESTAMP,

            -- Vérité terrain (D-006) — jamais dérivée des features du modèle
            label TEXT,              -- 'local' | 'touristique' | 'ambigu' | NULL
            label_confidence TEXT,   -- 'forte' | 'faible'
            label_sources TEXT,      -- JSON: {"local": [...], "tourist": [...]}
            human_validated INTEGER DEFAULT 0,
            label_notes TEXT,

            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Index géographique du pauvre : SQLite n'a pas d'index spatial. Suffisant
    # à cette échelle ; PostGIS prendra le relais (docs/ROADMAP.md §4).
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resto_geo ON restaurants(lat, lng)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resto_zone ON restaurants(zone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resto_label ON restaurants(label)")

    # --- Cartes scannées (D-004) — l'actif du projet ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS menus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            provider TEXT,           -- 'groq' | 'claude' — pour le comparatif D-017
            observations_json TEXT,  -- sortie brute du modèle de vision
            menu_score REAL,
            readable INTEGER,
            scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_menus_resto ON menus(restaurant_id)")

    # --- Sites touristiques (référence pour la pénalité de zone — D-002) ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tourist_sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            zone TEXT,
            source TEXT
        )
    """)

    # --- Réservations ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            restaurant_name TEXT NOT NULL,
            user_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            num_persons INTEGER DEFAULT 1,
            date TEXT NOT NULL,
            time_slot TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Consultations (historique) ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            restaurant_name TEXT NOT NULL,
            score_final REAL,
            consulted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    _migrate(cursor)

    conn.commit()
    conn.close()


def _migrate(cursor) -> None:
    """
    Ajoute les colonnes apparues après la création initiale de la base.

    `CREATE TABLE IF NOT EXISTS` ne touche pas une table déjà présente : sans
    ceci, une base créée avant l'ajout d'une colonne resterait incomplète et
    échouerait à l'insertion. SQLite n'ayant pas d'`ADD COLUMN IF NOT EXISTS`,
    on lit le schéma existant et on ne pose que ce qui manque.
    """
    additions = {
        "restaurants": {
            "menu_url": "TEXT",           # D-023
            "google_place_id": "TEXT",    # D-025 — identifiant, cachable sans réserve
            "photo_ref": "TEXT",          # D-025 — nom de ressource de la 1re photo

            # --- Enrichissement externe (D-029) ---
            # Champs alimentés par un collecteur tiers, quelle qu'en soit la
            # source. Ils sont SÉPARÉS des faits OpenStreetMap : `import_externe`
            # ne les mélange jamais, pour qu'on puisse toujours dire d'où vient
            # chaque donnée — exigence de traçabilité du mémoire.
            "reservation_url": "TEXT",    # lien de réservation, quand il existe
            "rating": "REAL",             # note affichée — HORS SCORING (D-007)
            "review_count": "INTEGER",    # volume d'avis — HORS SCORING (D-001)
            "menu_photo_urls": "TEXT",    # JSON : URL des photos taguées « menu »
            "external_source": "TEXT",    # nom du collecteur, pour l'audit
            "external_at": "TEXT",        # horodatage de l'enrichissement
            "price_range": "TEXT",        # fourchette « $ » a « $$$$ » — HORS SCORING
            "photos_count": "INTEGER",    # volume de photos — HORS SCORING (D-001)
            # Google indique lui-meme si un lieu attire les touristes.
            # HORS SCORING, et strictement reserve a la VALIDATION EXTERNE du
            # Local Signal : s'en servir comme entree serait circulaire (D-030).
            "tourist_flag": "INTEGER",
        },
        "menus": {
            "source_url": "TEXT",     # D-023 — provenance de la carte, pour l'audit
        },
    }

    for table, columns in additions.items():
        cursor.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cursor.fetchall()}
        for column, sql_type in columns.items():
            if column not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
