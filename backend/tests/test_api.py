"""
Tests des routes de l'API.

Les tests de scoring (`test_scoring.py`) vérifient le moteur ; ceux-ci
vérifient le CONTRAT DE L'API — ce que les interfaces consomment réellement.
Une régression de scoring casse un score ; une régression ici casse l'écran.

Comme pour le scoring, ce sont des tests de PROPRIÉTÉS et non de valeurs :
aucune assertion ne porte sur un score précis ou un nombre de restaurants, qui
changeront à la calibration comme à chaque enrichissement de la base. Ce qui
est vérifié, ce sont les invariants issus des décisions :

  - un filtre ne réordonne jamais (D-034)
  - une donnée manquante n'exclut jamais, sauf `avec_carte` (D-012, D-034)
  - la note n'influence pas le classement (D-007)
  - le Local Signal ne dépend pas de la position de l'utilisateur (D-008)
  - l'authentification ne fuit pas l'existence d'un compte
  - les tentatives sont limitées (LS-28)

Ces tests tournent sur la BASE RÉELLE. Ils sont donc tolérants au volume : ils
vérifient des relations entre résultats, jamais des totaux. Ceux qui exigent
des données sont ignorés proprement si la base est vide, plutôt que de rendre
un faux échec.

Lancement :  python -m backend.tests.test_api
"""

import uuid

from fastapi.testclient import TestClient

from backend import config
from backend.core.auth import limitation
from backend.main import app

# DEUX CLIENTS, ET C'EST ESSENTIEL.
#
# Un visiteur non connecte ne recoit que `ANON_RESULTS_LIMIT` resultats. Tester
# les invariants de classement sur une page de cinq lignes ne prouve rien : les
# cinq premiers ont tous une carte et un prix, donc aucun cas limite n'apparait.
# Les tests de donnees passent donc par un client CONNECTE, et la limite
# anonyme est testee separement, pour elle-meme.
client = TestClient(app)
connecte = TestClient(app)

_echecs = []
_ignores = []

ZONE = {"lat": 48.8462, "lng": 2.3464, "radius": 1500}


def verifier(condition, libelle, detail=""):
    if condition:
        print(f"  OK     {libelle}")
    else:
        print(f"  ECHEC  {libelle}  {detail}")
        _echecs.append(libelle)


def ignorer(libelle, raison):
    print(f"  IGNORE {libelle}  ({raison})")
    _ignores.append(libelle)


def chercher(**extra):
    """Appelle /api/restaurants sur la zone témoin, en session ouverte."""
    params = {**ZONE, **extra}
    r = connecte.get("/api/restaurants", params=params)
    assert r.status_code == 200, f"statut {r.status_code} sur {params}"
    return r.json()


def email_neuf():
    return f"test-{uuid.uuid4().hex[:12]}@exemple.test"


# --- Ouverture de session, prealable aux tests de donnees ---
limitation.reinitialiser()
_email_lecture = email_neuf()
_mdp_lecture = "motdepasse-de-lecture-123"
connecte.post("/api/auth/signup", headers={"X-Forwarded-For": "203.0.113.1"},
              json={"email": _email_lecture, "password": _mdp_lecture, "name": "Lecteur"})
limitation.reinitialiser()


# =============================================================================
print("=" * 78)
print("CONTRAT DE LA ROUTE DE RECHERCHE")
print("=" * 78)

base = chercher(limit=30)
restos = base["restaurants"]
verifier("count" in base and "restaurants" in base,
         "la reponse porte `count` et `restaurants`")
verifier(base["count"] >= len(restos),
         "`count` est le total avant troncature, pas la taille de la page",
         f"count={base['count']} page={len(restos)}")

if not restos:
    ignorer("forme d'un restaurant", "aucun restaurant dans la zone temoin")
else:
    r0 = restos[0]
    for champ in ("id", "name", "lat", "lng", "distance_m", "scoring"):
        verifier(champ in r0, f"le restaurant porte `{champ}`")
    verifier("local_signal" in r0.get("scoring", {}),
             "le bloc `scoring` porte `local_signal`")
    verifier("reasons" in r0.get("scoring", {}),
             "le bloc `scoring` porte `reasons` — l'explication (D-009)")

# --- lat et lng sont obligatoires : pas de coordonnees par defaut (CLAUDE.md 8)
verifier(connecte.get("/api/restaurants").status_code == 422,
         "lat et lng sont obligatoires — aucune ville n'est supposee")

# --- le classement est decroissant
if len(restos) >= 2:
    scores = [r["scoring"]["score_final"] for r in restos]
    verifier(scores == sorted(scores, reverse=True),
             "les resultats sont tries par score decroissant")
