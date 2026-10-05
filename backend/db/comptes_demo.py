# backend/db/comptes_demo.py
#
# COMPTES ET DONNÉES DE DÉMONSTRATION (D-067) — pour tester l'application en
# local et la présenter en soutenance : un voyageur, un restaurateur abonné
# Visibilité+ et un hôtel abonné, plus des données FICTIVES pour que leurs
# espaces ne soient pas vides (faux voyageurs qui ont consulté la fiche du
# restaurateur, demandes de table, ouvertures de la page de l'hôtel).
#
# DONNÉES DE TEST, JAMAIS EN PRODUCTION. Les mots de passe ci-dessous sont des
# valeurs de démonstration, publiques par nature ; ne les réutilisez nulle
# part ailleurs. Le script refuse de tourner sur une base Postgres
# (DATABASE_URL), c'est-à-dire en dehors de la base de travail locale.
#
# ADRESSES EN @example.com : le domaine est réservé aux exemples (RFC 2606),
# il a l'air d'une vraie adresse mais n'appartient à personne — aucun risque
# d'utiliser par erreur l'adresse d'une vraie personne.
#
# Idempotent : relancé, il ne recrée rien. `--supprimer` retire toutes les
# données fictives (comptes, visites, demandes de table, abonnements).
#
#     python -m backend.db.comptes_demo
#     python -m backend.db.comptes_demo --supprimer

import argparse
import random
import secrets
import sys
from datetime import datetime, timedelta

from backend import config
from backend.core.auth import security
from backend.db import repository as repo
from backend.db.models import get_connection, init_db

# Même mot de passe pour tous les comptes de démonstration (choix de
# l'utilisateur, 5 octobre 2026) : plus simple à présenter en soutenance.
MOT_DE_PASSE_DEMO = "password123"

COMPTES = {
    "voyageur": {
        "email": "camille.martin@example.com",
        "mot_de_passe": MOT_DE_PASSE_DEMO,
        "nom": "Camille Martin",
    },
    "restaurateur": {
        "email": "antoine.dubois@example.com",
        "mot_de_passe": MOT_DE_PASSE_DEMO,
        "nom": "Antoine Dubois",
    },
    # Restaurateur SANS offre : fiche gratuite seulement — pour montrer ce
    # qu'un restaurateur voit avant de souscrire (total des consultations,
    # détail réservé à l'offre Visibilité).
    "restaurateur_gratuit": {
        "email": "nadia.haddad@example.com",
        "mot_de_passe": MOT_DE_PASSE_DEMO,
        "nom": "Nadia Haddad",
    },
    "hotel": {
        "email": "reception@hotel-pantheon.example.com",
        "mot_de_passe": MOT_DE_PASSE_DEMO,
        "nom": "Hôtel du Panthéon (démo)",
    },
}

# Anciennes adresses de la première version du script, migrées si présentes.
ANCIENS_EMAILS = {
    "voyageur": "demo.voyageur@localsignal.test",
    "restaurateur": "demo.restaurateur@localsignal.test",
    "hotel": "demo.hotel@localsignal.test",
}

# Hôtel fictif placé au Panthéon, au cœur de la zone témoin.
HOTEL = {"nom": "Hôtel du Panthéon (démo)", "adresse": "Place du Panthéon, 75005 Paris",
         "lat": 48.8462, "lng": 2.3464}

# Faux voyageurs : ils ne peuvent pas se connecter (mot de passe aléatoire
# jeté), ils servent seulement à peupler le détail des visites.
VISITEURS = [
    "Léa Bernard", "Thomas Petit", "Julien Moreau", "Sophie Laurent", "Hugo Garcia",
    "Emma Rousseau", "Lucas Fournier", "Chloé Girard", "Nathan Bonnet", "Manon Lambert",
    "Inès Fontaine", "Maxime Chevalier", "Sarah Müller", "Daniel Smith", "Yuki Tanaka",
]


def _email_visiteur(nom: str) -> str:
    base = (nom.lower().replace(" ", ".").replace("é", "e").replace("è", "e")
            .replace("ï", "i").replace("ü", "u"))
    return f"{base}@example.com"


def _admin_id() -> int:
    conn = get_connection()
    row = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").fetchone()
    conn.close()
    if not row:
        sys.exit("Aucun compte admin : impossible de valider la fiche restaurateur.")
    return dict(row)["id"]


def _restaurant_libre() -> dict:
    """Le restaurant le mieux classé du Quartier latin, avec photo, sans propriétaire."""
    conn = get_connection()
    row = conn.execute("""
        SELECT id, name FROM restaurants
        WHERE zone = 'quartier-latin' AND owner_user_id IS NULL
          AND photo_ref IS NOT NULL AND photo_ref <> ''
        ORDER BY local_signal DESC LIMIT 1
    """).fetchone()
    conn.close()
    return dict(row)


