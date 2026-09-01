# Roadmap — Local Signal

Ce document répond aux questions restées ouvertes : quelles données, quelle IA,
quelle authentification, quelle base, quel hébergement, dans quel ordre.

Il est écrit pour être relu dans six mois. Les décisions structurantes sont
consignées dans [`DECISIONS.md`](DECISIONS.md) ; ici on trouve **le plan**.

---

## 1. Où en est le projet

| Bloc | État |
|---|---|
| Moteur de scoring | ✅ Refondu (D-013), testé par invariants |
| API REST | ✅ 7 endpoints, dont le scan de carte |
| Scan de carte (IA) | ✅ Pipeline complet, en attente de clé API pour un test réel |
| Interface web | ✅ Migrée sur le nouveau format, explication « pourquoi ? » |
| App mobile | ✅ Expo initialisé — écrans Scanner et Autour de moi |
| Vérité terrain | ❌ **Bloquant** — rien ne peut être calibré sans elle |
| Données réelles | ✅ 736 restaurants OSM (Quartier latin + Montreuil) |
| Authentification | ❌ Aucune table, aucun endpoint — tout est à faire |
| Hébergement | ❌ Tout en local |

---

## 2. Quelles données utiliser

C'était la première question sans réponse. Voici la position par source.

### Référentiel des lieux → **OpenStreetMap / Overpass**

Libre, gratuit, sans quota commercial, et déjà riche : les restaurants y portent
des tags `cuisine=`, `amenity=restaurant`, horaires, adresse, coordonnées.

Ce n'est pas un pis-aller : c'est la seule source sur laquelle on a le droit de
construire une base durable (D-005).

### Cartes / menus → **scan utilisateur + sites officiels**

C'est l'actif du projet. Deux voies d'alimentation :

1. **Scan utilisateur** (implémenté) — l'utilisateur photographie la vitrine.
2. **Sites officiels** quand ils existent — mais les restaurants authentiques
   n'en ont souvent pas ; c'est précisément pourquoi ils sont invisibles.

> **Le scan n'est pas une commodité, c'est la stratégie.** Chaque utilisateur qui
> scanne enrichit une base que personne d'autre ne possède.

### Avis → **signal de la phase mémoire, à remplacer ensuite**

À dire clairement, parce que c'est une faiblesse connue :

- L'API Google Places ne renvoie que **5 avis maximum** par lieu. Le score de
  langue repose donc sur un échantillon minuscule — le lissage bayésien (D-003)
  le reflète honnêtement, mais ça reste peu.
- Les CGU Google interdisent de stocker ces avis durablement (D-005).

**Conséquence :** le signal langue est exploitable pour constituer et évaluer le
jeu labellisé, mais il ne peut pas être un pilier du produit à long terme. Les
signaux durables sont **le menu, l'anomalie de prix et la zone touristique** —
tous les trois calculables sans un seul avis. C'est cohérent avec D-001, et c'est
la raison de fond pour laquelle le menu pèse le plus lourd.

### Prix → OSM + scan de carte

La carte scannée donne les prix. C'est le même geste utilisateur qui alimente
deux signaux d'un coup.

---

## 3. Quelle IA, et ce qu'elle coûte

**Fournisseur interchangeable** (D-017), implémenté dans
`backend/ingestion/menu_scan/` :

