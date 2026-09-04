# Journal des décisions — Local Signal

Chaque décision structurante du projet, avec **le raisonnement qui y a mené**.
Objectif : pouvoir reprendre le projet dans 6 mois, ou le défendre devant un jury,
sans avoir à redécouvrir pourquoi telle chose a été faite.

**Format :** contexte → problème → décision → conséquences. Une entrée par décision.
Ne jamais supprimer une entrée : si une décision est annulée, ajouter une nouvelle
entrée qui la remplace et marquer l'ancienne comme `SUPERSÉDÉE`.

---

## D-001 — Le paradoxe de l'invisibilité devient la contrainte n°1

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le README énonce la thèse du projet : *« Le problème n'est pas le manque de
restaurants authentiques, c'est le manque de visibilité. »*

### Problème identifié
Le scoring initial notait un restaurant à 45 % sur des signaux dérivés de ses avis
(20 % langue + 25 % étoiles). Or `score_language` retournait `0` quand la liste
d'avis était vide, et `score_stars` retournait `0` sans note.

**Conséquence : un restaurant invisible — donc sans avis — finissait dernier du
classement. L'algorithme punissait exactement les restaurants que le projet
prétendait sauver.** Personne n'y avait pensé ; c'est apparu en relisant le README
en regard du code.

### Décision
Toute évolution du scoring est désormais soumise à ce test :

> *Ce critère fonctionne-t-il pour un restaurant qui a 0 avis et pas de site web ?*

Si non, il ne peut pas être un critère majeur.

### Conséquences
- Justifie l'orientation vers le **signal menu** (D-004) : c'est le seul signal
  disponible pour un restaurant totalement invisible.
- Impose le **lissage bayésien** du score de langue (D-003) : l'absence de preuve
  doit produire de l'*incertitude*, pas un score nul.
- Devient l'argument central du mémoire : la contribution n'est pas « un algorithme
  de recommandation de plus », c'est « un algorithme qui fonctionne malgré
  l'absence de données de popularité ».

---

## D-002 — Le critère géo-touristique est inversé

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
`score_geo_tourist` pesait 0.30 — le poids le plus élevé de la formule — et
attribuait **plus** de points aux restaurants **proches** d'un site touristique.

### Problème identifié
Contradiction frontale avec l'intention du produit : le critère le plus lourd
récompensait la proximité aux zones à forte densité d'attrape-touristes.

### Décision
Inverser le critère : la proximité à un site touristique majeur devient une
**pénalité**, pas une récompense.

### Justification (à reprendre telle quelle dans le mémoire)
Ce n'est pas une intuition, c'est un argument économique.

Un restaurant adossé à un monument joue un **jeu à un coup** : ses clients ne
reviendront jamais. Il n'a donc aucune incitation économique à la qualité — sa
réputation auprès d'un client donné n'a pas de valeur future.

Un restaurant de quartier vit de ses **habitués** : la relation est répétée, la
qualité devient sa condition de survie.

**L'authenticité corrèle avec le taux de retour des clients, et la distance aux
sites touristiques en est un proxy mesurable.**

### Conséquences
- Implémenté comme une **pénalité de zone** (rayon court autour des sites majeurs),
  pas comme une récompense linéaire à l'éloignement — sinon l'algorithme
  recommanderait des zones industrielles.
- Le rayon est un paramètre nommé dans `config.py`, marqué *à calibrer sur le jeu
  labellisé* (cf. D-006).

---

## D-003 — Score de langue continu, avec lissage bayésien

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
`score_language` était **binaire** : `1` si plus de 50 % des avis étaient dans la
langue cible, `0` sinon. Il pesait 20 % du score final.

### Problème identifié
Deux défauts distincts :

1. **Effet de seuil.** Un restaurant à 49 % d'avis locaux et un à 0 % obtenaient
   le même score. 20 % de la note basculait d'un coup sur une frontière arbitraire.
2. **Faux positifs sur faible volume.** Un restaurant avec 2 avis, tous deux en
   français, obtenait le score maximal — alors que c'est une preuve très faible.

### Décision
Passer à un ratio continu **lissé vers un a priori**, pondéré par le volume de preuves :

```
score_langue = (n_locaux + α × prior) / (n_total + α)     avec α ≈ 5
```

| Cas | Ancien score | Nouveau score |
|---|---|---|
| 2 avis / 2 locaux | 1.00 | 0.50 |
| 45 avis / 40 locaux | 1.00 | 0.86 |
| 0 avis | 0.00 | = prior (neutre) |

### Conséquences
- Répond directement à D-001 : un restaurant sans avis n'est plus **puni**,
  il est **incertain**.
- Produit gratuitement une **valeur de confiance** (le volume de preuves), qui
  permet d'afficher « score provisoire » plutôt que de simuler une précision
  qu'on n'a pas.
- Pour le mémoire : ouvre un développement sur la gestion de l'incertitude.

---

## D-004 — Le scan de carte comme signal principal et comme actif

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Recherche d'un apport IA qui ne soit pas décoratif.

### Décision
**L'utilisateur photographie la carte affichée en vitrine ; un modèle de vision
évalue l'authenticité du menu en quelques secondes.**

Signaux extraits de la carte, par ordre de force :
1. **Cohérence culinaire** — nombre de cuisines distinctes. Pizza + pâtes + burger
   + paëlla = piège. Un vrai restaurant fait une chose.
2. **Amplitude** — 12 plats = vraie cuisine ; 80 plats = congélateur.
3. **Spécificité lexicale** — noms vernaculaires conservés (« Ayam bakar kecap »)
   vs traduction générique (« Poulet grillé sauce soja »). Un menu qui garde ses
   termes d'origine s'adresse à des gens qui les connaissent.
4. **Nombre de langues** — carte en 4 langues avec photos des plats = signal
   touristique fort.
5. **Formules « menu touriste »** — « entrée + plat + dessert + vin, 19,90 € ».

### Pourquoi ce choix plutôt qu'un autre
Trois fonctions en un seul geste :
- **Produit** : répond à l'utilisateur à l'instant exact où il hésite, debout devant
  le restaurant.
- **Donnée** : les restaurants authentiques n'ont pas de site web — c'est *pour ça*
  qu'ils sont invisibles. On ne peut pas scraper ce qui n'existe pas. Les
  utilisateurs deviennent les collecteurs.
- **Recherche** : démontre qu'on peut scorer un restaurant **sans aucun avis**,
  ce qui est la réponse directe à D-001.

### Conséquences
- La base de menus structurés devient **l'actif du projet** (D-005).
- `menu_score` est implémenté dès maintenant sur données simulées, pour que la
  structure du moteur soit correcte avant l'arrivée du pipeline de scan.

---

## D-005 — Ne pas construire le produit sur Google Places

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le projet n'est pas qu'un mémoire : il est destiné à être poursuivi comme produit.
Le code initial contient des clients Google Places / Google Reviews, désactivés.

### Problème identifié
1. **Juridique.** Les CGU de Google Places interdisent le stockage durable de leurs
   données et la constitution d'une base concurrente. « Une base de données de tous
   les restaurants » alimentée par Google est une impasse pour un produit.
2. **Stratégique.** Google possède les avis et les notes ; ce terrain est perdu
   d'avance. En revanche **personne ne possède une base de menus structurés et
   labellisés en authenticité**.

### Décision
- Référentiel de lieux : **OpenStreetMap / Overpass** (libre, tags `cuisine=` déjà
  présents).
- Menus : **scan utilisateur** + sites officiels quand ils existent.
- Le code Google reste désactivé (`USE_MOCK_DATA = True`), utilisable au mieux pour
  s'amorcer, jamais comme socle.

### Conséquences
L'avantage concurrentiel du projet est la base de menus, et elle se construit par
l'usage. Toute décision produit qui l'enrichit est prioritaire.

---

## D-006 — Aucune pondération arbitraire

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Les poids initiaux (0.30 / 0.25 / 0.20 / 0.25) n'avaient aucune justification.

### Problème identifié
*« Pourquoi 0.30 ? »* est la première question d'un jury, et il n'y avait pas de
réponse. Sans vérité terrain, toute pondération est indéfendable et l'ensemble du
mémoire repose sur du sable.

