# Local Signal

[![CI](https://github.com/Faresffa/local_signal/actions/workflows/ci.yml/badge.svg)](https://github.com/Faresffa/local_signal/actions/workflows/ci.yml)

Quand on voyage, on veut souvent découvrir une ville **comme un local**.
Cela passe évidemment par la nourriture et les restaurants que fréquentent réellement les habitants.

Pourtant, dans la plupart des destinations touristiques, les voyageurs se retrouvent souvent dans des restaurants chers, standardisés et pensés avant tout pour les touristes.

Le problème n'est pas le manque de restaurants authentiques.
Le problème est **le manque de visibilité**.

Les restaurants de quartier indépendants sont souvent éclipsés par des établissements très visibles, optimisés pour attirer les touristes et mis en avant par les plateformes classiques. Résultat : les voyageurs n'ont **aucun repère fiable pour distinguer un vrai restaurant local d'un attrape-touriste**.

## Notre vision

Ce projet vise à créer une plateforme qui aide les voyageurs à découvrir **des restaurants authentiques, fréquentés par les habitants, à des prix justes**.

Au lieu de mettre en avant les établissements les plus visibles ou les mieux référencés, la plateforme cherche à révéler les lieux qui font réellement partie de la vie locale.

## Ce que propose l'application

L'utilisateur peut rechercher des restaurants en fonction de :

* sa ville ou de son itinéraire de la journée
* l'ambiance recherchée (cantine, restaurant de quartier, calme ou animé)
* son budget
* le nombre de personnes
* le type de cuisine

L'application propose ensuite des restaurants qui :

* se trouvent sur son trajet ou à proximité
* correspondent à l'ambiance recherchée
* sont **réellement fréquentés par les locaux**

L'objectif n'est pas de recommander "les meilleurs restaurants" selon des notes ou des classements, mais **les restaurants les plus authentiques et les plus adaptés à un moment précis**.

## Objectif du projet

À terme, l'ambition est de construire un outil de découverte qui reconnecte les voyageurs avec **la vraie vie culinaire des villes qu'ils visitent**, tout en redonnant de la visibilité aux restaurants indépendants qui font vivre les quartiers.

---

## Question de recherche

> Peut-on mesurer automatiquement l'authenticité locale d'un restaurant,
> **sans se reposer sur sa popularité** ?

C'est la contrainte centrale du projet. Un restaurant invisible a peu ou pas d'avis :
tout critère fondé sur le volume d'avis ou la notoriété disqualifie mécaniquement les
restaurants que le projet veut mettre en avant.

C'est ce qui oriente l'ensemble de l'architecture — voir [`docs/DECISIONS.md`](docs/DECISIONS.md).

## L'apport IA — le scan de carte

L'utilisateur **photographie la carte affichée en vitrine** ; un modèle de vision
évalue l'authenticité du menu : cohérence culinaire, amplitude, spécificité
lexicale, nombre de langues, présence de formules « menu touriste ».

Trois fonctions en un seul geste :

- **Produit** — répond à l'utilisateur à l'instant exact où il hésite, devant le restaurant.
- **Donnée** — les restaurants authentiques n'ont pas de site web, c'est *pour ça*
  qu'ils sont invisibles. Les utilisateurs deviennent les collecteurs.
- **Recherche** — démontre qu'on peut scorer un restaurant sans aucun avis.

## Architecture du scoring

Deux étages, jamais mélangés. C'est la règle structurante du backend, et c'est
ce qui permet de répondre instantanément sur dix mille restaurants.

```
╔═ CALCUL EN LOT ═══════════ hors ligne, une fois par zone ══════════════════╗
║                                                                            ║
║   OpenStreetMap ────┐                                                      ║
║   restaurants,      │                                                      ║
║   sites touristiques│                                                      ║
║                     ├──► appariement ──► lecture des cartes                ║
║   Collecteur tiers ─┘    nom + distance   OCR + modèle, en local           ║
║   cartes, notes          un pour un       images détruites après lecture   ║
║                                                  │                         ║
║                     ┌────────────────────────────┘                         ║
║                     ▼                                                      ║
║   quatre indicateurs, de 0 à 1                                             ║
║   menu 0,40 · langue 0,30 · prix 0,15 · zone 0,15                          ║
║   absent = inconnu, jamais 0 — le poids se redistribue                     ║
║                     │                                                      ║
║                     ▼                                                      ║
║   LOCAL SIGNAL sur 100  +  confiance, à part ──────────► base de données   ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

╔═ À CHAQUE REQUÊTE ════════ en ligne, instantané ═══════════════════════════╗
║                                                                            ║
║   Web / Mobile ──► API ──► filtres ──► lecture du Local Signal             ║
║   position,                            (jamais recalculé)                  ║
║   rayon, filtres                                │                          ║
║                                                 ▼                          ║
║                            proximité  exp( −d / (rayon × 0,5) )            ║
║                            distance   haversine                            ║
║                                                 │                          ║
║                                                 ▼                          ║
║             CLASSEMENT = Local Signal × 0,70 + proximité × 0,30            ║
║                          ──► liste + explication en français               ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```

**Local Signal** décrit le restaurant : il ne dépend pas de qui cherche, donc il
se calcule une fois et se stocke. **La proximité** décrit l'utilisateur ici et
maintenant : elle seule se recalcule à chaque requête.

Les méthodes employées sont toutes standard — formule de haversine, estimation
par noyau gaussien, rang en percentile, lissage bayésien, moyenne arithmétique
pondérée. Aucune n'est inventée pour le projet : c'est ce qui permet d'en
discuter plutôt que de les croire sur parole.

> Les pondérations actuelles sont **provisoires**. Elles seront dérivées du jeu
> labellisé, pas choisies à la main — voir [`docs/methodologie/evaluation.md`](docs/methodologie/evaluation.md).

## Structure du dépôt

```
backend/               API FastAPI, moteur de scoring, base de données
  core/scoring/        calcul des scores
  ingestion/osm/       OpenStreetMap — référentiel des lieux
  ingestion/google/    Places Photos — amorçage des menus
  ingestion/web/       cartes publiées en ligne — amorçage gratuit
  ingestion/menu_scan/ vision : extraction et récolte
  db/  data/  tests/

apps/
  web/                 interface web — React + Vite
  mobile/              application mobile — Expo

packages/shared/       jetons de design — source unique web + mobile

docs/
  CONVENTIONS.md       règles d'ingénierie
  DECISIONS.md         journal des décisions, avec le raisonnement
  ROADMAP.md           plan, données, auth, base, hébergement
  methodologie/        protocole d'évaluation
  data/                jeu labellisé (vérité terrain)
```

## Lancer le projet

### En une commande

```bash
docker compose up
```

Lance la base (PostgreSQL + PostGIS), l'API et le web. Aucune installation
préalable de Python ni de Node.

| | |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:8000/docs |
| Base | `localhost:5432` — `local_signal` / `local_signal_dev` |

Une base neuve démarre **vide**. Pour la peupler, voir *Données* plus bas.

### Ou à la main

Toutes les commandes se lancent **depuis la racine du dépôt**.

#### Installation

```bash
pip install -r requirements.txt
```

```bash
cd apps/web && npm install
```

Copier `.env.example` en `.env` et y renseigner les clés (voir
[docs/CONVENTIONS.md §7](docs/CONVENTIONS.md)).

#### Backend API

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

#### Interface web

```bash
cd apps/web && npm run dev
```

#### Application mobile

```bash
cd apps/mobile && npm start
```

### Données

Importer et scorer une zone depuis OpenStreetMap :

```bash
python -m backend.ingestion.osm.load quartier-latin
```

Amorcer le signal menu depuis le web — gratuit, sans clé Google (D-023).
Mesurer d'abord la couverture, sans consommer un seul appel au modèle :

```bash
python -m backend.ingestion.web.harvest_web quartier-latin --dry-run
```

Puis extraire et scorer les cartes retenues :

```bash
python -m backend.ingestion.web.harvest_web quartier-latin
```

> Sur le tier gratuit Groq (8 000 tokens/minute), ne pas dépasser
> `--workers 2` : au-delà, les appels sont rejetés avant de tourner.

Associer à chaque restaurant sa photo Google Places (D-025). Chiffrer le coût
d'abord, sans consommer un seul appel :

```bash
python -m backend.ingestion.google.seed_photos quartier-latin --dry-run
```

```bash
python -m backend.ingestion.google.seed_photos quartier-latin --limit 60
```

> Chaque SKU Google offre 1 000 requêtes par mois. Le script saute les
> restaurants déjà résolus : une relance ne re-facture rien.
>
> Les images sont conservées en local (`.photo-cache/`, gitignoré) pour la
> démonstration. **Avant toute mise en ligne**, repasser `PHOTO_CACHE_ENABLED`
> à `false` et purger le cache — voir D-025.

Amorcer le signal menu depuis les photos Google Places — **facturé**, nécessite
`GOOGLE_API_KEY` et la facturation activée (D-021) :

```bash
python -m backend.ingestion.menu_scan.harvest quartier-latin --limit 20
```

### Tests

```bash
python -m backend.tests.test_scoring
```

```bash
python -m backend.tests.test_api
```

Ce sont des tests de **propriétés**, pas de valeurs : ils vérifient les
invariants issus des décisions — un restaurant sans avis n'est pas pénalisé, un
filtre ne réordonne jamais, la note n'influence pas le classement, le Local
Signal ne dépend pas de la position de l'utilisateur. Ils doivent rester verts
après la calibration des pondérations ; si l'un casse alors, c'est la décision
qu'il faut rouvrir, pas le test qu'il faut ajuster.

Les tests d'API tournent sur la base réelle si elle existe, et s'annoncent
ignorés sur une base vide plutôt que de produire un faux échec — c'est ce qui
leur permet de tourner en intégration continue.

Pour les exécuter sur une base jetable :

```bash
DB_PATH=/tmp/essai.db python -m backend.tests.test_api
```

### Variables d'environnement

Copier `.env.example` en `.env`. Aucune n'est obligatoire en développement.

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | bascule sur PostgreSQL | vide → SQLite |
| `DB_PATH` | emplacement de la base SQLite | `local_signal.db` |
| `ALLOWED_ORIGINS` | origines CORS autorisées | les ports de développement |
| `LOG_LEVEL` | verbosité des journaux | `INFO` |
| `EXPOSE_DETAIL_CALCUL` | expose le détail du calcul par indicateur | `false` |
| `ANON_RESULTS_LIMIT` | résultats visibles sans compte | `5` |
| `SESSION_TTL_DAYS` | durée de vie d'une session | `30` |
| `SESSION_COOKIE_SECURE` | cookie réservé au HTTPS | `false` |
| `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OUTSCRAPER_API_KEY` | collecte et vision | vide |

**Aucune clé ne doit jamais être écrite dans `backend/config.py`**, qui est
versionné : elles viennent uniquement de l'environnement (D-016).

| | |
|---|---|
| Interface web | http://localhost:5173 |
| Documentation API | http://localhost:8000/docs |
| Scan de carte | `POST /api/menu/scan` (multipart `image`) |

## Documentation

- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — règles d'ingénierie, structure, secrets, sources autorisées
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — journal des décisions et leur raisonnement
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plan, données, authentification, hébergement
- [`docs/methodologie/evaluation.md`](docs/methodologie/evaluation.md) — protocole d'évaluation
- [`docs/data/README.md`](docs/data/README.md) — constitution de la vérité terrain
