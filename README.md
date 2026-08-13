# Local Signal

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

Deux scores de nature distincte, jamais mélangés :

**Local Signal** — statique, précalculé, stocké en base. *Ce qu'est le restaurant :*
signal menu, signal avis, anomalie de prix, pénalité zone touristique.

**Pertinence** — dynamique, calculée à la requête. *Ce qui convient à l'utilisateur
maintenant :* distance, ouverture, budget, cuisine, contraintes alimentaires.

> Les pondérations actuelles sont **provisoires**. Elles seront dérivées du jeu
> labellisé, pas choisies à la main — voir [`docs/methodologie/evaluation.md`](docs/methodologie/evaluation.md).

## Structure du dépôt

```
backend/               API FastAPI, moteur de scoring, base de données
  core/scoring/        calcul des scores
  ingestion/osm/       OpenStreetMap — référentiel des lieux
  ingestion/google/    Places Photos — amorçage des menus
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

Toutes les commandes se lancent **depuis la racine du dépôt**.

### Installation

```bash
pip install -r requirements.txt
```

```bash
cd apps/web && npm install
```

Copier `.env.example` en `.env` et y renseigner les clés (voir
[docs/CONVENTIONS.md §7](docs/CONVENTIONS.md)).

### Backend API

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

### Interface web

```bash
cd apps/web && npm run dev
```

### Application mobile

```bash
cd apps/mobile && npm start
```

### Données

Importer et scorer une zone depuis OpenStreetMap :

```bash
python -m backend.ingestion.osm.load quartier-latin
```

Amorcer le signal menu depuis les photos Google Places :

```bash
python -m backend.ingestion.menu_scan.harvest quartier-latin --limit 20
```

### Tests

```bash
python -m backend.tests.test_scoring
```

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