else:
    ignorer("tri decroissant", "moins de deux resultats")


# =============================================================================
print("\n" + "=" * 78)
print("FILTRES — D-034 : ils retirent des lignes, ils n'en reordonnent aucune")
print("=" * 78)

for nom, extra in [
    ("ouvert maintenant", {"ouvert": "true"}),
    ("reservation", {"reservation": "true"}),
    ("carte analysee", {"avec_carte": "true"}),
    ("budget plafonne", {"budget_max": 15}),
]:
    filtre = chercher(limit=30, **extra)
    verifier(filtre["count"] <= base["count"],
             f"« {nom} » ne peut pas augmenter le nombre de resultats",
             f"{filtre['count']} > {base['count']}")

    # L'ordre relatif des survivants doit etre celui du classement de base.
    rang = {r["id"]: i for i, r in enumerate(base["restaurants"])}
    survivants = [rang[r["id"]] for r in filtre["restaurants"] if r["id"] in rang]
    verifier(survivants == sorted(survivants),
             f"« {nom} » preserve l'ordre du classement")

# --- Une donnee manquante n'exclut jamais (D-012), sauf `avec_carte`
sans_prix = [r for r in chercher(limit=200, budget_max=15)["restaurants"]
             if r.get("price") is None]
verifier(len(sans_prix) > 0 or not base["restaurants"],
         "un restaurant sans prix connu survit a un filtre de budget",
         "aucun restaurant sans prix dans le resultat")

avec_carte = chercher(limit=200, avec_carte="true")["restaurants"]
verifier(all((r.get("menu_photo_urls") or "").strip() for r in avec_carte)
         if avec_carte else True,
         "« carte analysee » est le seul filtre ou l'absence exclut")


# =============================================================================
print("\n" + "=" * 78)
print("LA NOTE N'INFLUENCE PAS LE CLASSEMENT — D-007")
print("=" * 78)

notes = [(r.get("rating"), r["scoring"]["local_signal"])
         for r in chercher(limit=100)["restaurants"] if r.get("rating")]
if len(notes) < 10:
    ignorer("independance note / score", "moins de dix restaurants notes")
else:
    # Il doit exister au moins un couple ou la meilleure note a le moins bon
    # score : si la note pilotait le classement, ce couple n'existerait pas.
    contre_exemple = any(
        a[0] > b[0] and a[1] < b[1] for a in notes for b in notes
    )
    verifier(contre_exemple,
             "un restaurant mieux note peut avoir un Local Signal plus faible")

verifier(not any("rating" in str(k).lower()
                 for k in (chercher(limit=1)["restaurants"] or [{}])[0]
                 .get("scoring", {}).get("signals", {})),
         "aucun signal de scoring ne porte sur la note")


# =============================================================================
print("\n" + "=" * 78)
print("SEPARATION STATIQUE / DYNAMIQUE — D-008")
print("=" * 78)

ici = chercher(limit=50)
# Un point proche mais distinct : assez loin pour que la proximite change,
# assez proche pour que les deux requetes partagent des restaurants.
ailleurs = connecte.get("/api/restaurants",
                        params={"lat": 48.8520, "lng": 2.3430,
                                "radius": 1500, "limit": 200}).json()

signal_ici = {r["id"]: r["scoring"]["local_signal"] for r in ici["restaurants"]}
signal_ailleurs = {r["id"]: r["scoring"]["local_signal"] for r in ailleurs["restaurants"]}
communs = set(signal_ici) & set(signal_ailleurs)

if not communs:
    ignorer("invariance du Local Signal", "aucun restaurant commun aux deux requetes")
else:
    identiques = all(abs(signal_ici[i] - signal_ailleurs[i]) < 0.01 for i in communs)
    verifier(identiques,
             "le Local Signal ne depend pas de la position de l'utilisateur",
             f"{len(communs)} restaurants compares")

    proximites_ici = {r["id"]: r["scoring"]["relevance"]["proximity"]
                      for r in ici["restaurants"] if "relevance" in r["scoring"]}
    proximites_ailleurs = {r["id"]: r["scoring"]["relevance"]["proximity"]
                           for r in ailleurs["restaurants"] if "relevance" in r["scoring"]}
    bouge = any(abs(proximites_ici[i] - proximites_ailleurs[i]) > 0.01
                for i in communs & set(proximites_ici) & set(proximites_ailleurs))
    verifier(bouge, "la proximite, elle, change avec la position")


# =============================================================================
print("\n" + "=" * 78)
print("FICHE, CUISINES, STATISTIQUES")
print("=" * 78)

if not restos:
    ignorer("fiche restaurant", "aucun restaurant")