### Décision
1. Toute constante numérique du scoring est un **paramètre nommé** dans `config.py`,
   accompagné d'un commentaire indiquant son statut (`à calibrer` / `dérivé des
   labels` / `justifié par …`).
2. Les poids définitifs seront **dérivés du jeu labellisé**, pas choisis à la main.
3. Évaluation obligatoire : `precision@10` sur le jeu labellisé, **comparée au top 10
   de Google par note**. L'écart mesuré est le résultat principal du mémoire.

### Conséquences
Bloque la finalisation du scoring tant que la vérité terrain n'existe pas.
Les valeurs actuelles sont explicitement provisoires.

---

## D-007 — Les étoiles sortent du scoring

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
`score_stars` pesait 25 % du score final.

### Problème identifié
Trois raisons cumulatives :
1. **Contradiction affichée.** Le README dit explicitement que l'objectif *n'est pas*
   de recommander les meilleurs restaurants selon les notes.
2. **Pouvoir discriminant nul.** Toutes les valeurs du jeu de données sont comprises
   entre 3.8 et 4.8 — le critère ajoute du bruit tassé, pas de l'information.
3. **Dépendance à la popularité.** Viole D-001.

### Décision
La note moyenne reste **affichée** comme information à l'utilisateur, mais
**ne participe plus au classement**.

---

## D-008 — Séparation stricte statique / dynamique

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
La formule initiale mélangeait dans une seule moyenne pondérée deux natures de
critères : des propriétés du restaurant (langue des avis, étoiles, position vs
sites touristiques) et une propriété de la requête (distance à l'utilisateur).

### Problème identifié
Mélanger les deux empêche de précalculer quoi que ce soit : tout doit être recalculé
à chaque requête, pour chaque restaurant. Ça ne tient pas à l'échelle d'une base
nationale, et ça n'a pas de sens conceptuellement — la distance à l'utilisateur ne
dit rien sur l'authenticité d'un restaurant.

### Décision
Deux scores distincts.

**Local Signal — statique, précalculé, stocké en base.** *Ce qu'est le restaurant :*
signal menu, signal avis, anomalie de prix, pénalité zone touristique.
Recalculé en batch (mensuel).

**Pertinence — dynamique, calculée à la requête.** *Ce qui convient à l'utilisateur
maintenant :* distance, ouverture, budget, cuisine, contraintes alimentaires.

Classement final = filtrage dur sur la pertinence, puis tri sur le Local Signal
pondéré par la distance.

### Conséquences
- L'app mobile ne fait qu'une requête géo + un filtre : elle reste instantanée même
  avec 50 000 restaurants.
- **Règle :** ne jamais recalculer un signal statique dans le chemin d'une requête
  utilisateur.

---

## D-009 — Le score n'est pas affiché par défaut

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
L'interface initiale (Streamlit et React) affiche « Score : 87.3/100 » et le détail
des sous-scores sur chaque carte de restaurant.

### Problème identifié
L'utilisateur cible est un voyageur qui a faim. Il veut une liste de restaurants,
pas un tableau de bord. Il n'est pas censé connaître l'algorithme — et un score
numérique brut demande une interprétation qu'il n'a pas.

### Décision
- **Par défaut : aucun score visible.**
- Derrière un « pourquoi ? » : une explication en **langage naturel**, générée.
  Ex. *« 92 % des avis sont en indonésien, la carte propose 11 plats tous
  indonésiens, prix 30 % sous la moyenne du quartier. »*

### Conséquences
- L'explicabilité n'est pas cosmétique : côté produit c'est ce qui crée la confiance,
  côté mémoire c'est un chapitre sur l'IA explicable (XAI).
- Quand la confiance est faible (D-003), afficher « score provisoire » plutôt qu'un
  chiffre net.

---

## D-010 — Expo / React Native pour le mobile

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le projet vise une interface web **et** une application mobile, dans le même dépôt.

### Décision
**Expo / React Native.**

### Justification
- Réutilise React et une partie de la logique JS déjà écrite pour le web.
- Un seul langage sur les deux plateformes — décisif pour un projet mené en solo.
- Build iOS + Android sans Mac.
- Accès caméra trivial, ce qui est déterminant : le scan de carte (D-004) est la
  fonctionnalité centrale.

### Alternatives écartées
- **Flutter** — bon rendu natif, mais impose Dart : deux langages et deux codebases
  à maintenir en plus du backend Python.
- **PWA** — le moins de travail, mais accès caméra limité, et rendu moins convaincant
  en soutenance.

---

## D-011 — Réorganisation en monorepo

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le dépôt était à plat : `app.py`, `config.py`, `scoring/`, `filters/`, `api/`,
`data/`, `db/`, `backend/`, `frontend/`, `assets/` tous au même niveau. Impossible
de savoir en un coup d'œil ce qui relève du backend, du web, ou de l'historique —
et aucune place pour l'application mobile.

### Décision
Trois espaces de premier niveau, plus la documentation :

```
backend/    tout le Python (main, config, core/, ingestion/, db/, data/, tests/)
apps/       web/ (React+Vite) et mobile/ (Expo)
docs/       DECISIONS.md, methodologie/, data/
legacy/     streamlit_app.py — première version, gelée
```

`core/` regroupe le métier (scoring, filtres), `ingestion/` les sources de données
(Google désactivé, à terme OSM et scan de menus).

### Changements induits
- **Imports** : absolus enracinés sur `backend`
  (`from backend.core.scoring.engine import ...`). Les deux hacks `sys.path` de
  `main.py` et `seed.py` sont supprimés. Tout se lance depuis la racine.
- **`DB_PATH`** devient un chemin absolu ancré sur la racine du dépôt : la base ne
  dépend plus du répertoire d'où la commande est lancée.
- **`.gitignore` créé.** `local_signal.db` et 18 fichiers `.pyc` étaient versionnés —
  sortis du suivi. Une base de dev versionnée génère des conflits systématiques et
  transportait 39 consultations et 3 réservations de test.
- **Bug d'images corrigé.** `getImageUrl` construisait
  `http://localhost:8000/static/...` alors que le backend ne monte aucun
  `StaticFiles` : **toutes les images du front React étaient cassées**. Les visuels
  sont désormais servis depuis `apps/web/public/`. Les chemins de `mock_data.py`
  passent de `assets/resto1.jpg` à `resto1.jpg`, chaque interface résolvant selon
  son contexte (Streamlit via `config.ASSETS_DIR`).

### Vérification
`python -m backend.tests.test_scoring` s'exécute, `backend.main:app` s'importe
avec ses 10 routes, `legacy/streamlit_app.py` et `backend/db/seed.py` compilent.

### Non fait volontairement
`packages/shared/` n'est pas créé : tant que `apps/mobile` n'existe pas, il n'y a
aucune duplication à factoriser. Créer l'abstraction avant le besoin coûterait de
la configuration de workspace pour rien.

---

## D-012 — Un signal indisponible voit son poids redistribué, il ne vaut pas zéro

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le Local Signal agrège quatre signaux (menu, langue, prix, zone touristique).
Certains ne sont pas toujours calculables : pas de carte scannée, pas assez de
restaurants comparables dans le voisinage pour établir une médiane de prix.

### Problème identifié
Le réflexe naturel — noter `0.0` un signal manquant — **reproduit exactement le
défaut que D-001 identifie**. Un restaurant peu documenté serait mécaniquement mal
noté, non pas parce qu'il est mauvais, mais parce qu'on ne sait rien de lui. Or les
restaurants sur lesquels on sait le moins sont précisément ceux que le projet veut
révéler.

### Décision
Un signal indisponible retourne `None`, et **son poids est redistribué
proportionnellement sur les signaux disponibles**.

```
local_signal = Σ(valeur × poids) / Σ(poids des signaux disponibles)
```

L'incertitude est portée par une valeur séparée, `confidence`, et **jamais par le
score lui-même**.

> Un restaurant sur lequel on a peu d'information est **INCERTAIN**, pas **MAUVAIS**.

### Conséquences
- `menu_score` et `price_score` retournent `{"score": None, "available": False}`
  plutôt que `0.0`.
- Le même principe s'applique à l'intérieur du signal menu : si `dish_count` est
  inconnu mais que les cuisines sont identifiées, la moyenne ne porte que sur les
  sous-signaux calculables.
- Le score de langue échappe à ce mécanisme : grâce au lissage bayésien (D-003) il
  est **toujours** calculable et retombe sur l'a priori en l'absence d'avis.
- L'interface affiche « score provisoire » quand `confidence` est faible (D-009).

### Vérification
Test d'invariant : un restaurant sans avis obtient un Local Signal **supérieur** à
un restaurant dont les 20 avis sont tous en langue étrangère, tout en ayant une
**confiance inférieure**. C'est la traduction opérationnelle de D-001.

---

## D-013 — Refonte du moteur de scoring (mise en œuvre de D-001 à D-012)

**Date :** 2026-08-13 · **Statut :** actif

### Ce qui a été implémenté

