# backend/db/seed.py
# Script pour peupler la base de données avec des utilisateurs et des avis fantômes.
# Lancement depuis la racine du dépôt : python -m backend.db.seed

from backend.db.models import get_connection, init_db

def seed_database():
    """Injecte des fausses données dans les tables users et reviews."""
    print("Initialisation de la base de données...")
    init_db()

    conn = get_connection()
    cursor = conn.cursor()

    # Seed Users
    print("Injection des utilisateurs...")
    users = [
        ("alice@example.com", "Alice Dupont", "hash_alice", 48.8606, 2.3376), # Proche Louvre
        ("bob@example.com", "Bob Martin", "hash_bob", 48.8825, 2.3314),       # Proche Montmartre
        ("charlie@example.com", "Charlie Lejeune", "hash_charlie", 48.8529, 2.3500) # Proche Notre-Dame
    ]
    
    for email, name, pwd, lat, lng in users:
        try:
            cursor.execute("""
                INSERT INTO users (email, name, password_hash, home_lat, home_lng)
                VALUES (?, ?, ?, ?, ?)
            """, (email, name, pwd, lat, lng))
        except Exception as e:
            # Ignore if user already exists due to UNIQUE constraint
            pass
            
    conn.commit()

    # Get user IDs
    cursor.execute("SELECT id, email FROM users")
    user_map = {row['email']: row['id'] for row in cursor.fetchall()}

    if not user_map:
        print("Erreur : Aucun utilisateur inséré.")
        conn.close()
        return

    alice_id = user_map.get("alice@example.com")
    bob_id = user_map.get("bob@example.com")
    charlie_id = user_map.get("charlie@example.com")

    # Seed Reviews
    print("Injection des avis (reviews)...")
    reviews = [
        # La Trattoria
        ("resto_2", alice_id, 4.5, "Super bon et très authentique", "fr"),
        ("resto_2", bob_id, 4.0, "Very good pasta, but a bit crowded", "en"),
        
        # Le Petit Gourmet
        ("resto_3", charlie_id, 5.0, "Un délice français, service impeccable.", "fr"),
        ("resto_3", alice_id, 4.0, "Très bien mais un peu cher.", "fr"),

        # O Sushi Bar
        ("resto_5", bob_id, 4.5, "Fresh sushi, fast service.", "en"),
        ("resto_5", charlie_id, 4.2, "Très bons makis.", "fr")
    ]

    # Clear old reviews to avoid duplicates on re-seed
    cursor.execute("DELETE FROM reviews")

    for r_id, u_id, rating, txt, lang in reviews:
        if u_id:
            cursor.execute("""
                INSERT INTO reviews (restaurant_id, user_id, rating, text, language)
                VALUES (?, ?, ?, ?, ?)
            """, (r_id, u_id, rating, txt, lang))

    conn.commit()
    conn.close()
    
    print("✅ Base de données peuplée (Seed terminé) !")

if __name__ == "__main__":
    seed_database()
