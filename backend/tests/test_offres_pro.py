# backend/tests/test_offres_pro.py
#
# OFFRES PROFESSIONNELLES ET RÈGLE DE NEUTRALITÉ (D-067).
#
# Le mémoire (§4.3) promet que « le paiement ne modifie jamais le score ni la
# position d'un restaurant dans la liste classée ». C'est la propriété la plus
# importante du modèle économique : si elle cassait, le Local Signal ne
# mesurerait plus l'authenticité mais l'abonnement. Ce fichier la vérifie,
# ainsi que le parcours hôtel.
#
# SUR UNE COPIE DE LA BASE. Le test valide une fiche restaurateur et ouvre des
# abonnements : il ne doit jamais le faire sur la base de travail. La copie est
# faite AVANT l'import de l'application, puisque `config.DB_PATH` est lu à
# l'import.
#
#     python -m backend.tests.test_offres_pro

import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
_tmp = Path(tempfile.mkdtemp(prefix="ls_offres_"))
_copie = _tmp / "local_signal.db"
shutil.copy(RACINE / "local_signal.db", _copie)
os.environ["DB_PATH"] = str(_copie)
os.environ.pop("DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402

from backend.core.auth import limitation  # noqa: E402
from backend.db import repository as repo  # noqa: E402
from backend.main import app  # noqa: E402

_echecs = []


def verifier(condition, libelle, detail=""):
    print(f"  {'OK    ' if condition else 'ECHEC '} {libelle}  {'' if condition else detail}")
    if not condition:
        _echecs.append(libelle)


# Les inscriptions répétées déclencheraient la limitation anti-abus.
limitation.garder_inscription = lambda request: None

ZONE = {"lat": 48.8462, "lng": 2.3464, "radius": 1000, "limit": 200}
anonyme = TestClient(app)


def partenaires():
    res = anonyme.get("/api/restaurants", params=ZONE).json()
    return ({r["id"]: r.get("partenaire") for r in res["restaurants"]},
            [r["id"] for r in res["a_decouvrir"]])


def classement():
    rs = anonyme.get("/api/restaurants", params=ZONE).json()["restaurants"]
    return [(r["id"], r["scoring"]["score_final"], r.get("local_signal")) for r in rs]


print("\nRÈGLE DE NEUTRALITÉ (D-067)")
avant = classement()
# La base peut déjà contenir des partenaires (comptes de démonstration,
# backend/db/comptes_demo.py) : on compare à cet état de départ.
partenaires_avant, encart_avant = partenaires()
libres = [rid for rid, _, _ in avant if partenaires_avant.get(rid) is None]
cible = libres[len(libres) // 2]  # un restaurant sans offre, au milieu du classement

pro = TestClient(app)
email = f"resto-{uuid.uuid4().hex[:8]}@test.local"
r = pro.post("/api/auth/signup-restaurateur", json={
    "email": email, "password": "motdepasse123", "name": "Test",
    "accepted_terms": True, "restaurant_id": cible,
})
verifier(r.status_code == 200, "inscription restaurateur", r.text)
claim = repo.get_claim_active_for_user(r.json()["id"])
repo.approve_claim(claim["id"], admin_user_id=1)
v = pro.get("/api/restaurateur/mon-restaurant/visites").json()
verifier(v["detail_reserve"] is True and v["visites"] is None and "total" in v,
         "sans offre : total visible, détail réservé à l'offre Visibilité")
d = pro.get("/api/restaurateur/tableau-de-bord").json()
verifier(d["statistiques"] is None and d["clients"] is None
         and "consultations" in d and isinstance(d["reservations"], list) and d["rang"],
         "tableau de bord sans offre : rang, total et demandes de table, clients réservés")

for offre in ("visibilite", "visibilite_plus"):
    r = pro.post("/api/pro/abonnement", json={"offre": offre})
    verifier(r.status_code == 200 and r.json()["abonnement"]["offre"] == offre,
             f"souscription « {offre} »", r.text)
    apres = classement()
    verifier(apres == avant,
             f"même score et même rang pour tous après « {offre} »")
    v = pro.get("/api/restaurateur/mon-restaurant/visites").json()
    verifier(v["detail_reserve"] is False and isinstance(v["visites"], list),
             f"avec « {offre} » : détail des visites accessible")
    d = pro.get("/api/restaurateur/tableau-de-bord").json()
    verifier(d["statistiques"] is not None and isinstance(d["clients"], list),
             f"tableau de bord avec « {offre} » : statistiques et clients")

res = anonyme.get("/api/restaurants", params=ZONE).json()
marque = next(x for x in res["restaurants"] if x["id"] == cible)
verifier(marque.get("partenaire") == "visibilite_plus", "le badge partenaire est posé")
verifier(cible in [x["id"] for x in res["a_decouvrir"]],
         "l'encart « À découvrir » contient le partenaire Visibilité+")
autres = {x["id"]: x.get("partenaire") for x in res["restaurants"] if x["id"] != cible}
verifier(autres == {k: v for k, v in partenaires_avant.items() if k != cible},
         "aucun autre restaurant ne change d'étiquette")

r = pro.post("/api/pro/abonnement", json={"offre": "hotel"})
verifier(r.status_code == 400, "un restaurateur ne peut pas prendre l'offre hôtel")
pro.post("/api/pro/abonnement/resilier")
verifier(partenaires()[1] == encart_avant,
         "après résiliation, l'encart revient à son état de départ")

voyageur = TestClient(app)
voyageur.post("/api/auth/signup", json={
    "email": f"v-{uuid.uuid4().hex[:8]}@test.local", "password": "motdepasse123",
    "name": "Voyageur", "accepted_terms": True,
})
verifier(voyageur.post("/api/pro/abonnement", json={"offre": "visibilite"}).status_code == 403,
         "un voyageur ne peut pas souscrire d'offre pro")
verifier(voyageur.post(f"/api/favoris/{cible}").status_code == 200,
         "un voyageur sans Pass peut ajouter un favori (D-067)")

print("\nPARCOURS HÔTEL (D-067)")
hotel = TestClient(app)
r = hotel.post("/api/auth/signup-hotel", json={
    "email": f"h-{uuid.uuid4().hex[:8]}@test.local", "password": "motdepasse123",
    "accepted_terms": True, "nom": "Hôtel du Panthéon", "lat": 48.8462, "lng": 2.3464,
})
verifier(r.status_code == 200 and r.json()["role"] == "hotel", "inscription hôtel", r.text)
moi = hotel.get("/api/hotel/mon-hotel").json()
slug = moi["slug"]
verifier(slug.startswith("hotel-du-pantheon"), "adresse de page lisible", slug)
verifier(anonyme.get(f"/api/hotels/{slug}").status_code == 404,
         "pas de page publique sans abonnement")
r = hotel.post("/api/pro/abonnement", json={"offre": "hotel"})
verifier(r.status_code == 200 and r.json()["abonnement"]["statut"] == "essai",
         "abonnement hôtel avec mois d'essai")
r = anonyme.get(f"/api/hotels/{slug}")
verifier(r.status_code == 200 and r.json()["nom"] == "Hôtel du Panthéon", "page publique servie")
verifier(hotel.get("/api/hotel/mon-hotel").json()["visites"] == 1, "la visite est comptée")
r = hotel.patch("/api/hotel/mon-hotel", json={"couleur": "rouge"})
verifier(r.status_code == 400, "une couleur invalide est refusée")
r = hotel.patch("/api/hotel/mon-hotel", json={"couleur": "#1A5C3E", "message": "Bon appétit"})
verifier(r.status_code == 200 and r.json()["couleur"] == "#1A5C3E", "personnalisation enregistrée")
verifier(classement() == avant, "un hôtel abonné ne change pas le classement")

print("\n" + "=" * 70)
shutil.rmtree(_tmp, ignore_errors=True)
if _echecs:
    print(f"{len(_echecs)} ECHEC(S) : {', '.join(_echecs)}")
    sys.exit(1)
print("Offres pro et neutralité vérifiées.")