| Module | Changement |
|---|---|
| `geo_score.py` | `score_geo_tourist` → `score_tourist_zone`, **inversé** en pénalité de zone (D-002) |
| `language_score.py` | binaire → **continu avec lissage bayésien**, + `language_confidence` (D-003) |
| `menu_score.py` | **nouveau** — cohérence culinaire, amplitude, spécificité lexicale, langues (D-004) |
| `price_score.py` | **nouveau** — anomalie vs médiane du voisinage à cuisine comparable |
| `stars_score.py` | conservé mais **sorti du classement** (D-007) |
| `engine.py` | scindé en `compute_local_signal` (statique) / `compute_relevance` (dynamique) + `explain` (D-008, D-009) |
| `config.py` | pondérations remplacées, chaque constante porte son statut de calibration (D-006) |

### Effet mesuré sur le jeu mocké

Utilisateur positionné à Montreuil, mêmes 10 restaurants.

**Avant** — classement piloté par la proximité aux monuments :
```
1. L'Indonésie 70.9     2. Maison Montreau 70.4     3. Le Grand Angle 70.0
```

**Après** — Le Grand Angle (42 plats, 3 cuisines, carte en 4 langues, formule
« menu touriste ») passe de la 3ᵉ à la **dernière** place :
```
1. Délice de Montreuil 89.6     9. Le Grand Angle 53.6     10. Peppe Pizzeria 51.7
```

Cas intéressant : **L'Indonésie reste 4ᵉ malgré un score de zone touristique de
0.07** (elle jouxte le Théâtre de la Girandole). Son excellente carte compense la
pénalité de zone. C'est le comportement recherché — la proximité d'un monument est
un indice, pas une condamnation.

### Compatibilité
`score_all_restaurants` reste exposé comme alias de `rank_restaurants`, et le dict
`scoring` conserve les clés `score_geo_tourist`, `score_geo_user`, `score_language`,
`score_stars` pour ne pas casser les interfaces existantes. **À retirer** une fois
les fronts migrés vers `local_signal` / `signals` / `reasons`.

### Rappel
Les pondérations restent **provisoires** (D-006). Elles seront dérivées du jeu
labellisé selon `docs/methodologie/evaluation.md`. Aucun chiffre de cette entrée ne
doit être présenté comme un résultat validé.

---

## D-014 — Le modèle observe, il ne juge pas

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Mise en œuvre du scan de carte (D-004). Deux conceptions possibles : demander au
LLM une note d'authenticité, ou lui demander des observations factuelles et
calculer la note nous-mêmes.

### Problème identifié
Un LLM à qui l'on demande directement « ce restaurant est-il authentique ? »
produit un chiffre :
- **non reproductible** — deux appels sur la même image peuvent diverger ;
- **inexplicable** — impossible de justifier pourquoi 72 et pas 65 ;
- **incalibrable** — on ne peut pas l'ajuster sur un jeu labellisé sans réécrire
  le prompt et relancer toute l'inférence.

En soutenance, la question « comment savez-vous que ce 72 est juste ? » n'aurait
pas de réponse.

### Décision
Le prompt demande **uniquement des observations vérifiables** : nombre de plats,
cuisines identifiées, langues de rédaction, part de noms vernaculaires, présence
d'une formule touristique, présence de photos de plats.

Le score est ensuite calculé par `menu_score.py`, du code déterministe.

### Conséquences
- **Reproductible** — mêmes observations, même score, toujours.
- **Auditable** — chaque point s'explique (D-009).
- **Calibrable** — les seuils s'ajustent sur le jeu labellisé (D-006) sans
  toucher au prompt ni relancer d'appel facturé.
- Le prompt système fait partie de la méthode : toute modification doit être
  consignée ici, au même titre qu'une pondération.
- Nouveau signal capté au passage : `has_dish_photos`. Une carte illustrée
  s'adresse à un client qui ne sait pas lire les intitulés — donc pas au quartier.

### Implémentation
`backend/ingestion/menu_scan/` — `schema.py` (contrat Pydantic),
`client.py` (appel vision), endpoint `POST /api/menu/scan`.
Modèle : `claude-opus-5`, sortie structurée validée par schéma.
Une photo illisible retourne `None`, jamais `0.0` (D-012).

---

## D-015 — Suppression de l'interface Streamlit

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
`legacy/streamlit_app.py` (456 lignes) était la première version de l'interface.

### Décision
Supprimée. Le projet ne portera que **deux interfaces** : web (React) et mobile
(Expo). `streamlit` et `pandas` sortent de `requirements.txt`.

### Justification
Une troisième interface à maintenir sans utilisateur, qui dupliquait la logique
d'affichage et consommait directement le moteur au lieu de passer par l'API.
Elle affichait par ailleurs les scores en clair sur chaque carte, ce qui
contredit D-009. Le code reste récupérable dans l'historique Git.

---

## D-016 — Secrets par variable d'environnement uniquement

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
`backend/config.py` contenait `GOOGLE_API_KEY = ""` en dur, et le fichier est
versionné. L'ajout du scan de carte introduit une seconde clé, facturée à l'usage.

### Problème identifié
Le premier réflexe au moment de faire marcher une intégration est de coller la
clé dans le fichier de configuration. Ici, ça la publie sur GitHub — et une clé
d'API facturée à l'usage qui fuite est exploitée en quelques heures.

### Décision
`ANTHROPIC_API_KEY` et `GOOGLE_API_KEY` sont lues **exclusivement** via
`os.environ.get()`. Aucune valeur par défaut, aucun secret dans le dépôt.
`.env` est ignoré par Git (D-011).

En l'absence de clé, `analyze_menu_image` lève une `RuntimeError` explicite, que
l'API traduit en HTTP 503 — une erreur de déploiement, pas de requête.

---

## D-017 — Fournisseur de vision interchangeable, Groq par défaut

**Date :** 2026-08-13 · **Statut :** actif · **Supersède partiellement** D-014 (choix du modèle)

### Contexte
Le scan de carte était implémenté directement sur l'API Anthropic. Coût mesuré :
≈ 3,6 centimes par scan (≈ 5,40 € pour les 150 cartes du jeu labellisé, ≈ 36 €
pour 1 000 scans mensuels).

### Décision
**Groq par défaut** (`meta-llama/llama-4-scout-17b-16e-instruct`), Claude conservé
comme alternative, derrière une interface commune (`providers/base.py`).

### Justification
Le coût n'est pas l'argument déterminant — à l'échelle du projet, l'écart se
compte en euros. Deux raisons réelles :

1. **Latence.** L'utilisateur est debout devant le restaurant, il attend une
   réponse. C'est un critère produit, pas une optimisation.
2. **Indépendance fournisseur.** Un produit destiné à durer ne doit pas être
   couplé à une seule API de vision.

**Pourquoi une abstraction plutôt qu'une substitution :** la vraie question
n'est pas le prix mais *un modèle plus léger lit-il correctement une carte
photographiée de travers, avec des reflets, parfois manuscrite ?* C'est une
question empirique. Garder les deux fournisseurs derrière une interface permet de
la trancher sur le jeu labellisé — et **le comparatif de précision d'extraction
devient un résultat du mémoire**, pour un coût de mesure d'environ 5 €.

