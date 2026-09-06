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

IS_POSTGRES = bool(config.DATABASE_URL)

# SQLite exprime l'auto-incrément comme un alias du rowid ; Postgres via SERIAL.
# Seule différence de DDL entre les deux dialectes dans ce schéma (D-034).
_AUTOINCREMENT_PK = "SERIAL PRIMARY KEY" if IS_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"


class _PgCursorWrapper:
    """
    Fait ressembler un curseur psycopg2 à un curseur sqlite3 : mêmes appels
    (`?` en placeholder, `.lastrowid`) pour ne pas toucher aux requêtes de
    backend/db/repository.py et des scripts d'ingestion (D-034).
    """

    def __init__(self, cursor):
        self._cursor = cursor
        self._lastrowid = None

    def execute(self, sql, params=None):
        pg_sql = sql.replace("?", "%s")
        is_insert = pg_sql.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in pg_sql.upper():
            pg_sql += " RETURNING id"
        self._cursor.execute(pg_sql, params or ())
        if is_insert:
            row = self._cursor.fetchone()
            self._lastrowid = row["id"] if row else None
        return self

    def fetchall(self):
        return self._cursor.fetchall()

    def fetchone(self):
        return self._cursor.fetchone()

    @property
    def lastrowid(self):
        return self._lastrowid


class _PgConnWrapper:
    """Même rôle que `_PgCursorWrapper`, côté connexion (`conn.execute(...)`)."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        return _PgCursorWrapper(self._conn.cursor()).execute(sql, params)

    def cursor(self):
        return _PgCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_connection():
    """Retourne une connexion à la base — Postgres si DATABASE_URL est définie, sinon SQLite."""
    if IS_POSTGRES:
        import psycopg2
        import psycopg2.extras

        conn = psycopg2.connect(
            config.DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor
        )
        return _PgConnWrapper(conn)

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
            osm_id BIGINT,
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
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS menus (
            id {_AUTOINCREMENT_PK},
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
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS tourist_sites (
            id {_AUTOINCREMENT_PK},
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            zone TEXT,
            source TEXT
        )
    """)

    # --- Réservations ---
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS reservations (
            id {_AUTOINCREMENT_PK},
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
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS consultations (
            id {_AUTOINCREMENT_PK},
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
            # Detail des prix releves sur la carte : mediane, min, max,
            # amplitude, et la liste complete des montants (D-033).
            # La colonne `price` ne porte que la mediane, qui alimente
            # l'indicateur ; le reste est conserve parce qu'il pourra en fonder
            # un autre — l'amplitude distingue une carte resserree d'une carte
            # fourre-tout — et parce que ce qui est obtenu se garde.
            "price_detail": "TEXT",
            # 1 si le collecteur a rendu exactement le nombre de photos demande :
            # le restaurant en avait probablement davantage, et la carte lue est
            # peut-etre incomplete (D-031). Abaisse la confiance, ne bloque rien.
            "photos_saturees": "INTEGER",
            # Motif de selection des photos, conserve pour l'audit :
            # « lot groupe du 05/11/2025 — 12 pages, 5 analysees ».
            "photos_motif": "TEXT",
        },
        "menus": {
            "source_url": "TEXT",     # D-023 — provenance de la carte, pour l'audit
            # Texte brut releve par l'OCR, conserve integralement.
            #
            # Il n'entre pas dans le calcul actuel, et c'est justement pourquoi
            # il doit etre garde : ce qui ne sert pas aujourd'hui peut fonder un
            # indicateur demain, permettre de recalibrer sans retraiter les
            # images, ou constituer une preuve. La base de menus structures est
            # l'actif du projet (CLAUDE.md §3) — la jeter serait payer deux fois.
            #
            # Les IMAGES, elles, ne sont jamais conservees : ce sont des oeuvres
            # de leurs auteurs (D-021, D-025). Le texte qu'on en tire est un
            # fait, il se garde.
            "ocr_text": "TEXT",
            "ocr_lines": "INTEGER",   # nombre de lignes relevees, pour l'audit
        },
    }

    for table, columns in additions.items():
        if IS_POSTGRES:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
                (table,),
            )
            existing = {row["column_name"] for row in cursor.fetchall()}
        else:
            cursor.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cursor.fetchall()}
        for column, sql_type in columns.items():
            if column not in existing:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