| | Modèle | Rôle |
|---|---|---|
| **Défaut** | Groq — `qwen/qwen3.6-27b` | latence (l'utilisateur attend, debout devant le resto) et coût |
| Alternative | `claude-opus-5` | référence de qualité, pour le comparatif d'extraction |

`VISION_PROVIDER` choisit le défaut ; `POST /api/menu/scan?provider=claude`
force l'autre pour comparer.

**Pourquoi garder les deux :** la vraie question n'est pas le prix mais *un
modèle plus léger lit-il correctement une carte photographiée de travers, avec
des reflets, parfois manuscrite ?* C'est empirique. Le comparatif sur le jeu
labellisé coûte ~5 € et devient un résultat du mémoire.

### Le principe qui compte

**Le modèle observe, il ne juge pas.**

On ne lui demande jamais « ce restaurant est-il authentique ? ». On lui demande
combien de plats, quelles cuisines, quelles langues, y a-t-il une formule
touristique. Le score est ensuite calculé par du code déterministe.

Trois raisons, toutes défendables en soutenance :

| | |
|---|---|
| **Reproductibilité** | Deux scans de la même carte donnent le même score |
| **Auditabilité** | Chaque point du score s'explique (D-009) |
| **Calibration** | Les seuils s'ajustent sur le jeu labellisé sans retoucher le prompt |

Un LLM à qui l'on demande directement une note produit un chiffre non
reproductible et incalibrable. Un jury le démonterait en une question.

### Coût de référence

Sur Claude : une carte ≈ 4 800 tokens d'entrée, ~500 en sortie, soit **≈ 3,6
centimes par scan** — 5,40 € pour les 150 cartes du jeu labellisé, ~36 € pour
1 000 scans mensuels. Groq est nettement en dessous.

Autrement dit, **le coût n'était pas le facteur limitant** ; la latence et
l'indépendance fournisseur le sont.

### Sécurité

Les clés passent **exclusivement** par variable d'environnement.
`backend/config.py` est versionné : y écrire une clé la publie sur GitHub.

```bash
$env:GROQ_API_KEY = "gsk_..."
```

---

## 4. Base de données

### Aujourd'hui — SQLite

Correct pour le développement. Fichier unique, zéro configuration, et désormais
hors du suivi Git (D-011).

### Cible — PostgreSQL + PostGIS

Le déclencheur n'est pas le volume, c'est **la requête géographique**. Dès qu'il
faut répondre à « les restaurants dans un rayon de 2 km, triés par Local Signal »
sur plusieurs milliers de lieux, SQLite impose de tout charger en mémoire et de
calculer les distances en Python. PostGIS le fait avec un index spatial.

**Migrer quand** l'une de ces conditions est vraie :
- plus de ~2 000 restaurants en base,
- plusieurs utilisateurs simultanés,
- premier déploiement en ligne.

Tant que le projet tourne en local avec quelques centaines de lieux, SQLite suffit
et migrer serait de la complexité prématurée.

### Ce qui change à la migration

- `db/models.py` et `db/repository.py` passent à SQLAlchemy plutôt qu'à du SQL brut
- Les colonnes `lat`/`lng` deviennent une colonne `geography(Point)`
- `haversine()` reste utile pour les tests, mais les requêtes passent par PostGIS

---

## 5. Authentification

Les tables `users` et `reviews` **n'existent plus** : le schéma refondu par
D-020 ne porte que `restaurants`, `menus`, `tourist_sites`, `reservations` et
`consultations`. `db/seed.py` — qui stockait des mots de passe en clair
(`"hash_alice"`) — n'a donc plus de table à alimenter.

Rien n'est à défaire : tout est à construire, et directement sur Supabase.

### Recommandation : **Supabase**

Un seul service couvre trois besoins du projet :

| Besoin | Ce que Supabase apporte |
|---|---|
| Base | PostgreSQL managé, **extension PostGIS disponible** |
| Auth | Email, OAuth Google/Apple, SDK Expo officiel |
| Stockage | Buckets pour les photos de cartes scannées |

C'est ce qui fait la différence avec une solution d'auth seule (Clerk, Auth0) :
il faudrait de toute façon un Postgres et un stockage de fichiers à côté.

### Ce qu'on ne fait pas

**On n'écrit pas son propre système d'authentification.** Hachage, réinitialisation
de mot de passe, vérification d'email, sessions, rotation de tokens : chacun est
une faille potentielle, et aucun n'apporte de valeur au mémoire.

### Modèle d'accès

- **Anonyme** — recherche, consultation, scan de carte. C'est l'usage principal :
  un voyageur ne crée pas un compte avant de choisir où déjeuner.
- **Authentifié** — réservations, historique, contributions (scans attribués).

L'authentification n'est donc **pas bloquante** pour une démo. Elle le devient
pour les réservations et pour attribuer les scans à leurs contributeurs.

---

## 6. Hébergement

| Composant | Cible | Pourquoi |
|---|---|---|
| API FastAPI | Railway ou Render | Déploiement depuis GitHub, tier gratuit suffisant |
| Base + Auth + Stockage | Supabase | Voir ci-dessus |
| Interface web | Vercel | Build Vite natif, prévisualisation par branche |
| App mobile | Expo EAS | Build iOS + Android sans Mac |

Points à ne pas oublier au premier déploiement :

- `allow_origins=["*"]` doit être restreint à l'URL du front
- `API_BASE` est en dur dans `apps/web/src/api.js` — à passer en variable d'environnement
- Aucun secret dans le dépôt

---

## 7. Plan par phases

### Phase 1 — Rendre le scoring défendable *(bloquant pour tout le reste)*

1. **Constituer la vérité terrain** — ~150 restaurants du Quartier latin,
   labellisés par couverture différentielle
   ([protocole](data/README.md))
2. **Faire valider 30–40 entrées** par de vrais habitants
3. **Ablation** — retirer un signal à la fois, mesurer la perte
4. **Calibrer les pondérations** sur `train`, évaluer sur `test`
5. **Comparatif Google** — `precision@10` contre le top 10 par note

Sans cette phase, chaque chiffre du projet est invérifiable.

### Phase 2 — Données réelles

1. Ingestion OSM / Overpass sur la zone d'évaluation
2. Remplacer les mocks par la base réelle
3. Scanner les cartes du jeu labellisé (valide le pipeline IA sur du réel)
4. Anomalie de prix sur de vraies médianes de quartier

### Phase 3 — Application mobile

1. ~~Initialiser Expo~~ ✅
2. ~~Écran de scan (caméra → `POST /api/menu/scan`)~~ ✅
3. ~~Recherche géolocalisée + explication « pourquoi ? »~~ ✅
4. Fiche restaurant détaillée, filtres, réservation
5. `react-navigation` quand un troisième écran apparaîtra (deux onglets manuels
   suffisent aujourd'hui)

### Phase 4 — Mise en ligne

1. PostgreSQL + PostGIS
2. Supabase Auth
3. Déploiement API + web + build mobile
4. Batch mensuel de recalcul du Local Signal (D-008)

### Ce qui reste en dette

- Le front web consomme les clés de compatibilité (`score_geo_tourist`…) —
  à migrer vers `local_signal` / `signals` / `reasons`, puis retirer les alias
- Coordonnées Paris/Montreuil en dur dans `main.py` et `api.js`
- `langdetect` jamais réellement exercé (les mocks pré-remplissent `lang`)
- `db/seed.py` — mots de passe en clair, à supprimer avec la refonte auth

---

## 8. Les trois risques réels

**1. La vérité terrain n'est pas constituée.** C'est le risque numéro un, et il
n'est pas technique. Sans elle, il n'y a ni calibration, ni évaluation, ni
mémoire défendable — seulement une application qui produit des chiffres que
personne ne peut vérifier.

**2. Les restaurants authentiques n'ont pas de site web.** C'est le cœur du
problème et le scan y répond, mais l'app doit atteindre une masse de scans
suffisante pour être utile. Amorçage : scanner soi-même la zone d'évaluation.

**3. Le signal langue n'est pas durable** (§2). Le produit doit tenir sur le menu,
le prix et la zone. C'est déjà l'orientation prise — il faut s'y tenir.