### Conséquences
- `VISION_PROVIDER` (variable d'environnement) choisit le défaut ; le paramètre
  `?provider=` de `POST /api/menu/scan` force un fournisseur pour le comparatif.
- Groq ne supporte pas de message `system` séparé sur ses modèles vision : les
  instructions et le schéma JSON attendu vont dans le tour utilisateur.
- Groq ne garantit pas la conformité au schéma comme le fait la sortie structurée
  d'Anthropic. La validation Pydantic est donc **obligatoire côté Python** : une
  réponse hors schéma dégrade en `readable=False` plutôt que de lever (D-012).
- `temperature=0.0` sur Groq : il s'agit d'extraction factuelle, la variabilité
  n'a aucune valeur ici et nuirait à la reproductibilité (D-014).

### Vérification
Clé absente → `RuntimeError` explicite (HTTP 503). Fournisseur inconnu →
`ValueError`. Réponse JSON hors schéma → `readable=False`, signal `None`,
poids redistribué. Aucun de ces cas ne fait planter l'API.

---

## D-018 — Supabase pour la base, l'authentification et le stockage

**Date :** 2026-08-13 · **Statut :** actif (à mettre en œuvre en phase 4)

### Contexte
Trois besoins arrivaient séparément : PostgreSQL + PostGIS pour les requêtes
géographiques, une authentification pour les réservations, un stockage pour les
photos de cartes scannées.

### Décision
**Supabase**, qui couvre les trois.

### Justification
Une solution d'authentification seule (Clerk, Auth0) laisserait à installer un
Postgres et un stockage de fichiers à côté. Supabase fournit :

| Besoin | Apport |
|---|---|
| Base | PostgreSQL managé, extension PostGIS disponible |
| Auth | Email, OAuth Google/Apple, SDK Expo officiel |
| Stockage | Buckets pour les photos de cartes |

**On n'écrit pas son propre système d'authentification.** Hachage, réinitialisation
de mot de passe, vérification d'email, sessions, rotation de tokens : chacun est
une faille potentielle et aucun n'apporte quoi que ce soit au mémoire.

### Conséquences
- `db/seed.py` stocke des mots de passe en clair (`"hash_alice"`) — à supprimer
  lors de la migration, pas à corriger.
- L'authentification n'est **pas bloquante** pour une démo : recherche,
  consultation et scan restent anonymes. Elle ne devient nécessaire que pour les
  réservations et l'attribution des scans à leurs contributeurs.
- Mise en œuvre en phase 4. Tant que le projet tourne en local sur données
  mockées, l'installer serait de la complexité prématurée.

---

## D-019 — Le signal « langue des avis » n'est pas durable

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Question posée : peut-on récupérer davantage d'avis via Google ?

### Constat
**Non.** L'API Google Places plafonne à **5 avis par lieu**, quel que soit le
niveau de facturation — c'est une limite produit, pas un quota. Scraper Google
Maps violerait les CGU et exposerait juridiquement le projet dès qu'il devient un
produit (cf. D-005).

### Conséquences
- Le score de langue (D-003) repose sur un échantillon minuscule. Le lissage
  bayésien le reflète honnêtement, mais ne crée pas d'information absente.
- **Pour le mémoire :** relever le ratio de langue à la main sur les ~150
  restaurants du jeu labellisé. Lire des pages publiques et en tirer une
  statistique agrégée, sans redistribuer le contenu, est un usage académique
  légitime. Quelques heures de travail.
- **Pour le produit :** le signal langue ne peut pas être un pilier. Les signaux
  durables sont **menu, anomalie de prix, zone touristique** — tous calculables
  sans aucun avis. C'est déjà la pondération en place (D-013), et c'est une
  raison de fond supplémentaire de la conserver.
- À terme, la seule source d'avis propre serait celle du projet lui-même
  (tables `reviews` déjà présentes). Problème d'amorçage classique, hors périmètre
  du mémoire.

---

## D-020 — Données réelles : OSM remplace les mocks

**Date :** 2026-08-13 · **Statut :** actif

### Décision
Import du Quartier latin depuis OpenStreetMap via Overpass :
**468 restaurants réels** avec nom, coordonnées, cuisine, adresse, site web,
horaires — plus **47 sites touristiques** de la même zone.

Le schéma SQLite est refait pour porter trois natures d'information distinctes :
faits OSM (réimportables), Local Signal (recalculable en batch), vérité terrain
(produite par recherche documentaire).

**Règle d'import :** `ON CONFLICT DO UPDATE` ne met à jour que les faits OSM.
Les colonnes `label`, `label_sources` et `human_validated` en sont volontairement
absentes — un réimport ne doit jamais effacer un travail de labellisation.

### Conséquence immédiate : deux constats de calibration

**1. La pénalité de zone touristique ne discrimine plus rien ici.**
Sur 468 restaurants, **aucun** n'est hors zone touristique (`tourist_zone = 1.0`).
Valeurs observées : min 0.00, médiane 0.20, max 0.55.

Explication : le Quartier latin compte 47 monuments sur ~1,5 km². Avec un rayon
de 500 m (`TOURIST_ZONE_RADIUS`), *tout* est dans la zone d'au moins un site. Le
critère ne sépare plus deux classes, il produit un dégradé continu de « plus ou
moins central ».

C'est un vrai résultat de calibration, pas un bug. Deux pistes, à trancher sur le
jeu labellisé (D-006) :
- réduire fortement le rayon en zone dense ;
- remplacer « distance au site le plus proche » par une mesure de **densité de
  monuments** dans un rayon donné — plus fidèle à l'intuition d'origine (D-002).

**2. Deux signaux sur quatre sont indisponibles.**
`menu` (aucune carte scannée) et `price` (OSM ne porte pas le prix de façon
fiable) sont absents ; `language` retombe sur son a priori faute d'avis. La
redistribution des poids (D-012) fonctionne comme prévu — mais **le classement
actuel repose de fait sur un seul signal**.

> **Les scores en base ne sont pas encore interprétables.** Ils prouvent que le
> pipeline tourne de bout en bout sur des données réelles, rien de plus. Ne pas
> les présenter comme un résultat.

### Ce qui débloque la suite
Le signal menu est le plus lourd (0.40) et le seul disponible sans avis. Le
remplir sur la zone d'évaluation est donc prioritaire — c'est ce qui rendra les
scores discriminants.

---

## D-021 — Amorçage des menus par l'API Google Places Photos

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Google Maps héberge des milliers de photos de cartes postées par les clients.
La question posée : peut-on s'en servir pour amorcer le signal menu, plutôt
qu'attendre que des utilisateurs scannent ?

### Ce qui a été écarté
**Le scraping automatisé de Google Maps.** Trois raisons, dans l'ordre
d'importance :

1. Il suppose de contourner la détection de robots — Google la fait évoluer en
   permanence, donc le système casserait sans prévenir.
2. Une base construite dessus n'est ni publiable, ni finançable, ni défendable
   pour un projet qui continue après le mémoire.
3. Les photos appartiennent à leurs auteurs.

### Décision
Utiliser l'**API Place Photos** (Places API New), qui expose officiellement les
mêmes photos. Payante et limitée, mais sanctionnée et stable.

**Pipeline en deux temps, pour une raison de coût :**

| Étape | Ce qui tourne | Pourquoi |
|---|---|---|
| **Tri** | un appel court par photo : « est-ce une carte ? » → OUI/NON | ~2 s pour rejeter une photo de plat |
| **Extraction** | l'analyse complète, sur la seule photo retenue | ~6 s, une fois par restaurant |

Sans ce tri, il faudrait lancer l'extraction complète sur chaque photo de chaque
restaurant : dix fois le coût et le temps pour le même résultat.

**Ce qui est stocké :** uniquement les observations dérivées (nombre de plats,
cuisines, langues, ratio vernaculaire). **Jamais les photos** — elles sont
analysées en mémoire puis jetées.

### Limite assumée, à écrire dans le mémoire
Les restaurants très photographiés sont les plus fréquentés, donc plutôt les
touristiques. Cette source amorce mieux la classe « piège » que la classe
« local » — un biais qu'il faut mesurer, pas ignorer.

C'est précisément ce que le scan utilisateur corrige : il atteint les
restaurants que personne ne photographie. Formulation défendable :
*« le signal menu est amorcé via l'API sur la zone d'évaluation ; en production
il est alimenté par les scans utilisateurs, qui couvrent les établissements
absents des plateformes. »*

### Implémentation
`backend/ingestion/google/places_photos.py` (recherche `place_id`, liste et
téléchargement des photos) et `backend/ingestion/menu_scan/harvest.py`
(orchestration tri → extraction → base). Nécessite `GOOGLE_API_KEY` avec
« Places API (New) » activée **et la facturation configurée** — l'endpoint
Photos est facturé.

---

## D-022 — Jetons de design partagés entre le web et le mobile

**Date :** 2026-08-13 · **Statut :** actif

### Contexte
Le front web et l'app mobile définissaient chacun leurs couleurs. Mesure faite
avant correction : `#c1121f`, `#fffbf3` et `#6f6961` étaient écrits en dur des
deux côtés, indépendamment, et le web portait en plus trois couleurs que le
mobile ignorait.

### Problème identifié
Cette divergence n'est pas hypothétique, elle est **mécanique** : deux fichiers
sans lien évoluent séparément. Chaque retouche d'un côté creuse l'écart, et
personne ne s'en aperçoit avant de comparer les deux écrans côte à côte.

### Décision
`packages/shared/tokens.js` devient la **source unique** : couleurs, espacements,
rayons, typographie, ombres.

- Le **mobile** l'importe directement — `theme.js` ne fait plus que réexporter.
- Le **web** consomme `tokens.css`, généré par `node packages/shared/build-css.js`.

`tokens.css` est généré et ne doit jamais être édité à la main.

C'est la création de `packages/shared` que CLAUDE.md §7 différait « jusqu'à ce
que la duplication devienne réelle ». Elle l'est devenue.

### Sur les références visuelles
Les conventions retenues — carte photo dominante, filtres en pastilles, bouton
de réservation proéminent — sont celles du secteur de la réservation de
restaurant. Ce sont des **conventions d'usage**, pas l'identité d'un acteur
particulier. La palette reste celle du projet (rouge profond, crème).

Copier la direction artistique d'un concurrent serait juridiquement discutable
et stratégiquement absurde : l'objectif est de construire une marque.

### Conséquences
- **Aucune couleur ni espacement en dur** dans `apps/web` ou `apps/mobile`.
- Modifier une valeur : `tokens.js`, puis relancer `build-css.js`.
- 12 valeurs hexadécimales du web remplacées par des variables ; il en reste 19,
  spécifiques à des composants, à tokeniser au fil des retouches.

---

## D-023 — Récolte des cartes sur le web, en complément de D-021

**Date :** 2026-08-21 · **Statut :** actif

### Contexte
Le signal menu pèse le plus lourd du Local Signal (0,40) parce qu'il est le seul
calculable sans avis (D-001, D-004). Or à ce jour **aucune carte n'est en base** :
la table `menus` est vide, et les 736 restaurants importés ont tous une confiance
de 0,15 et des scores massivement ex æquo. Le moteur fonctionne, mais il n'a
qu'un signal discriminant sur quatre — la pénalité de zone touristique.

La question posée : peut-on amorcer ce signal sans attendre les scans
utilisateurs, et sans le coût de l'API Google Places Photos (D-021) ?

### Ce qui a été vérifié avant de décider

**L'API Google Places n'expose aucun champ menu.** La référence des champs
(`developers.google.com/maps/documentation/places/web-service/data-fields`)
liste plus de cent champs sur quatre paliers tarifaires, jusqu'aux attributs
« sert du vin » ou « options végétariennes ». Aucun ne concerne la carte.

La rubrique « Menu » visible dans l'application Google Maps est construite par
Google à partir de robots d'indexation et de partenaires de données. Elle n'est
pas exposée par l'API, et les restaurateurs eux-mêmes ne peuvent pas l'éditer.

L'API `FoodMenus` existe, mais dans **Google Business Profile** : elle exige
d'être propriétaire ou gestionnaire de la fiche. Inapplicable à des
établissements tiers.

**Conclusion :** la seule source de carte accessible sans coût et sans clé est
le site du restaurant lui-même — c'est-à-dire exactement là où Google va
chercher la sienne.

### Décision
Ajouter une voie de récolte web, `backend/ingestion/web/`, en **complément** de
D-021 et non en remplacement.

| Étape | Ce qui tourne | Coût |
|---|---|---|
| **Résolution** | tag OSM `website:menu`, sinon lien « carte » sur la page d'accueil | nul |
| **Récupération** | texte de la page HTML ou du PDF | nul |
| **Filtre** | détection de prix — une page sans prix ne contient pas de plats | nul |
| **Extraction** | observations factuelles par le modèle, sur du texte | ~1 appel |
| **Score** | `menu_score.py`, inchangé | nul |

Le tag `website:menu` est désormais capturé à l'ingestion OSM (colonne
`restaurants.menu_url`).