else:
    fiche = client.get(f"/api/restaurant/{restos[0]['id']}")
    verifier(fiche.status_code == 200, "la fiche d'un restaurant connu repond 200")
    d = fiche.json()
    verifier("scoring" in d and "signals" in d,
             "la fiche porte le detail des signaux")

verifier(client.get("/api/restaurant/inexistant-xyz").status_code == 404,
         "une fiche inconnue repond 404")

cuisines = client.get("/api/cuisines").json()
verifier(isinstance(cuisines, list), "la route des cuisines rend une liste")
if not cuisines:
    # Base vide : c'est le cas en integration continue, et c'est legitime.
    ignorer("contenu des cuisines", "aucune cuisine en base")
else:
    verifier(all({"value", "label", "count"} <= set(c) for c in cuisines),
             "chaque cuisine porte value, label et count")
    libelles = [c["label"] for c in cuisines]
    verifier(len(libelles) == len(set(libelles)),
             "aucun libelle de cuisine en double — D-037")
    volumes = [c["count"] for c in cuisines]
    verifier(volumes == sorted(volumes, reverse=True),
             "les cuisines sont triees par frequence decroissante — D-037")

verifier(client.get("/api/stats").status_code == 200, "la route des statistiques repond")


# =============================================================================
print("\n" + "=" * 78)
print("AUTHENTIFICATION")
print("=" * 78)

limitation.reinitialiser()
entete = {"X-Forwarded-For": "203.0.113.10"}

email = email_neuf()
motdepasse = "motdepasse-solide-123"

r = client.post("/api/auth/signup", headers=entete,
                json={"email": email, "password": motdepasse, "name": "Test"})
verifier(r.status_code == 200, "l'inscription cree un compte", r.text[:120])
verifier("password" not in r.text.lower() and "hash" not in r.text.lower(),
         "la reponse ne renvoie ni mot de passe ni empreinte")

r = client.post("/api/auth/signup", headers=entete,
                json={"email": email, "password": motdepasse, "name": "Test"})
verifier(r.status_code == 409, "un email deja pris est refuse")

r = client.post("/api/auth/signup", headers={"X-Forwarded-For": "203.0.113.11"},
                json={"email": email_neuf(), "password": "court", "name": "T"})
verifier(r.status_code == 400, "un mot de passe trop court est refuse")

# --- Le message ne doit pas reveler si le compte existe
limitation.reinitialiser()
a = client.post("/api/auth/login", headers={"X-Forwarded-For": "203.0.113.20"},
                json={"email": email, "password": "mauvais-mot-de-passe"})
b = client.post("/api/auth/login", headers={"X-Forwarded-For": "203.0.113.21"},
                json={"email": email_neuf(), "password": "mauvais-mot-de-passe"})
verifier(a.status_code == b.status_code == 401,
         "les deux echecs renvoient le meme code")
verifier(a.json().get("detail") == b.json().get("detail"),
         "le message ne revele pas si le compte existe")

# --- Session
limitation.reinitialiser()
session = TestClient(app)
r = session.post("/api/auth/login", headers={"X-Forwarded-For": "203.0.113.30"},
                 json={"email": email, "password": motdepasse})
verifier(r.status_code == 200, "la connexion valide ouvre une session")
verifier(session.get("/api/auth/me").status_code == 200,
         "la session permet d'interroger son propre compte")
session.post("/api/auth/logout")
verifier(session.get("/api/auth/me").status_code == 401,
         "la deconnexion revoque immediatement la session")

# --- Limitation de debit (LS-28)
limitation.reinitialiser()
codes = [client.post("/api/auth/login", headers={"X-Forwarded-For": "203.0.113.99"},
                     json={"email": email, "password": "faux"}).status_code
         for _ in range(limitation.MAX_CONNEXIONS + 2)]
verifier(429 in codes, "les tentatives repetees finissent par etre bloquees")
verifier(codes[0] == 401, "les premieres tentatives repondent normalement")
limitation.reinitialiser()


# =============================================================================
print("\n" + "=" * 78)
print("JOURNALISATION — LS-25")
print("=" * 78)

r = client.get("/api/cuisines")
verifier(r.headers.get("x-request-id"),
         "chaque reponse porte un identifiant de requete")


# =============================================================================
print("\n" + "=" * 78)
if _ignores:
    print(f"{len(_ignores)} test(s) ignore(s) faute de donnees : {', '.join(_ignores)}")
if _echecs:
    print(f"{len(_echecs)} ECHEC(S) : {', '.join(_echecs)}")
    raise SystemExit(1)
print("Contrat de l'API verifie.")
