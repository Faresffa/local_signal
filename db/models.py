# db/models.py
# Schéma SQLite — Préparation Phase 2
# Crée les tables nécessaires pour persister les données

import sqlite3
import os
import config


def get_connection() -> sqlite3.Connection:
    """Retourne une connexion à la base SQLite."""
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """
    Initialise la base de données avec les tables nécessaires.
    Peut être appelé plusieurs fois sans risque (IF NOT EXISTS).
    """
    conn = get_connection()
    cursor = conn.cursor()

    # --- Table restaurants (cache local) ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS restaurants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            ambiance TEXT,
            price REAL,
            city TEXT,
            address TEXT,
            lat REAL,
            lng REAL,
            reservation INTEGER DEFAULT 0,
            image TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Table reservations ---
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

    # --- Table consultations (historique) ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            restaurant_name TEXT NOT NULL,
            score_final REAL,
            consulted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Table recommendations ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            restaurant_name TEXT NOT NULL,
            reason TEXT,
            score_final REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Table users ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT,
            home_lat REAL,
            home_lng REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Table reviews ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            rating REAL,
            text TEXT,
            language TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print(f"[DB] Base initialisée: {os.path.abspath(config.DB_PATH)}")