**Le modèle reçoit du texte, pas une image.** Une carte publiée sur le web est
déjà textuelle ; la faire transiter par un modèle de vision coûterait davantage
et perdrait de l'information. Même schéma de sortie (`MenuAnalysis`), même
principe : le modèle observe, il ne juge pas (D-014).

**`--dry-run` mesure la couverture sans consommer un seul appel.** À lancer en
premier, systématiquement.

### Résultats mesurés — Quartier latin, 468 restaurants

| | |
|---|---|
| Avec un site web ou un tag menu | 155 (33 %) |
| Sans lien de carte identifiable | 78 |
| Récupération en échec (404, 403, PDF scanné) | 12 |
| Page récupérée mais **sans aucun prix** | 36 |
| **Cartes réellement exploitables** | **29 (6,2 % de la zone)** |

Les 9 tags `website:menu` de la zone se sont révélés décevants : trois pointent
vers des URL mortes (404), un vers un site protégé (403), un vers un PDF scanné
sans couche texte. Le crawl du site officiel produit davantage.

### Le résultat négatif, qui est le plus utile
**36 pages sur 65 récupérées ne contiennent pas la liste des plats.** Les sites
de restaurants modernes affichent leur carte en JavaScript, la déportent dans un
PDF derrière un second clic, ou se contentent de la décrire en prose. Deux cas
observés : une page « cartes » remplie de `Lorem ipsum`, une page « menu » qui
présente la cuisine du chef et renvoie vers « Voir la carte ».

C'est la raison du filtre par détection de prix : sans lui, chacune de ces pages
coûtait un appel au modèle pour s'entendre répondre « ce n'est pas une carte ».

**Ce résultat vaut mieux qu'une affirmation.** Il démontre empiriquement ce que
D-004 posait comme hypothèse : la carte d'un restaurant n'est pas récupérable à
distance de façon fiable. Le scan en vitrine n'est pas une commodité de produit,
c'est la seule voie d'accès à la donnée. Formulation défendable :
*« la récolte web couvre 6 % de la zone d'évaluation ; 55 % des pages de carte
atteintes ne contiennent pas la liste des plats. »*

### Le biais, identique à celui de D-021
Cette voie ne trouve que des restaurants ayant une présence web. Or l'absence de
site est précisément ce qui rend invisibles les établissements que le projet
cherche à révéler (D-001). Elle amorce donc mieux la classe « piège » que la
classe « local » — **exactement le même biais que D-021**, par un autre chemin.