def _migrer_anciens_emails() -> None:
    conn = get_connection()
    for cle, ancien in ANCIENS_EMAILS.items():
        conn.execute("UPDATE users SET email = ?, name = ? WHERE email = ?",
                     (COMPTES[cle]["email"], COMPTES[cle]["nom"], ancien))
    conn.commit()
    conn.close()


def _instant_au_hasard(rng: random.Random, jours: int = 30) -> str:
    moment = datetime.now() - timedelta(days=rng.uniform(0, jours), hours=rng.uniform(0, 12))
    # Heures de repas plus probables : on recale vers midi ou le soir.
    moment = moment.replace(hour=rng.choice([12, 12, 13, 19, 20, 20, 21]), minute=rng.randint(0, 59))
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def _restaurateur(cle: str) -> dict:
    """Crée (si besoin) le compte restaurateur `cle` avec une fiche validée."""
    r = COMPTES[cle]
    compte = repo.get_user_by_email(r["email"])
    if not compte:
        resto = _restaurant_libre()
        cree = repo.create_restaurateur_account(
            email=r["email"], password_hash=security.hash_password(r["mot_de_passe"]),
            name=r["nom"], accepted_terms_at=None, restaurant_id=resto["id"],
            message="Compte de démonstration",
        )
        repo.approve_claim(cree["claim_id"], admin_user_id=_admin_id())
        compte = repo.get_user_by_id(cree["user_id"])
    return compte


def _mois_precedent(fiche: dict) -> None:
    """
    Visites anonymes du mois d'avant (31 à 60 jours), pour que l'évolution
    affichée au tableau de bord soit crédible (+40 % environ).
    """
    from datetime import date
    conn = get_connection()
    rows = conn.execute("SELECT consulted_at FROM consultations WHERE restaurant_id = ?",
                        (fiche["id"],)).fetchall()
    limite = date.today() - timedelta(days=30)
    anciennes = sum(1 for r in rows if str(dict(r)["consulted_at"])[:10] < limite.isoformat())
    if anciennes < 20:
        rng = random.Random(2028)
        for _ in range(120):
            moment = datetime.now() - timedelta(days=rng.uniform(31, 59))
            moment = moment.replace(hour=rng.choice([12, 13, 19, 20, 21]), minute=rng.randint(0, 59))
            conn.execute(
                "INSERT INTO consultations (restaurant_id, restaurant_name, score_final, user_id,"
                " consulted_at) VALUES (?, ?, NULL, NULL, ?)",
                (fiche["id"], fiche["name"], moment.strftime("%Y-%m-%d %H:%M:%S")),
            )
        conn.commit()
    conn.close()


def _peupler_gratuit(fiche: dict) -> None:
    """Quelques consultations anonymes pour la fiche sans offre."""
    conn = get_connection()
    n = dict(conn.execute(
        "SELECT COUNT(*) AS n FROM consultations WHERE restaurant_id = ?", (fiche["id"],)
    ).fetchone())["n"]
    if n == 0:
        rng = random.Random(2027)
        for _ in range(58):
            conn.execute(
                "INSERT INTO consultations (restaurant_id, restaurant_name, score_final, user_id,"
                " consulted_at) VALUES (?, ?, ?, NULL, ?)",
                (fiche["id"], fiche["name"], None, _instant_au_hasard(rng)),
            )
        conn.commit()
    conn.close()


def _peupler(fiche: dict, hotel: dict) -> None:
    """Données fictives — seulement si elles n'existent pas déjà."""
    rng = random.Random(2026)  # graine fixe : la démo est la même à chaque fois
    conn = get_connection()

    deja = conn.execute(
        "SELECT COUNT(*) AS n FROM users WHERE email = ?", (_email_visiteur(VISITEURS[0]),)
    ).fetchone()
    if dict(deja)["n"] == 0:
        ids = []
        for nom in VISITEURS:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'user')",
                (_email_visiteur(nom), security.hash_password(secrets.token_urlsafe(24)), nom),
            )
            ids.append(cur.lastrowid)

        # ~1 visite sur 4 vient d'une personne connectée : les autres visiteurs
        # (non connectés) n'ont pas d'identifiant, ils ne comptent que dans le
        # total — exactement comme en vrai.
        for _ in range(170):
            user_id = rng.choice(ids) if rng.random() < 0.25 else None
            conn.execute(
                "INSERT INTO consultations (restaurant_id, restaurant_name, score_final, user_id,"
                " consulted_at) VALUES (?, ?, ?, ?, ?)",
                (fiche["id"], fiche["name"], None, user_id, _instant_au_hasard(rng)),
            )

        for nom in rng.sample(VISITEURS, 6):
            jour = (datetime.now() + timedelta(days=rng.randint(1, 14))).strftime("%Y-%m-%d")
            conn.execute(
                "INSERT INTO reservations (restaurant_id, restaurant_name, user_name, user_email,"
                " num_persons, date, time_slot) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (fiche["id"], fiche["name"], nom, _email_visiteur(nom), rng.randint(2, 5),
                 jour, rng.choice(["12:30", "13:00", "19:30", "20:00", "20:30"])),
            )

        for _ in range(64):
            conn.execute("INSERT INTO hotel_visites (hotel_id, created_at) VALUES (?, ?)",
                         (hotel["id"], _instant_au_hasard(rng)))

    conn.commit()
    conn.close()


