# Local Signal

Quand on voyage, on veut souvent découvrir une ville **comme un local**.
Cela passe évidemment par la nourriture et les restaurants que fréquentent réellement les habitants.

Pourtant, dans la plupart des destinations touristiques, les voyageurs se retrouvent souvent dans des restaurants chers, standardisés et pensés avant tout pour les touristes.

Le problème n’est pas le manque de restaurants authentiques.
Le problème est **le manque de visibilité**.

Les restaurants de quartier indépendants sont souvent éclipsés par des établissements très visibles, optimisés pour attirer les touristes et mis en avant par les plateformes classiques. Résultat : les voyageurs n’ont **aucun repère fiable pour distinguer un vrai restaurant local d’un attrape-touriste**.

## Notre vision

Ce projet vise à créer une plateforme qui aide les voyageurs à découvrir **des restaurants authentiques, fréquentés par les habitants, à des prix justes**.

Au lieu de mettre en avant les établissements les plus visibles ou les mieux référencés, la plateforme cherche à révéler les lieux qui font réellement partie de la vie locale.

## Ce que propose l’application

L’utilisateur peut rechercher des restaurants en fonction de :

* sa ville ou de son itinéraire de la journée
* l’ambiance recherchée (cantine, restaurant de quartier, calme ou animé)
* son budget
* le nombre de personnes
* le type de cuisine

L’application propose ensuite des restaurants qui :

* se trouvent sur son trajet ou à proximité
* correspondent à l’ambiance recherchée
* sont **réellement fréquentés par les locaux**

L’objectif n’est pas de recommander “les meilleurs restaurants” selon des notes ou des classements, mais **les restaurants les plus authentiques et les plus adaptés à un moment précis**.

## Objectif du projet

À terme, l’ambition est de construire un outil de découverte qui reconnecte les voyageurs avec **la vraie vie culinaire des villes qu’ils visitent**, tout en redonnant de la visibilité aux restaurants indépendants qui font vivre les quartiers.

## Architécture du projet 

### **1. ⭐ Score Étoiles (4ème critère de scoring)**

Formule : `Score = (GéoTourist×0.30 + GéoUser×0.25 + Langue×0.20 + Étoiles×0.25) × 100`

Fichiers créés/modifiés :

- **stars_score.py** — nouveau module
- **engine.py** — maj 4 critères
- **config.py** — pondérations rebalancées
- **mock_data.py** — ratings 3.8–4.8 ajoutés

### **2. 🔌 Backend FastAPI**

- **backend/main.py** — 6 endpoints REST avec CORS
- Commande : `python -m uvicorn backend.main:app --reload --port 8000`
- Doc API auto : `http://localhost:8000/docs`

### **3. ⚛️ Frontend React et UX Avancée**

- **App.jsx** — 4 pages (Splash → Search → Results → Reservation)
- **index.css** — Design premium (Inter, gradients, animations)
- **api.js** — Client API
- Commande : `cd frontend && npm run dev`

**Nouveautés UX, Géolocalisation & Accueil :**

- 🏠 **Home Page "Futuriste" & Dynamique** : Fini la barre de chargement basique. L'accueil est un véritable *Dashboard Premium* (Dark theme, glow effects, animations fluides).
- 📍 **Demande Geolocation au lancement** : Dès l'ouverture, l'app demande la position pour afficher des recommandations locales pertinentes, avant même la première recherche.
- 💡 **Recommandations sans Score (Pur Local)** : Comme demandé, la page d'accueil affiche uniquement des suggestions basées sur la localisation, sans afficher de calculs ou de points (les scores restent réservés à la vue de recherche experte).
- 🛡️ **Filtres Allergènes** : Exclusion intelligente via le backend (ex: "Végétarien").
- 🎨 **Zéro Emojis** : Interface 100% propre (librairie `Lucide-React`).
- 🗺️ **LocationPicker Interactif** : Autour de moi (GPS), Adresse manuelle (Nominatim), Carte Interactive (`react-leaflet`).


## Lancer le projet

### Backend API
```bash
cd V0.1
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend React
```bash
cd V0.1/frontend
npm run dev
```

### Interface Streamlit (optionnelle)
```bash
cd V0.1
python -m streamlit run app.py
```

- **React** : [http://localhost:5173](http://localhost:5173/)
- **FastAPI docs** : http://localhost:8000/docs
- **Streamlit** : [http://localhost:8501](http://localhost:8501/)