La provenance est enregistrée (`menus.provider` vaut `web-osm` ou `web-crawl`,
`menus.source_url` porte l'URL) afin que l'écart de score entre voies soit
mesurable et rapportable. Un biais mesuré est un résultat ; un biais ignoré est
une faute de méthode.

### Pourquoi D-021 n'est pas supersédée
Les deux voies ont des biais **complémentaires**, pas identiques : D-021 atteint
les restaurants très photographiés, D-023 les restaurants ayant un site. Aucune
des deux n'atteint le restaurant de quartier invisible — seul le scan
utilisateur y parvient (D-004).

D-021 n'a par ailleurs **jamais été exécutée** : elle attendait une clé Google.
La déclarer supersédée sur la foi d'un résultat qu'on n'a pas mesuré serait
prématuré. Les deux voies restent disponibles ; leur comparaison sur le jeu
labellisé est un résultat à produire.

### Conséquences
- Nouveau module `backend/ingestion/web/` — `menu_finder`, `fetcher`, `harvest_web`
- Nouveau `backend/ingestion/menu_scan/text_client.py` et `providers/text.py`,
  pendants textuels de `client.py` et des providers de vision
- Colonnes ajoutées : `restaurants.menu_url`, `menus.source_url`
- `db/models.py` porte désormais une migration : `CREATE TABLE IF NOT EXISTS`
  ne modifie pas une table existante, une base antérieure resterait incomplète
- Dépendances : `beautifulsoup4`, `pypdf`
- `GROQ_TEXT_MODEL` par défaut identique au modèle de vision, pour ne pas
  ajouter une variable à isoler lors de la calibration (D-006)

### Contrainte d'exploitation à connaître
Le tier gratuit Groq plafonne à **8 000 tokens par minute**, et le quota compte
l'entrée **plus le budget de sortie réservé**, pas consommé. D'où deux réglages
non négociables sur ce tier : `--workers 2` au maximum, et un budget de sortie
de 4 500 tokens. Au-delà, les appels sont rejetés en 413 avant même de tourner.

### Effet mesuré sur le classement — et l'alerte qui en découle

Après récolte de 25 cartes sur les 468 restaurants du Quartier latin :

| | Avec carte (25) | Sans carte (443) |
|---|---|---|
| Confiance | 0,55 | 0,15 |
| Local Signal moyen | **60,8** | **40,7** |

**Les 12 premiers du classement sont les 12 restaurants qui ont une carte.**
Sans exception. Le signal menu pesant 0,40 et les cartes récoltées obtenant un
score moyen de 0,83, tout restaurant qui en possède une devance mécaniquement
tous ceux dont le poids est redistribué (D-012).

Or les restaurants qui ont une carte en ligne sont **ceux qui ont un site web**.
La récolte web, appliquée telle quelle au classement, **inverse donc l'intention
du produit** : elle propulse en tête les établissements web-visibles, c'est-à-dire
exactement ceux que D-001 cherche à ne pas privilégier.

Ce n'est pas un défaut d'implémentation, c'est la conséquence arithmétique de la
redistribution de poids quand la disponibilité du signal est **corrélée à la
variable mesurée**. D-012 protège du faux zéro, il ne protège pas de ce biais-là.

**Conséquences à traiter avant toute mise en avant du classement :**

1. Ne jamais comparer deux Local Signal de confiances différentes sans en tenir
   compte. 60,8 à confiance 0,55 et 40,7 à confiance 0,15 ne sont pas
   commensurables.
2. La confiance doit peser dans le classement affiché, ou être montrée à
   l'utilisateur — elle ne peut pas rester une colonne interne.
3. La calibration sur le jeu labellisé (D-006) doit être menée **séparément par
   régime de disponibilité**, sinon elle apprendra ce biais au lieu de le corriger.

C'est la démonstration chiffrée que l'amorçage ne remplace pas le scan
utilisateur (D-004) : tant que la couverture menu est corrélée à la visibilité
web, elle dégrade le classement au lieu de l'améliorer.

---

## D-024 — Langue de la carte : véhiculaire, pas « étrangère »

**Date :** 2026-08-21 · **Statut :** actif

### Contexte
`score_languages` ne comptait que le **nombre** de langues d'une carte, jamais
lesquelles. Une carte en une seule langue obtenait 1,0, quelle que soit cette
langue.

### Problème identifié
Constaté sur les données réelles récoltées par D-023 : *Indonesia* et *Bian Bian
Nouilles*, dont les cartes sont rédigées **uniquement en anglais**, obtenaient le
score de langue maximal — au même titre qu'un bistrot francophone.

Or au Quartier latin, une carte exclusivement en anglais est l'un des signaux
d'attrape-touristes les plus forts qui soient. Elle ne s'adresse ni au quartier,
ni à une communauté : elle s'adresse au passage international.

`config.TARGET_LANGUAGE = "fr"` existait déjà, mais n'était consommé que par le
score des **avis** (`language_score.py`). Le score de la carte l'ignorait.

### Le piège écarté
La correction naïve — pénaliser toute carte sans français — **retournerait le
produit contre son objectif**.

Une carte rédigée uniquement en chinois, en vietnamien ou en arabe s'adresse à
une clientèle de diaspora installée. C'est un signal **local fort**, exactement
le type d'établissement que D-001 cherche à révéler. La pénaliser reviendrait à
écarter mécaniquement les restaurants communautaires, qui comptent parmi les
plus authentiques d'un quartier.

Le critère n'est donc pas « absence de la langue locale », mais **substitution de
la langue locale par une langue véhiculaire**.

### Décision
Introduire la notion de langue véhiculaire — celle qu'on emploie pour être
compris d'un étranger de passage, et non d'une communauté installée.

```
LINGUA_FRANCA_LANGUAGES = {"en"}   # à étendre selon la zone d'étude
LINGUA_FRANCA_PENALTY   = 0.5      # à calibrer (D-006)
```

La pénalité s'applique **uniquement** si la langue locale est absente **et**
qu'une langue véhiculaire est présente. Quand les deux coexistent (`['fr','en']`),
le nombre de langues joue déjà son rôle : pénaliser en plus compterait deux fois
le même fait.

Les codes sont normalisés (casse, codes à 3 lettres) avant comparaison — le
modèle ne renvoie pas toujours des ISO 639-1 stricts.

### Comportement obtenu

| Carte | Score langue | Lecture |
|---|---|---|
| `['fr']` | 1,00 | bistrot de quartier |
| `['zh']` | 1,00 | restaurant de diaspora — **non pénalisé** |
| `['en']` | 0,50 | s'adresse au passage international |
| `['fr','en']` | 0,75 | pénalisé par le nombre seulement |
| `['en','zh']` | 0,375 | diaspora + véhiculaire |
| `['en','es','it']` | 0,25 | ciblage touristique assumé |
| `[]` | `None` | indisponible, pas 0,0 (D-012) |

### Effet mesuré
*Indonesia* — carte indonésienne cohérente, 21 plats, entièrement vernaculaire,
mais rédigée en anglais seul — passe de la **4ᵉ à la 9ᵉ place** du Quartier latin
(68,85 → 65,32).

Le reste de son score demeure élevé, et c'est voulu : la carte reste cohérente et
resserrée. Seul le fait qu'elle s'adresse à l'anglophone de passage est désormais
compté.

### Conséquences
- `LINGUA_FRANCA_LANGUAGES` est **dépendant de la zone**. À Barcelone, l'espagnol
  serait local et le catalan vernaculaire ; à Bruxelles, la question se pose pour
  deux langues locales. Le jour où une zone hors de France est ajoutée, cette
  constante doit devenir un paramètre de zone, pas une globale.
- 6 invariants ajoutés à `backend/tests/test_scoring.py`, dont celui qui protège
  explicitement le cas diaspora — c'est la régression la plus coûteuse possible
  pour ce projet, elle doit rester gardée par un test.
- `menu_score.py` importe désormais `config`, comme les quatre autres scorers.
- La colonne `menus.menu_score` devient un instantané daté : le score effectif
  est recalculé depuis `observations_json` à chaque batch. C'est la propriété
  recherchée par D-014 — recalibrer sans relancer une seule inférence.

---

## D-025 — Photos de restaurants par l'API Google Places

**Date :** 2026-08-21 · **Statut :** actif · **Régime de démonstration assumé**

### Contexte
Les fiches et les vignettes s'affichaient sans image, ou pire : la fiche détail
tirait un visuel au hasard parmi cinq (`/resto1..5.jpg`) selon l'identifiant du
restaurant. Montrer la photo d'un autre établissement est indéfendable dans un
projet dont le sujet est précisément l'authenticité.

### Ce qui a été mesuré avant de décider
**OpenStreetMap ne porte aucune photo.** Sur les 468 restaurants du Quartier
latin, interrogation d'Overpass :

| Tag | Nombre |
|---|---|
| `image` | 0 |
| `wikimedia_commons` | 0 |
| `photo` | 0 |
| `wikidata` | 9 |

La voie libre est donc fermée. Restent l'API Google Places, ou rien.

### Décision
Utiliser **Place Photos** (Places API New), et n'afficher **que la première
photo** de la fiche.

**Pipeline en deux temps, pour une raison de quota :**

| Étape | Quand | Coût |
|---|---|---|
| **Résolution** — `place_id` puis nom de ressource de la 1re photo | une fois par restaurant, script dédié | 2 appels |
| **Affichage** — téléchargement de l'image | à l'affichage | 1 appel |

Résoudre à l'affichage aurait signifié 2 × 50 appels par page de résultats : le
quota gratuit mensuel serait consommé en une vingtaine de recherches. Le
`place_id` et le nom de ressource sont des **identifiants**, pas du contenu :
les conserver en base ne pose aucune difficulté.

`backend/ingestion/google/seed_photos.py` saute d'office les restaurants déjà
résolus — une relance ne re-facture rien.

### Coût réel
Chaque SKU offre **1 000 requêtes par mois** (Text Search, Place Details, Place
Photos). Une zone de moins de 500 restaurants tient donc intégralement dans le
quota gratuit, résolution comprise.

### Le point qui doit rester explicite

**Les CGU Google interdisent la mise en cache durable des photos, et
celles-ci appartiennent à leurs auteurs (D-021).**

Le projet fonctionne néanmoins en régime « cache local » : les images sont
téléchargées une fois et servies depuis le disque. C'est un choix **de
démonstration**, pris en connaissance de cause, pour que l'application reste
fluide sans consommer un appel par vignette.

Les garde-fous qui maintiennent ce choix réversible :

- `config.PHOTO_CACHE_ENABLED` — **un seul réglage** sépare les deux régimes.
  À `false`, chaque affichage relaie l'image sans jamais l'écrire ; aucun autre
  fichier ne change. C'est la condition pour que la mise en conformité reste une
  décision d'une ligne, et non une réécriture.
- Le dossier `.photo-cache/` est **hors du dépôt et gitignoré** — la copie reste
  un fichier de travail local, jamais une redistribution.
- `photo_cache.purge()` vide le cache en une commande, pour que le retour à la
  conformité ne dépende pas d'une opération manuelle qu'on oublie.
- L'en-tête `X-Photo-Source: Google Places` accompagne chaque réponse.

**À faire avant toute mise en ligne :** repasser `PHOTO_CACHE_ENABLED` à `false`,
purger le cache, et afficher l'attribution de l'auteur dans l'interface —
l'en-tête HTTP ne s'y substitue pas.

### Conséquences
- Colonnes ajoutées : `restaurants.google_place_id`, `restaurants.photo_ref`
- Nouveau `backend/ingestion/google/photo_cache.py` — seul module au courant du
  régime en vigueur ; ses appelants l'ignorent
- Nouveau `backend/ingestion/google/seed_photos.py` — `--dry-run` chiffre le
  coût sans consommer un appel
- Nouvel endpoint `GET /api/restaurant/{id}/photo`
- **404 en l'absence de photo est un cas normal**, pas une anomalie : les
  interfaces basculent sur leur visuel de repli via `onError`, ce qui évite une
  requête de vérification par vignette
- Le tirage aléatoire `/resto1..5.jpg` de la fiche détail est supprimé

---

## D-026 — Textes partagés, recherche sur mobile, points de départ explicites

**Date :** 2026-08-21 · **Statut :** actif

### Contexte
Trois défauts constatés en utilisant réellement les interfaces.

**1. Les textes ne disaient rien du projet.** L'accueil web annonçait
« Trouvez la table parfaite, n'importe où » et « des recommandations
personnalisées selon votre profil » — le discours exact de n'importe quelle
plateforme de réservation, c'est-à-dire précisément celui contre lequel le
projet se construit. Rien n'y évoquait l'invisibilité des restaurants de
quartier, ni le refus de classer par popularité.

**2. Le mobile n'avait aucune recherche.** Un seul mode d'accès, « autour de
moi », entièrement dépendant du GPS. Un utilisateur hors de la zone relevée
n'avait aucun moyen d'explorer quoi que ce soit.

**3. Choisir un point de départ supposait de deviner la zone couverte.** La
base ne contient qu'une zone. Saisir une adresse au hasard renvoie une liste
vide — l'application paraît cassée alors qu'elle répond correctement.

### Décision

**`packages/shared/content.js`** — pendant de `tokens.js` (D-022) pour les
textes. Web et mobile lisent la même source : deux interfaces qui décrivent le
produit différemment donnent l'impression de deux produits.

Le fichier porte sa règle d'écriture, sous forme de trois interdits :

1. Ne jamais promettre « les meilleurs » — le projet ne classe pas la qualité,
   il mesure l'ancrage local.
2. Ne jamais s'appuyer sur les notes ou le nombre d'avis — D-007 les a sorties
   du scoring, le vocabulaire doit suivre.
3. Ne jamais annoncer une certitude que le scoring n'a pas : tant que le jeu
   labellisé n'existe pas (D-006), le registre est celui de l'indice, pas du
   verdict.

Exemple du glissement obtenu :

> ~~Trouvez la table parfaite, n'importe où.~~
> **Mangez là où mangent les habitants.**
> *Les bonnes adresses de quartier ne sont pas mal notées — elles sont
> invisibles. Local Signal les fait remonter sans se fier à leur popularité.*

**`apps/mobile/src/SearchScreen.js`** — troisième écran, avec les trois modes
du web : position GPS, adresse saisie avec suggestions, lieu du Quartier latin
en accès direct.

**Points de départ explicites** — six lieux du Quartier latin (Place Maubert,
Panthéon, rue Mouffetard, Saint-Michel, Odéon, Jardin des Plantes), tous à
l'intérieur de la zone relevée, proposés en un geste sur les deux interfaces.

**Suggestions d'adresse biaisées sur la zone** — Nominatim est interrogé avec
un `viewbox` sur le Quartier latin, **sans `bounded=1`** : les résultats de la
zone remontent en tête, mais une adresse ailleurs reste trouvable. Restreindre
durement serait un mur, pas une aide — et empêcherait le projet de fonctionner
dès qu'une autre zone sera relevée.

### Sur react-navigation
La roadmap prévoyait de l'adopter « dès qu'un troisième écran apparaîtra ». Il
apparaît ici, et la décision est de **ne pas** l'adopter encore : ces trois
écrans sont des destinations parallèles, sans pile ni retour imbriqué. Une barre
d'onglets manuelle les couvre exactement. Le vrai déclencheur sera la fiche
restaurant détaillée, qui empilera un écran sur un autre (phase 3).

### Conséquences
- `packages/shared/content.js` — textes, lieux de démonstration, position de repli
- La position de repli n'est plus dupliquée : web et mobile lisent la même valeur.
  Elle l'était, et rien n'empêchait les deux copies de diverger.
- Trois onglets sur mobile : Autour de moi · Rechercher · Scanner
- Nouvelle classe CSS `.address-suggestions` dans `apps/web/src/App.css`
- Les textes ne sont plus écrits en dur dans les composants : toute retouche
  éditoriale se fait à un seul endroit, et s'applique aux deux plateformes

---

## D-027 — Les deux scores géographiques : densité et rang, plutôt que seuils en mètres

**Contexte.**
Le projet a deux signaux géographiques, de natures opposées (D-008) : la pression
touristique, statique, qui entre dans le Local Signal avec un poids de 0,15 ; et
la proximité à l'utilisateur, dynamique, qui module le classement à hauteur de
0,30. Les deux avaient été écrits tôt, avec des seuils en mètres choisis à vue.
Les 468 restaurants réels du Quartier latin ont permis de les mesurer.

**Problème — quatre défauts mesurés, pas supposés.**

*Sur le signal statique :*

1. **Il ne regardait que le monument le plus proche.** À distance comparable
   (60–70 m), la pression réelle — mesurée comme somme d'un noyau sur les 47
   sites — varie de **4,99 à 20,86**, un facteur 4 intégralement écrasé. À
   250–350 m, `Osteria Brutto` subit 12,27 contre 5,93 pour `Sanuki` : le score
   les traitait à l'identique. Un restaurant cerné par douze monuments ne subit
   pas le flux d'un restaurant qui en a un seul à la même distance.

2. **Le seuil de 500 m ne mordait nulle part.** Distance médiane au monument le
   plus proche : **102 m**. Maximum : **273 m**. Donc **0 restaurant sur 468**
   n'atteignait le rayon : la branche « hors zone, aucune pénalité » était du
   code mort, et le signal plafonnait à **0,55** au lieu de 1,00 — la moitié de
   la plage perdue.

3. **`500` est une constante en mètres.** Calibrée sur un arrondissement dense,
   elle est fausse à Tokyo comme dans un village. Or le produit doit fonctionner
   partout, même là où aucune vérité terrain n'existe.

*Sur le signal dynamique :*

4. **Il se normalisait sur `MAX_DISTANCE_USER = 5000 m`, jamais sur le rayon
   demandé.** À 400 m — « 5 min à pied », le rayon le plus utilisé — toutes les
   proximités tombaient entre **0,921 et 0,980**. Une dispersion de 0,06 : le
   terme était quasi constant et **ne départageait plus rien**. La décroissance
   était de surcroît linéaire, traitant identiquement 100 m → 600 m (décisif à
   pied) et 4,1 km → 4,6 km (sans objet).

**Décision.**

*Statique — deux grandeurs, conservées séparément.*

```
pression(r)   = Σᵢ exp( −dᵢ² / 2σ² )        σ = 350 m, à calibrer
score_zone(r) = 1 − rang_percentile( pression(r) )   dans la zone
```

- La **pression absolue** est stockée telle quelle. C'est une grandeur physique,
  reproductible, indépendante de la cohorte et de la requête : c'est elle qui
  permet l'évaluation, la calibration, et la comparaison entre deux villes.
- Le **signal** est le rang de cette pression dans sa zone. Un rang ne dépend
  d'aucune échelle : il se transporte tel quel d'une ville à l'autre, sans
  recalibrage. L'étendue 0–1 est garantie par construction.
- Le rang est calculé **en lot** (`backend/ingestion/osm/load.py`), jamais dans
  le chemin d'une requête : le signal reste statique au sens de D-008, et deux
  requêtes ne peuvent pas attribuer deux scores au même restaurant.

*Dynamique — normalisation sur le rayon demandé, décroissance exponentielle.*

```
score_prox(r) = exp( −distance / (rayon_demandé × 0,5) )
```

Soit 1,00 sur place, 0,37 à mi-rayon, 0,14 en limite : le pouvoir de
discrimination est placé là où le piéton le ressent.

**Sources retenues.** Monuments et attractions déjà relevés (47 sites) —
`tourism=attraction`, `historic=*`, musées. Les boutiques de souvenirs, bureaux
de change et hôtels ont été envisagés comme proxys du flux touristique (une
boutique de souvenirs est une *réponse commerciale* au flux, donc peut-être un
meilleur signal que le monument lui-même) et **écartés pour l'instant** : ils
demandent une nouvelle collecte Overpass. Piste ouverte pour le mémoire.

**Conséquences.**

*Mesurées après recalcul des 468 :*

| | avant | après |
|---|---|---|
| signal de zone | 0,00 – 0,55 (médiane 0,20) | 0,00 – 1,00 (médiane 0,50) |
| restaurants à 1,00 | 0 | 5 |
| étendue du Local Signal | 18,1 points | **33,3 points** |

Les extrêmes sont devenus lisibles : `Toranj` (pression 3,66) en tête,
`En face` (pression 17,55) en queue.

*Sur l'API :* `radius` doit être transmis jusqu'à `compute_relevance`. Un
appelant qui l'omet retombe sur 5 km et retrouve l'ancien défaut.

*Sur les tests :* l'invariant D-002 est reformulé — il porte désormais sur la
pression et le rang, mais affirme la même chose. Cinq invariants D-027 ajoutés,
dont un qui vérifie que **multiplier toutes les distances par 10 ne change pas
le classement** : c'est la garantie formelle que le signal est transportable.

*Ce que ce choix coûte, et qu'il faut assumer devant le jury :* le signal de zone
devient **relatif à la ville**. Il répond à « ce restaurant est-il dans un coin
touristique *de cette ville* », pas à « cette ville est-elle touristique ». Deux
villes ne sont plus comparables sur ce signal — c'est `tourist_pressure`, stockée
à côté, qui sert à cela.

**Une confusion à ne pas reproduire.**
L'analyse initiale décrivait le défaut n°4 comme « le poids de 0,30 ment, la
proximité ne pèse que 17,5 % ». C'est imprécis : un **poids** porte sur la
valeur, une **part de variance** dépend en plus de la dispersion du terme. Un
poids de 0,30 ne promet pas 30 % de la variation. Le défaut réel n'était pas que
le poids mentait, mais que **le terme ne variait plus** — ce qui, lui, est
indiscutable. Après correction la proximité pèse ~44 % de la variation, ce qui
n'est ni juste ni faux en soi : `PROXIMITY_DECAY_FACTOR` est en configuration,
marqué non calibré, et sa valeur sortira du jeu labellisé (D-006).

**Ce qui reste ouvert.**
- `σ = 350 m` et `PROXIMITY_DECAY_FACTOR = 0,5` sont **non calibrés**.
- La distance reste **à vol d'oiseau**. Un restaurant de l'autre côté de la Seine
  est « proche » et pourtant à quinze minutes. Un calcul d'itinéraire piéton
  (OSRM) le corrigerait.
- Tous les monuments pèsent encore **également**. Notre-Dame vaut une plaque
  commémorative. La présence d'un tag `wikidata` ou `wikipedia` serait un proxy
  d'importance disponible sans collecte supplémentaire.

---

## D-029 — Un importeur agnostique à la source, plutôt qu'un connecteur par fournisseur

**Contexte.**
Quatre voies ont été essayées pour obtenir les cartes des restaurants : le tag
OpenStreetMap `website:menu` (D-023), les photos de l'API Google Places (D-025),
le lien de carte et les photos taguées « menu » via Outscraper (D-028), et la
récolte directe sur les sites des restaurants. Mesures sur le Quartier latin :

| Voie | Rendement |
|---|---|
| OSM `website:menu` (468 restaurants) | **0 / 468** |
| OSM `website:menu` (10 218 restaurants, Paris) | 275 |
| schema.org `hasMenu` | **1 / 18** testés |
| sites web des restaurants | **27 / 153** (17,6 %) |
| API Places officielle | aucun champ menu, photos sans catégorie |

Aucune voie ne suffit seule, et la meilleure d'entre elles couvre moins d'un
restaurant sur cinq parmi ceux qui ont un site.

**Problème.**
Écrire un module d'ingestion par fournisseur conduit à une prolifération :
chaque nouvelle source demande son parseur, ses noms de colonnes, sa gestion
d'erreurs. Et la source qui finira par être retenue n'est pas connue d'avance —
elle dépend d'arbitrages de coût et de politique d'utilisation qui peuvent
changer en cours de projet.

S'ajoute une contrainte propre à ce projet : l'assistant ne construit pas
d'infrastructure de contournement de détection. La collecte depuis certaines
sources doit donc être réalisée par l'utilisateur avec l'outil de son choix.

**Décision.**
Séparer strictement **la collecte** de **l'import**.

`backend/ingestion/external/importer.py` avale un CSV ou un JSON produit par
n'importe quel collecteur et le range en base. Il ne collecte rien, n'interroge
aucun service, et ne connaît aucun fournisseur.

Trois principes :

1. **Synonymes de colonnes plutôt que format imposé.** `title` / `name` / `nom`,
   `booking_appointment_link` / `reservation_url`, `reviews` / `review_count` :
   les appellations courantes sont reconnues. Changer de collecteur ne demande
   aucune modification de code.

2. **Appariement par la DISTANCE, jamais par le nom seul.** Rayon de 150 m. Un
   enregistrement dont la position ne correspond à aucun restaurant connu est
   **rejeté, pas deviné**. « Alliance » figure deux fois dans la base à deux
   adresses différentes ; rattacher une carte au mauvais établissement
   corromprait l'indicateur qui pèse 0,40 dans la formule.

3. **Les faits OpenStreetMap sont COMPLÉTÉS, jamais écrasés.** Un champ OSM
   vide peut être rempli par l'import ; un champ renseigné est préservé. Les
   champs d'enrichissement (`rating`, `review_count`, `reservation_url`,
   `menu_photo_urls`) sont propres à cette voie et portent `external_source` et
   `external_at`, pour qu'on puisse toujours dire d'où vient chaque donnée.