def supprimer() -> None:
    """Retire tous les comptes et données de démonstration."""
    conn = get_connection()
    emails = [c["email"] for c in COMPTES.values()] + list(ANCIENS_EMAILS.values())
    emails += [_email_visiteur(n) for n in VISITEURS]
    marques = ",".join("?" for _ in emails)
    ids = [dict(r)["id"] for r in conn.execute(f"SELECT id FROM users WHERE email IN ({marques})", emails)]
    if ids:
        m = ",".join("?" for _ in ids)
        conn.execute(f"DELETE FROM consultations WHERE user_id IN ({m})", ids)
        conn.execute(f"DELETE FROM reservations WHERE user_email IN ({marques})", emails)
        for (rid,) in conn.execute(f"SELECT id FROM restaurants WHERE owner_user_id IN ({m})", ids).fetchall():
            # Les visites anonymes fictives de la fiche démo partent avec elle.
            conn.execute("DELETE FROM consultations WHERE restaurant_id = ? AND user_id IS NULL", (rid,))
        conn.execute(f"UPDATE restaurants SET owner_user_id = NULL WHERE owner_user_id IN ({m})", ids)
        conn.execute(f"DELETE FROM restaurant_claims WHERE user_id IN ({m})", ids)
        conn.execute(f"DELETE FROM abonnements WHERE user_id IN ({m})", ids)
        conn.execute(f"DELETE FROM hotels WHERE user_id IN ({m})", ids)
        conn.execute(f"DELETE FROM users WHERE id IN ({m})", ids)
    conn.commit()
    conn.close()
    print(f"Données de démonstration supprimées ({len(ids)} comptes).")


def main() -> None:
    analyseur = argparse.ArgumentParser(description="Comptes et données de démonstration (D-067).")
    analyseur.add_argument("--supprimer", action="store_true")
    args = analyseur.parse_args()

    if config.DATABASE_URL:
        sys.exit("Refusé : DATABASE_URL est définie. Ce script ne vise que la base locale.")
    init_db()
    if args.supprimer:
        supprimer()
        return
    _migrer_anciens_emails()

    v = COMPTES["voyageur"]
    if not repo.get_user_by_email(v["email"]):
        repo.create_user(v["email"], security.hash_password(v["mot_de_passe"]), v["nom"])

    compte = _restaurateur("restaurateur")
    fiche = repo.get_restaurant_for_owner(compte["id"])
    if not repo.get_abonnement_actif(compte["id"]):
        repo.souscrire(compte["id"], "visibilite_plus", restaurant_id=fiche["id"])

    h = COMPTES["hotel"]
    compte_h = repo.get_user_by_email(h["email"])
    if not compte_h:
        repo.create_hotel_account(
            email=h["email"], password_hash=security.hash_password(h["mot_de_passe"]),
            name=h["nom"], accepted_terms_at=None, slug="hotel-du-pantheon-demo", **HOTEL,
        )
        compte_h = repo.get_user_by_email(h["email"])
    hotel = repo.get_hotel_by_user(compte_h["id"])
    repo.update_hotel(hotel["id"], {
        "nom": HOTEL["nom"], "couleur": "#1a5c3e",
        "message": "Bienvenue ! Voici les adresses où mangent les habitants du quartier.",
    })
    if not repo.get_abonnement_actif(compte_h["id"]):
        repo.souscrire(compte_h["id"], "hotel", hotel_id=hotel["id"])

    _peupler(fiche, hotel)
    _mois_precedent(fiche)

    # Un compte déjà créé garde son ancien mot de passe : on le réaligne sur
    # COMPTES à chaque passage, pour que le tableau de docs/COMPTES-DEMO.md
    # reste toujours vrai.
    for c in COMPTES.values():
        u = repo.get_user_by_email(c["email"])
        if u:
            repo.set_password_hash(u["id"], security.hash_password(c["mot_de_passe"]))

    # Restaurateur sans offre — créé APRÈS le premier, pour qu'il prenne la
    # fiche suivante du classement. Jamais d'abonnement pour lui.
    compte_g = _restaurateur("restaurateur_gratuit")
    fiche_g = repo.get_restaurant_for_owner(compte_g["id"])
    _peupler_gratuit(fiche_g)

    print("Comptes de démonstration prêts (identifiants : docs/COMPTES-DEMO.md).")
    print(f"  restaurateur → fiche « {fiche['name']} » (Visibilité+), "
          f"{repo.count_consultations(fiche['id'])} consultations")
    print(f"  sans offre   → fiche « {fiche_g['name']} », "
          f"{repo.count_consultations(fiche_g['id'])} consultations")
    print(f"  hôtel        → page /hotel/{hotel['slug']}, {repo.count_hotel_visites(hotel['id'])} ouvertures")


if __name__ == "__main__":
    main()