**Conséquences.**

- Six colonnes ajoutées à `restaurants` : `reservation_url`, `rating`,
  `review_count`, `menu_photo_urls`, `external_source`, `external_at`.
- `rating` et `review_count` sont stockés mais restent **HORS SCORING** —
  D-007 les a explicitement sortis du classement, et D-001 interdit tout critère
  dépendant du volume d'avis. Ils servent uniquement à l'affichage et à
  l'analyse de biais.
- Cinq photos de carte au maximum par restaurant. Au-delà on n'apprend plus
  rien, et chaque image supplémentaire coûte un appel au modèle de vision.
- Vérifié sur un jeu d'essai à noms de colonnes volontairement différents :
  3 restaurants appariés à 20-23 m, 1 enregistrement hors zone rejeté.

**Un biais à mesurer avant d'exploiter les photos de carte.**
Les photos de cartes sur les plateformes cartographiques sont postées par des
clients. Un restaurant sans clientèle nombreuse en a donc peu ou pas — c'est
précisément la population que le projet veut faire remonter (D-001). Avant de
fonder l'indicateur menu sur cette source, il faut **corréler la présence de
photos avec le nombre d'avis**. Si la corrélation est forte, le biais doit être
déclaré dans le mémoire, et l'indicateur menu compensé ou pondéré en
conséquence. Ne pas le mesurer reviendrait à réintroduire le paradoxe de
l'invisibilité par la porte des données.

---

## D-030 — `about.Crowd.Tourists` : validation externe, jamais entrée du calcul

**Contexte.**
L'examen d'une réponse réelle du collecteur a révélé un champ inattendu dans le
bloc `about` de chaque établissement :

```json
"about": { "Crowd": { "Family-friendly": true, "Groups": true, "Tourists": true } }
```

La plateforme cartographique indique elle-même si un lieu attire une clientèle
touristique. C'est exactement la propriété que le projet cherche à mesurer.

**Problème.**
La tentation immédiate est d'en faire un indicateur, voire de s'en servir pour
calibrer les pondérations. Ce serait une faute de méthode : on utiliserait le
jugement d'un tiers pour prédire ce que le projet prétend établir de façon
indépendante. Le mémoire perdrait son objet — mesurer l'authenticité à partir de
signaux observables, et non recopier un classement existant.

C'est le même piège que celui identifié pour les cartes de TheFork : une source
dont la présence même est corrélée à l'orientation touristique.

**Décision.**
`tourist_flag` est stocké et **exclu du scoring**, au même titre que `rating` et
`review_count` (D-007, D-001). Il ne sert qu'à deux usages, tous deux
postérieurs au calcul :

1. **Validation externe du Local Signal.** Si le score attribue des valeurs plus
   basses aux établissements marqués `Tourists`, c'est une confirmation
   indépendante que l'indicateur capte bien quelque chose — et elle ne coûte
   aucun label humain. Le jeu labellisé reste nécessaire pour la calibration,
   mais cette vérification peut être faite immédiatement, sur l'ensemble des
   restaurants enrichis, pas seulement sur un échantillon annoté.

2. **Mesure du biais de collecte.** Croisé avec `review_count` et la présence de
   photos de carte, il permet de vérifier si la voie des photos favorise les
   établissements fréquentés — le risque signalé en D-029.

**Conséquences.**
- Trois colonnes ajoutées : `tourist_flag`, `price_range`, `photos_count`.
  Toutes **hors scoring**.
- `price_range` (« $ » à « $$$$ ») n'est pas un prix. L'indicateur prix compare
  un montant à la médiane du voisinage ; une fourchette qualitative ne peut pas
  l'alimenter. Elle est conservée pour l'affichage et l'analyse.
- Un test de validation reste à écrire : comparer la distribution du Local
  Signal entre `tourist_flag = 1` et `tourist_flag = 0`. C'est peut-être le
  chapitre d'évaluation le plus rapide à produire du mémoire.

**Correctifs d'import associés.**
La réponse réelle a révélé deux écarts avec le format supposé :
- `working_hours` arrive en dictionnaire jour par jour, pas en chaîne. La forme
  `working_hours_old_format` est désormais préférée ; un dictionnaire reçu dans
  un champ texte est sérialisé en JSON plutôt qu'écrit en `repr` Python.
- `reservation_links` est une liste. Une valeur de type liste est réduite à son
  premier élément.
- Enfin, `menu_link` valait `null` sur les trois exemples fournis, tous issus
  d'une recherche groupée. Cela confirme la limite documentée : ce champ ne
  sort que sur des recherches individuelles, une par établissement.
