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

**Date :** 2026-08-13 · **Statut :** SUPERSÉDÉE par D-050 (2026-09-22)

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

### Note de supersession (2026-09-22)
« Par défaut : aucun score visible » ne tient plus — voir D-050. Décision
produit explicite de l'utilisateur (« c'est vraiment notre matière, il faut
l'afficher »), pas une dérive silencieuse : le principe d'explicabilité
derrière le « pourquoi ? » et le traitement de la confiance faible restent
vrais tels quels, seule la visibilité du chiffre a changé. Entrée conservée
intacte (consigne du journal : ne jamais supprimer, seulement superséder).

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

---

## D-031 — Choisir les photos de carte par LOT, et non par date seule

**Contexte.**
La récolte des photos taguées « menu » rend jusqu'à plusieurs dizaines de
clichés par restaurant. Les analyser tous coûterait un appel de vision chacun ;
n'en prendre qu'un donne une carte tronquée. Il fallait une règle de sélection.

Mesuré sur deux restaurants du Quartier latin :

| Restaurant | Photos taguées « menu » | Motif |
|---|---|---|
| Amarvi | 12 **au même horodatage** (11/5/2025 12:00:00), puis 3 isolées | téléversement du restaurateur, carte en 12 pages |
| Allard | 15 dates différentes, de 2022 à 2026 | clichés de clients au fil des ans |

L'utilisateur a vérifié manuellement : la carte d'Amarvi est bien publiée en
douze pages.

**Problème.**
La règle intuitive — « prendre les 3 ou 4 plus récentes » — échoue précisément
sur le cas favorable. Appliquée à Amarvi le 4 septembre 2026, elle retiendrait
les trois photos isolées de 2026 et **jetterait la carte complète de novembre
2025**. On échangerait le PDF officiel du restaurant contre trois clichés épars.

L'enjeu n'est pas cosmétique. L'indicateur menu compte les plats, et une carte
resserrée est le marqueur d'un restaurant local (D-004). Analyser une page sur
douze rend `dish_count = 8` au lieu de 60 : **le score devient faux, et faux
dans le sens qui flatte**. Une donnée tronquée est ici pire qu'une donnée
absente — l'absence, elle, est gérée par la redistribution des poids (D-012).

**Décision.**
Sélection en trois temps, dans `backend/ingestion/external/selection_photos.py` :

1. **Écarter les photos de plus de 24 mois.** L'indicateur prix compare un
   montant à la médiane du quartier ; des prix de 2022 fausseraient la
   comparaison silencieusement.
2. **Chercher le lot groupé le plus récent** — au moins trois photos partageant
   l'horodatage. C'est une carte publiée en pages.
3. **À défaut, retenir les plus récentes**, une par une.

Cinq photos analysées au maximum.

**Le seuil est à TROIS, et non deux.** Les horodatages sont arrondis à l'heure :
deux clients photographiant la carte le même midi produisent une collision
fortuite. C'est arrivé sur Allard, où deux clichés isolés du 21/06/2025
partageaient l'horodatage — le seuil à deux les prenait pour une carte et
écartait une photo d'août 2026, bien plus récente. À trois, la coïncidence
devient improbable tandis que le téléversement groupé reste reconnu.

**Un lot ancien l'emporte sur des clichés récents.** C'est délibéré : la
complétude prime sur la fraîcheur, dans la limite des 24 mois. Un `dish_count`
juste sur une carte de l'an dernier vaut mieux qu'un comptage partiel sur une
photo de la semaine.

**Conséquences.**
- Le motif de sélection est conservé en base — « lot groupé du 05/11/2025,
  12 pages, 5 analysées ». On doit pouvoir expliquer des mois plus tard
  pourquoi telle carte a été lue plutôt qu'une autre.
- Les photos d'un même lot sont des PAGES d'une seule carte. Leurs
  observations devront être **agrégées**, pas traitées comme des cartes
  distinctes : les plats se somment, les cuisines s'unissent. Ce point reste à
  implémenter dans le pipeline d'extraction.
- Vérifié : Amarvi retient le lot de 12 pages ; Allard bascule sur les cinq
  photos isolées les plus récentes, à partir du 02/08/2026.

**Ce qui reste ouvert.**
Le nombre de photos à demander au collecteur détermine le coût. En demander 15
pour n'en analyser que 5 permet de détecter les lots longs, mais multiplie les
crédits consommés. Arbitrage non tranché.

---

## D-032 — Lecture des cartes en local : OCR, code déterministe, modèle sur la machine

**Contexte.**
La lecture des cartes par un service de vision distant s'est heurtée à un mur
mesuré : le palier gratuit plafonne à 200 000 jetons par jour et une image de
carte en consomme environ 2 950, soit **68 pages quotidiennes**. Pour les
1 120 pages du Quartier latin, seize jours.

Trois obstacles avaient déjà été levés — bridage du raisonnement, réduction des
images à 1 024 px, budget de sortie ramené de 3 000 à 300 jetons — sans changer
l'ordre de grandeur : le coût est celui de l'image, pas de la réponse.

**Décision.**
Déplacer entièrement la lecture sur la machine, en trois étapes :

```
photo  →  OCR RapidOCR (ONNX, hors ligne)  →  texte
texte  →  code déterministe                →  4 observations
texte  →  modèle local Ollama (qwen2.5:7b) →  2 observations
```

**Ce que le code calcule seul, et pourquoi c'est mieux.**

| Observation | Méthode |
|---|---|
| `dish_count` | comptage des motifs de prix |
| `has_tourist_menu` | vocabulaire |
| `has_dish_photos` | texte quasi absent sur une image chargée |

Un nombre de plats **compté par une expression régulière est reproductible et
auditable** ; le même nombre rendu par un modèle ne l'est pas. C'est D-014 — le
modèle observe, il ne juge pas — poussé d'un cran : là où du code déterministe
suffit, le modèle n'a rien à faire. Deux lectures de la même carte donnent
désormais le même compte, condition nécessaire à toute calibration.

**Ce qui reste au modèle** : les cuisines et le ratio vernaculaire, deux champs
qui demandent de comprendre qu'un *Vitello tonnato* garde son nom d'origine
tandis qu'un « veau sauce thon » est traduit.

**Pourquoi un modèle de TEXTE et non de vision**, à mémoire graphique égale
(6 Go) : un modèle de vision de 3 milliards de paramètres dépense la moitié de
sa capacité dans l'encodeur visuel ; un modèle de texte de 7 milliards consacre
la sienne entière à la langue. L'OCR fait déjà le travail visuel, et il le fait
bien.

**Un appel de modèle par restaurant, pas par page.** Les textes des pages sont
concaténés avant l'appel sémantique : cinq pages sont une seule carte (D-031).
On passe de 1 120 appels à 318.

**Quatre défauts corrigés, tous révélés par des cartes réelles.**

1. **Prix à une décimale.** Le premier motif exigeait deux décimales et
   manquait « 15,5 », forme la plus courante en France : cinq prix sur sept
   perdus sur la carte d'essai.
2. **Prix en entiers nus.** « Au Moulin à Vent » écrit ses tarifs « 24 », « 29 »
   sans virgule ni symbole — le comptage rendait **zéro plat sur 155 lignes**.
   Une ligne ne contenant qu'un entier entre 3 et 199 est désormais un prix.
3. **Pages en double.** Plusieurs clients photographient souvent la même page ;
   concaténer sans vérifier doublerait le compte. Les pages dont 70 % des
   lignes coïncident sont écartées.
4. **Détection de langue abandonnée.** `langdetect` a répondu « allemand,
   anglais » sur une carte franco-italienne. Une carte est une liste de
   syntagmes nominaux, l'OCR la rend en capitales sans accents, et les noms de
   plats étrangers dominent le vocabulaire. Comme la langue alimente un
   indicateur qui pèse 0,30 (D-024), une détection fausse y ferait plus de
   dégâts qu'une absence — que le moteur sait traiter (D-012). Le champ revient
   au modèle.

**Conséquences.**
- Ni quota ni facture. Le traitement du Quartier latin passe de seize jours à
  moins d'une heure, et rien n'empêchera de traiter Paris entier ensuite.
- Le **texte OCR est conservé en base** (`menus.ocr_text`). Il n'alimente aucun
  indicateur aujourd'hui, et c'est justement pourquoi il faut le garder : ce
  qui ne sert pas maintenant peut fonder un indicateur demain, permettre de
  recalibrer sans retraiter les images, ou constituer une preuve. La base de
  menus structurés est l'actif du projet (CLAUDE.md §3).
- Les **images ne sont toujours pas conservées** — œuvres de leurs auteurs
  (D-021, D-025). Le texte qu'on en tire est un fait, il se garde.
- Un troisième fournisseur rejoint Groq et Claude (D-017), sans les remplacer :
  le comparatif de précision d'extraction reste possible.

**Ce qui reste ouvert.**
Le seuil de déduplication (70 %) et les bornes du prix entier (3 à 199) sont
posés au jugement. Ils devront être vérifiés sur le jeu labellisé, comme toute
constante du projet (D-006).

---

## D-033 — Les prix viennent du texte des cartes, pas d'une fourchette

**Contexte.**
L'indicateur prix pèse 0,15 et valait **zéro sur les 468 restaurants** du
Quartier latin. Deux causes s'additionnaient :

1. OpenStreetMap n'expose aucun prix — mesuré, 0 sur 468 ;
2. la lecture des cartes **comptait** les prix pour en déduire le nombre de
   plats, puis **jetait les montants**.

Une troisième voie a été envisagée puis écartée : la fourchette affichée par la
plateforme cartographique (« $ » à « $$$$ »). Le champ existe dans la réponse du
collecteur, mais il vaut `None` sur **les 457 fiches** — `range` comme `prices`.
Il aurait de toute façon posé un problème de résolution : quatre paliers ne
permettent pas de comparer un restaurant à la médiane de son voisinage, ce que
l'indicateur exige.

**Décision.**
Extraire les montants du texte OCR déjà conservé en base (D-032), sans aucun
appel ni coût.

**Ce qui valide la méthode.** La distribution des nombres relevés sur
l'ensemble des cartes est celle de prix de plats parisiens, pas celle de
nombres au hasard :

```
10 €  132 fois        16 €  162 fois
12 €  165 fois        18 €  122 fois
15 €  148 fois        20 €   92 fois
```

Pic entre 12 et 18, décroissance au-delà de 20, quasi rien sous 10 — entre 1 et
9 €, au plus 14 occurrences par valeur. Une extraction qui capterait du bruit
donnerait une distribution plate.

**La médiane, et non la moyenne.** Une carte mêle des desserts à 6 € et des
plateaux à 90 € ; la moyenne suivrait les extrêmes, la médiane décrit le prix
d'un plat ordinaire — exactement ce que l'indicateur compare au voisinage.

**Bornes retenues** : 5 € à 199 €. Le plancher écarte boissons et suppléments,
et la distribution mesurée le justifie. Le plafond écarte années, codes postaux
et fragments de numéros de téléphone.

**Trois montants au minimum.** En deçà, la médiane ne signifie rien : un seul
prix relevé peut être celui d'un menu entier comme d'un supplément. Le
restaurant est alors laissé sans prix, et le moteur redistribue le poids
(D-012) — ce qui vaut mieux qu'un prix inventé.

**Conséquences.**

| Indicateur | Poids | Avant | Après |
|---|---|---|---|
| menu | 0,40 | 338/468 | inchangé |
| langue | 0,30 | constante | inchangée |
| **prix** | **0,15** | **0/468** | **278/468** |
| zone | 0,15 | 468/468 | inchangé |

Le poids réellement actif de la formule passe de **0,55 à 0,70**, et la
confiance médiane de 0,55 à **0,70**. Médiane du quartier : **15,00 €**.

Le détail complet est conservé dans `restaurants.price_detail` — médiane, min,
max, amplitude et la liste des montants. Seule la médiane alimente
l'indicateur ; le reste est gardé parce qu'il pourra en fonder un autre —
l'amplitude distingue une carte resserrée d'une carte fourre-tout — et parce que
ce qui est obtenu se garde.

**Ce qui reste ouvert.**
Un dernier indicateur demeure inerte : **la langue**. Elle mesure la part des
avis rédigés en langue locale, or aucun texte d'avis n'est en base — seul leur
nombre l'est. Le lissage bayésien rend donc l'a priori 0,50 pour tous, et 30 %
de la formule ne départage personne. Y remédier suppose de collecter des textes
d'avis, ce que D-019 déconseille de conserver durablement.

---

## D-034 — Filtrer sans refaire le tri par popularité

**Date :** 5 septembre 2026

### Contexte

Les deux interfaces ne proposaient que deux filtres : un rayon et une cuisine.
Ils dataient d'une époque où la base ne portait rien d'autre. Depuis, la collecte
Outscraper (D-029) et la lecture locale des cartes (D-032, D-033) ont ajouté des
prix (278 restaurants), des horaires, des liens de réservation, des notes, des
nombres d'avis et 334 cartes lues. L'interface n'exploitait rien de tout ça.

### Problème

Trois questions distinctes, qu'il fallait trancher ensemble.

**1. Quels champs peuvent filtrer ?** La note et le nombre d'avis sont désormais
en base et seraient les filtres les plus évidents à ajouter. C'est exactement ce
qu'il ne faut pas faire : laisser l'utilisateur écarter « les restaurants sous
4 étoiles » lui fait refaire à la main le tri par popularité que le projet
existe pour éviter (D-001, D-007). Le restaurant de quartier, avec ses trois
avis, disparaîtrait de sa liste — et c'est précisément celui qu'on veut lui
montrer.

**2. Que faire d'une donnée manquante ?** Un filtre de budget doit-il écarter un
restaurant dont le prix est inconnu ? Si oui, les restaurants les moins
documentés disparaissent dès qu'un filtre est actif — soit exactement la
population que le projet veut faire remonter. C'est le paradoxe de
l'invisibilité qui ressurgit dans l'interface après avoir été traité dans le
scoring.

**3. Que montre-t-on du calcul ?** D-009 impose de ne montrer aucun score par
défaut. Mais pendant le développement et pour le mémoire, il faut pouvoir
vérifier qu'un score est bien la somme de ses parties, et voir ce que le modèle
a réellement observé.

### Décision

**Les filtres retirent des lignes, ils n'en réordonnent aucune.** Le classement
reste celui du Local Signal modulé par la proximité (D-008). Un filtre qui
influencerait la note ferait entrer par la fenêtre des critères que le scoring a
délibérément écartés.

**Filtres proposés :** tranche de budget, ouvert maintenant, réservation
possible, carte analysée. **Ni note ni nombre d'avis**, bien qu'ils soient
disponibles — ils s'affichent sur la fiche, ils ne filtrent pas.

**Une donnée manquante n'exclut jamais.** Un restaurant sans prix connu reste
visible sous un filtre de budget ; un restaurant sans horaires reste visible
sous « ouvert maintenant ». Même règle que D-012 côté scoring : l'absence
d'information ne se transforme pas en jugement défavorable.

L'unique exception est le filtre qui porte **sur la présence même** : « carte
analysée » exclut évidemment ceux dont on n'a pas la carte. C'est le seul cas où
l'absence exclut légitimement, parce que c'est ce que le filtre demande.

**Le lecteur d'horaires accepte deux formats.** OpenStreetMap écrit
`Mo-Fr 12:00-14:30,19:00-22:00` ; les fiches importées portent un objet JSON aux
clés françaises. L'import étant non destructif (D-029), il n'a pas uniformisé
l'existant : les deux formes cohabitent en base et le lecteur doit accepter les
deux. `est_ouvert` retourne **`True`, `False` ou `None`** — `None` signifiant
« on ne sait pas » et ne devant jamais être traité comme `False`.

**Le détail du calcul est visible, mais replié et étiqueté « vue technique ».**
Il montre, pour chaque indicateur : la valeur, le poids déclaré, le **poids
effectif après redistribution** (D-012), la contribution en points, et les
observations brutes. Il affiche aussi un **contrôle d'intégrité** : la somme des
contributions doit retomber sur le Local Signal, sinon l'écart est signalé.

**Les photos de carte sont montrées, jamais stockées.** Elles sont servies
depuis leur hébergeur d'origine et repliées par défaut. La base ne conserve que
des URL et le texte relevé (D-021, D-025) : on analyse puis on jette, on ne
redistribue pas l'œuvre.

### Conséquences

- `backend/core/filters/criteres.py` centralise les tranches de budget et le
  lecteur d'horaires. Les bornes y sont **la référence** : celles affichées par
  les fronts doivent leur rester identiques, sinon le libellé et le filtrage
  décriraient deux choses différentes.
- Les tranches (< 12 / 12–18 / 18–25 / > 25 €) sont calées sur la distribution
  du Quartier latin — médiane 15 €. **À recalibrer si la zone change** :
  « abordable » n'a pas la même borne à Paris et ailleurs.
- 166 restaurants dont les horaires étaient en JSON sortent de l'état « horaires
  inconnus » et deviennent filtrables.
- Le panneau de détail rend visible ce qui ne l'était pas : que la langue vaut
  0,50 partout faute de textes d'avis, et que le prix manque encore sur la
  majorité des fiches. C'est un outil de diagnostic autant que d'explication.
- La vue technique devra être **retirée ou verrouillée** avant toute mise entre
  les mains d'utilisateurs réels : D-009 n'est pas suspendu, il est mis de côté
  le temps du développement et du mémoire.

---

## D-035 — Barre de filtres, et photo réelle des restaurants

**Date :** 6 septembre 2026

### Contexte

Le panneau de filtres de D-034 était fonctionnellement correct mais empilé
verticalement : quatre groupes les uns sous les autres, qui repoussaient les
résultats hors de l'écran. On filtrait sans voir ce qu'on filtrait.

Par ailleurs, chaque restaurant s'affichait avec une illustration générée à
partir de son identifiant. Le rendu était uniforme et peu engageant, alors que
la collecte Outscraper (D-029) avait rapporté une photo principale pour 98 %
des fiches — un champ `photo` que l'importeur n'avait jamais lu.

L'interface de TheFork a servi de référence explicite pour la forme, à la
demande du porteur du projet.

### Problème

**1. La forme du bloc de filtres.** Un panneau qui grandit à mesure qu'on
ajoute des critères entre en concurrence directe avec les résultats. Or les
critères vont continuer de s'ajouter.

**2. La liste des cuisines était tronquée à 14 entrées** côté web et 12 côté
mobile, par ordre alphabétique. La troncature datait de l'affichage en rangée
de pastilles, illisible au-delà. Conséquence mesurée : sur 267 cuisines
présentes en base, l'utilisateur en voyait 14 — « A volonté », « Afghan »,
« Africaine »… — et « Italienne », qui compte 819 restaurants, était invisible.

**3. L'ordre alphabétique mettait les étiquettes parasites devant.**
« Italian restaurant » (1 restaurant en base) précédait « Italienne » (819).
Ces doublons viennent des libellés du collecteur externe, qui coexistent avec
ceux d'OpenStreetMap. Un utilisateur cherchant de l'italien tombait d'abord sur
l'étiquette parasite et repartait avec zéro résultat.

**4. Aucune photo réelle.** Le champ existait dans les fichiers bruts, déjà
collectés et déjà payés.

### Décision

**Une barre horizontale unique, pas un panneau empilé.** Les critères les plus
utilisés restent visibles sur la ligne ; tout le reste vit derrière un bouton
« Tous les filtres » qui porte le nombre de filtres actifs. La ligne défile
horizontalement plutôt que de passer à la ligne.

**Le panneau annonce son effet avant qu'on valide** : « Voir N restaurants »,
recalculé à chaque changement. Sans ça, on coche à l'aveugle et on découvre une
liste vide après coup.

**Les cuisines sont chargées en entier et triées par fréquence**, plus par
alphabet. `core/cuisines.options` rend désormais un `count` et ordonne par
volume décroissant, l'alphabet ne servant qu'à départager les ex æquo — sinon
l'ordre dépendrait du parcours de la base et deux appels successifs pourraient
ne pas rendre la même liste. La traîne des 267 entrées est atteinte par un
**champ de recherche**, qui n'avait aucun sens sur une liste de 14.

**Divergence assumée entre les deux interfaces.** Le web ouvre des menus
ancrés sous la pastille ; le mobile ouvre une feuille modale par le bas. Sur
téléphone, un menu ancré sortirait de l'écran ou couvrirait la pastille qui
l'a ouvert. La divergence tient à la taille de l'écran, pas au goût.

**La photo réelle se superpose à l'illustration, elle ne la remplace pas.**
427 restaurants sur 10 686 en ont une : le cas « pas de photo » est le cas
MAJORITAIRE. L'illustration reste donc le socle et la photo se pose par-dessus
en fondu. Cela règle trois cas d'un coup : la majorité sans photo, le temps de
chargement, et l'URL expirée.

**On stocke l'URL, jamais l'image** (colonne `photo_url`). Même règle que pour
les cartes (D-021, D-025) : l'image reste chez son hébergeur, ne transite pas
par nos serveurs, et n'est pas redistribuée.

**Ce qui reste refusé.** TheFork propose « Les mieux notés ». Nous ne le
proposons pas, et ne le proposerons pas : ce serait exactement le tri par
popularité que le projet existe pour éviter (D-001, D-007). La règle de D-034
tient intégralement — une donnée manquante n'exclut jamais, sauf pour
« carte analysée » qui porte sur la présence même.

### Conséquences

- `core/cuisines.options` change de contrat : il rend un `count` en plus de
  `value` et `label`, et l'ordre n'est plus alphabétique. Tout consommateur qui
  supposait l'ordre alphabétique doit être revu.
- La colonne `photo_url` est renseignée sur 427 restaurants. Elle sera vide
  partout où la collecte externe n'est pas passée — c'est-à-dire hors de la
  zone témoin.
- **Les doublons d'étiquettes de cuisine restent en base** (« Italian
  restaurant » à côté d'« Italienne »). Le tri par fréquence les enterre mais
  ne les nettoie pas. Un vrai dédoublonnage suppose une table de correspondance
  entre les libellés du collecteur et ceux d'OpenStreetMap : c'est un chantier
  séparé, à ouvrir avant toute extension hors zone témoin.
- Les URL de photo peuvent expirer. Le repli sur l'illustration est la réponse
  prévue, et il est vérifié : les images bloquées ne laissent aucun cadre vide.
- La vue technique du calcul (D-034) reste en place et reste à retirer avant
  toute mise entre les mains d'utilisateurs réels.

---

## D-036 — Rapprocher deux bases sur le nom ET la distance, pas sur la distance seule

**Date :** 12 septembre 2026 · **Statut :** actif

### Contexte

L'importeur externe (D-029) rattache chaque fiche d'un collecteur commercial à
un restaurant OpenStreetMap déjà en base. Le rapprochement se faisait **sur la
distance seule** : la fiche allait au restaurant le plus proche dans un rayon
de 60 mètres.

### Problème

Dans le Quartier latin, la densité est telle que ce critère ne discrimine plus.
Un même immeuble abrite trois adresses, les coordonnées OSM et celles du
collecteur portent chacune leur propre imprécision, et **plusieurs fiches
pouvaient être attribuées au même restaurant** — ou à son voisin.

Mesure sur la zone : **56 fiches sur 409 étaient posées sur le mauvais
restaurant**, soit 14 %. Les notes, les photos et les horaires d'un
établissement se retrouvaient affichés sur un autre. Un signal faux est pire
qu'un signal absent : il ne se voit pas.

### Décision

Le rapprochement devient une **affectation une-pour-une**, arbitrée par un score
qui combine deux preuves indépendantes :

| Preuve | Rôle |
|---|---|
| Similarité des noms (`SequenceMatcher` sur formes normalisées) | l'identité |
| Distance en mètres | la plausibilité géographique |

Deux passes, dans cet ordre :

1. **Les paires nommées d'abord.** Similarité ≥ `SIMILARITE_MINIMALE = 0.50`,
   les meilleures d'abord, chaque fiche et chaque restaurant consommés une seule
   fois. Une similarité ≥ `SIMILARITE_FRANCHE = 0.70` autorise une distance plus
   large : deux bases peuvent placer le même établissement à 50 m d'écart, elles
   ne lui inventent pas le même nom par hasard.
2. **Rattrapage par proximité ensuite**, sur ce qui reste seulement, et
   uniquement sous `DISTANCE_CERTAINE_M = 12` — distance à laquelle il n'y a
   matériellement pas deux établissements.

`reinitialiser()` (option `--reinitialiser`) efface les champs importés avant de
rejouer, faute de quoi une mauvaise attribution survit à sa propre correction.

### Conséquences

- Concordance mesurée sur la zone : **91 % → 99 %**.
- L'import n'est plus idempotent par accident mais par construction : une fiche
  ne peut plus être posée deux fois.
- Les restaurants sans nom exploitable ne sont rattachés que par la voie stricte
  des 12 mètres. C'est assumé : mieux vaut une fiche non rattachée qu'une fiche
  posée au hasard.
- `photo_url` est désormais importée (`CHAMPS`). Elle existait déjà dans les
  réponses déjà payées et n'était pas lue : **427 photos récupérées sans un
  appel réseau de plus**.

---

## D-037 — Un seul produit sur deux écrans

**Date :** 6 septembre 2026

### Contexte

Après la refonte des filtres (D-035), l'usage a fait apparaître trois défauts
que la mesure a confirmés, et un quatrième plus profond : **le web et le mobile
n'étaient pas le même produit.**

### Problèmes

**1. Le budget par tranches fixes.** Quatre cases — moins de 12, 12–18, 18–25,
plus de 25. Un découpage arbitraire : chercher entre 14 et 22 € imposait de
cocher deux cases, et « moins de 10 » était inexprimable.

**2. La liste des cuisines se répétait.** « Pizzeria » y figurait deux fois,
« Nouilles » et « Noodles » côte à côte, « Grillades » et « Grill ». Cause
mesurée : 194 des 267 étiquettes n'étaient pas traduites et s'affichaient
brutes, et `options()` regroupait par valeur brute plutôt que par libellé. Effet
secondaire plus grave que l'inesthétique : les restaurants étaient **répartis
entre deux filtres dont aucun ne les montrait tous** — 556 pizzerias sous
`pizza`, 58 sous `italian_pizza`.

**3. Deux parcours différents pour le même produit.** Le mobile avait trois
onglets — Découvrir, Chercher, Scanner — dont un entièrement dédié au choix du
point de départ, alors que le web fait tout depuis sa page unique. Passer d'une
interface à l'autre demandait de réapprendre.

### Décisions

**Le budget devient une fourchette continue**, de 5 à 60 €, bornes calées sur la
distribution réelle des 297 prix relevés (p5 = 7,50 ; p50 = 15 ; p90 = 46 ;
max = 181). La borne haute vaut « et au-delà », pas « exactement 60 » : étirer
la glissière jusqu'à 181 tasserait 90 % des restaurants sur un tiers de la
course.

**Une borne restée à son extrémité n'est pas transmise au serveur.** Envoyer
`budget_max=60` écartait les 26 restaurants plus chers alors que l'utilisateur
n'avait rien restreint. Le client n'envoie que les bornes réellement déplacées.

**Les cuisines sont regroupées par libellé, pas par valeur.** `options()` rend
désormais un `value` qui porte toutes les valeurs du groupe, séparées par des
virgules — forme que `/api/restaurants` acceptait déjà. La table de traduction
passe de 81 à 196 entrées, en distinguant les **variantes à fusionner** (`grill`
→ Grillades, `corean` → Coréenne, `italian_pizza` → Pizzeria) des **cuisines
simplement non traduites** (`tibetan` → Tibétaine). On ne fusionne que ce qui
désigne réellement la même chose : « Pâtes » et « Pizzeria » restent distincts.

**Le mobile passe à deux onglets** — Découvrir et Scanner. Le choix du lieu
rejoint la page de découverte, comme sur le web, via un composant `ChoixLieu`
qui offre les trois voies : position, adresse saisie avec suggestions, point sur
la carte. `SearchScreen` est supprimé.

**Les filtres sont identiques des deux côtés** : mêmes critères, même ordre,
mêmes libellés, mêmes bornes. `lib/filtres.js` est volontairement dupliqué à
l'identique dans les deux applications, en attendant `packages/shared`.

### Conséquences

- `core/cuisines.options` change de contrat : `value` peut porter plusieurs
  valeurs séparées par des virgules. Tout consommateur qui la traitait comme
  une valeur unique doit être revu.
- Le paramètre `tranche_prix` n'est plus utilisé par aucune interface. Il reste
  côté serveur (`core/filters/criteres.py`) et fonctionne, mais il n'a plus
  d'appelant : à retirer si rien ne le reprend.
- **120 étiquettes restent non traduites**, couvrant 155 restaurants — une
  traîne où chaque entrée pèse trois occurrences ou moins. Elles s'affichent en
  anglais capitalisé, ce qui reste lisible et signale ce qu'il reste à faire.
- La glissière mobile est écrite à la main sur `PanResponder`, faute de
  composant à deux poignées dans React Native. `onLayout` ne se déclenche pas
  sur une vue montée dans une feuille modale sous react-native-web : la largeur
  est donc mesurée impérativement à la prise du geste, et un geste sans mesure
  ne modifie rien plutôt que d'envoyer la valeur à une borne.
- Divergence assumée qui subsiste : le web ouvre des menus ancrés sous la
  pastille, le mobile des feuilles qui montent du bas. Elle tient à la taille de
  l'écran, pas au goût — un menu ancré sortirait de l'écran d'un téléphone.

---

## D-038 — Conserver les images dans un corpus interne, sans jamais les servir

**Date :** 13 septembre 2026 · **Statut :** actif
**Supersède partiellement :** D-021 et D-025 (destruction après lecture)

### Contexte

Depuis D-021, une photo de carte était analysée puis **détruite**. L'intention
était juste : ne pas redistribuer des œuvres qui ne nous appartiennent pas, et
ne pas constituer un stock d'images sans base légale.

### Problème

La conséquence n'avait pas été mesurée : **aucune lecture n'était vérifiable.**

- Impossible de rouvrir une carte pour contrôler ce que l'OCR en avait tiré —
  alors que le signal menu pèse 0,40 dans le score.
- Tout retraitement — meilleur modèle, meilleur prompt — imposait une **nouvelle
  collecte payante** des mêmes images.
- Un jury demandant « montrez-moi la carte d'où sort ce chiffre » n'aurait rien
  obtenu.

Un jeu de données de recherche dont on ne peut pas inspecter les entrées n'est
pas un jeu de données : c'est une croyance.

### Décision

La distinction qui rend la conservation défendable n'est pas *conserver ou non*,
mais **conserver ou redistribuer** :

| | Statut |
|---|---|
| Conserver pour vérifier et retraiter | corpus interne, jamais servi |
| Servir les images depuis nos serveurs | redistribution — **écarté** |

`backend/core/stockage.py` porte l'abstraction. Trois propriétés :

- **L'empreinte SHA-256 sert de nom de fichier.** Deux envois de la même image
  ne créent qu'un fichier, et l'égalité des empreintes le prouve. Le dépôt est
  idempotent : rejouer un import n'accumule rien.
- **Rangement par préfixe de deux caractères** (`a3/a3f2….jpg`). Un dossier de
  plusieurs milliers d'entrées devient lent à lister — c'est ce que font Git et
  les caches de navigateur, pour la même raison.
- **Le fichier vit hors de la base.** Des images en BLOB gonflent les
  sauvegardes et ralentissent toute restauration. La base ne garde qu'une clé.

Le fournisseur réel — dossier local, Supabase Storage, S3, R2 — se tranche au
déploiement. Le reste du code appelle `deposer` et `lire` sans le savoir.

### Conséquences

- `docs/CONFIDENTIALITE.md` est amendé : §4 énonce la conservation, son motif,
  et le fait que le corpus n'est **jamais publié**. Une ligne contradictoire
  (« Photo de carte | non conservée ») a été retirée.
- **À la suppression d'un compte, les photos sont déliées, pas supprimées** :
  elles documentent un restaurant, pas une personne. Plus rien ne permet de
  savoir qui les a envoyées.
- Le corpus n'est ni versionné, ni exposé par une route. `GET .../cartes` rend
  des **métadonnées** — combien, quand, lues ou non — jamais une image.
- La croissance est à surveiller : `volume()` existe pour ça. À 2 Mo par carte,
  3 000 cartes font 6 Go — au-delà du disque d'un hébergeur gratuit.

---

## D-039 — Nos propres avis : stockés et affichés, hors du calcul

**Date :** 14 septembre 2026 · **Statut :** actif

### Contexte

Les utilisateurs connectés peuvent laisser un avis, et déposer une photo de
carte depuis la fiche d'un restaurant.

### Problème

La tentation immédiate est de faire entrer ces avis dans le score. Ce serait
**réintroduire la popularité par la porte de service** — le défaut exact que le
projet existe pour corriger (D-001). Un restaurant qui reçoit dix avis de nos
utilisateurs n'est pas plus authentique qu'un restaurant qui n'en reçoit aucun ;
il est plus visible. C'est la confusion d'origine.

S'y ajoute un biais que nous ne savons pas encore mesurer : les premiers
utilisateurs d'un service d'authenticité ne sont pas un échantillon neutre.

### Décision

**Les avis utilisateurs sont stockés et affichés. Ils n'entrent dans aucun
calcul.** La table `user_reviews` est séparée de `reviews` (collecte externe) :
deux provenances, deux fiabilités, deux usages — les confondre rendrait
impossible de dire d'où vient un chiffre.

Ce qu'ils sont en revanche : **un actif**. Une base d'avis dont nous connaissons
la provenance, la date et l'auteur — ce qu'aucun fournisseur tiers ne garantit.
Le jour où leur biais sera mesuré sur le jeu labellisé, la question pourra être
rouverte. Pas avant.

**La connexion est exigée pour un avis, pas pour une carte.** Un avis anonyme ne
serait ni modifiable ni supprimable par son auteur, et échapperait à son droit
d'accès (D-029) — il est donc impossible. Une photo de carte, elle, ne dit rien
de la personne : le premier réflexe devant une carte en vitrine est de la
photographier, pas de créer un compte, et exiger l'inscription à cet instant
coûterait l'essentiel des contributions.

**L'image est déposée avant l'analyse.** Si le modèle est indisponible, la
contribution est conservée et relisible plus tard. L'ordre inverse perdrait la
photo à chaque panne du fournisseur.

### Conséquences

- La fiche d'un restaurant porte les deux gestes, **sur les deux interfaces**.
  Le mobile conserve en plus son onglet Scanner : une carte photographiée sans
  restaurant rattaché reste possible.
- Un utilisateur a **un seul avis par restaurant**, modifiable et supprimable.
  Un fil de commentaires appellerait une modération que nous n'avons pas.
- La langue de l'avis est détectée à l'écriture et stockée : la recalculer plus
  tard sur des milliers d'avis coûterait cher pour le même résultat.
- Ces avis étant hors calcul, ils **ne peuvent pas** servir à manipuler un
  classement. C'est une propriété, pas un effet de bord.

---

## D-040 — Collecter des avis pour la langue : combien, lesquels, et que faire de l'indéterminé

**Date :** 14 septembre 2026 · **Statut :** actif

### Contexte

L'indicateur de langue pèse **0,30** dans le Local Signal. Il valait `0,500`
pour les 468 restaurants de la zone — une seule valeur distincte. Un indicateur
constant ne classe rien : 30 % du score ne servait à rien.

Cause racine, trouvée dans `backend/ingestion/osm/load.py` :

```python
r["reviews"] = []    # pas d'avis : le lissage gère (D-003)
```

Le lissage bayésien faisait exactement son travail — sans donnée, il rend l'a
priori, `0,5`. Le défaut n'était pas dans le calcul, il était dans le fait
qu'**aucun avis n'était jamais chargé**, alors que la table existait.

### Décisions

**1. Cinquante avis par restaurant, parce que c'est ce que dit la marge d'erreur.**

Sur une proportion, la marge à 95 % vaut `1,96 · √(p(1−p)/n)`, maximale en
`p = 0,5` :

| n | marge |
|---|---|
| 10 | ± 31 points |
| 50 | ± 14 points |
| 100 | ± 10 points |
| 200 | ± 7 points |

Passer de 10 à 50 divise l'erreur par 2,2 ; de 50 à 100 ne la réduit plus que
d'un tiers, pour un coût doublé. **50 est le point où la courbe s'aplatit.**
Une proportion à ± 14 points suffit à distinguer « 5 % de français » de « 60 % » ;
elle ne suffit pas à distinguer 48 % de 52 %, et le score ne prétend pas le
faire.

**2. Les plus récents, jamais les plus pertinents.** `sort="newest"`.
« Most relevant » est un classement de popularité Google : reprendre son ordre
importerait sa notion de ce qui compte, en violation directe de D-001.
« Récent » est un critère qui ne dépend pas de la notoriété — et la langue des
clients d'aujourd'hui informe mieux que celle d'il y a six ans.

**3. Ordre de collecte aléatoire, et reproductible.** Le premier jet triait par
`review_count DESC` : Le Procope, 28 389 avis, en tête. Si le budget arrête la
collecte à mi-parcours, **seuls les restaurants les plus touristiques auraient
des données de langue** — le biais que le projet combat, reconstitué par l'ordre
d'une boucle. L'ordre par défaut est aléatoire, rendu déterministe par
`substr(hex(r.id), -6)` pour qu'une collecte interrompue reprenne où elle en
était.

**4. Un avis indétectable ne compte ni pour, ni contre.**

La collecte stocke `lang = None` quand le texte est trop court pour qu'une
langue soit identifiée — « Super ! », une suite d'émojis. C'est délibéré : mieux
vaut « je ne sais pas » qu'une langue inventée (D-012).

`count_local_reviews` **relançait la détection dans ce cas**, produisant
exactement la valeur que la collecte avait refusé d'inventer. Effet mesuré sur
Toppoki : 17 avis sur 50 indétectables, re-devinés, score `0,500` — l'a priori,
par accident, sur un restaurant qui avait pourtant des données.

Un avis dont on ignore la langue **sort du total** : ce n'est pas un avis en
langue étrangère. La proportion se calcule sur les seules preuves disponibles,
et le lissage fait le reste quand elles sont peu nombreuses. Toppoki passe de
`0,500` à `0,645` — 22 français sur 33 identifiables.

La distinction est portée par le code et doit le rester :

```
{"text": "..."}                clé absente  -> on détecte      (mocks, D-003)
{"text": "...", "lang": None}  clé nulle    -> indétectable, écarté
{"text": "...", "lang": "fr"}  clé remplie  -> on la croit
```

### Conséquences

- Sur 10 restaurants collectés (500 avis), l'indicateur passe de **1 valeur
  distincte à 11**, étalées de 0,047 à 0,645. Il classe enfin.
- **458 restaurants sur 468 restent à 0,500** faute d'avis. Le chiffre affiché
  n'est pas faux — c'est l'aveu d'une absence de donnée, correctement traduit
  par le lissage — mais la zone n'est pas exploitable tant que la collecte n'est
  pas complète : **20 478 avis** à 50 par restaurant.
- Le taux d'indétectables n'est pas négligeable : 17/50 sur Toppoki, 0/50 sur
  Casa di Peppe. Il dépend de la longueur typique des avis, donc du public. À
  surveiller : un restaurant dont *tous* les avis seraient indétectables
  retomberait sur l'a priori sans qu'on le distingue d'un restaurant sans avis.
- Le JSON brut de chaque collecte est écrit **avant** l'import. Une donnée payée
  ne doit pas dépendre du bon fonctionnement du code qui la range.

---

## D-041 — Sauvegarder la base, et refuser d'exporter ce qui ne doit pas sortir

**Date :** 14 septembre 2026 · **Statut :** actif

### Contexte

Deux mécanismes touchent au fichier de base : la **sauvegarde** (LS-26), qui
n'existait pas, et l'**export vers un tiers** (`backend/db/export.py`), qui
existait depuis l'envoi de la base à un hébergeur.

### Problème 1 — rien n'était sauvegardé

La base porte 381 cartes lues, 297 prix extraits et 2 100 avis. Les cartes
représentent des heures de récolte et un quota de modèle consommé ; **les avis
ont été payés**. Rien ne se reconstitue en relançant un script : les pages web
changent, et une collecte refaite se refacture.

La tentation est la copie de fichier. Elle est fausse : si une écriture est en
cours, la copie attrape une base à moitié écrite et le journal WAL qui
contiendrait la fin de la transaction reste dans l'autre fichier. Le résultat
s'ouvre et il manque les dernières minutes — la pire forme d'échec, celle qu'on
découvre au moment de restaurer.

### Problème 2 — l'export emportait les comptes utilisateurs

`TABLES_A_VIDER` valait `("reservations", "consultations")`. La liste datait
d'avant l'authentification (LS-28). Depuis, la base porte `users`, `sessions`
et `user_reviews`.

**Un export emportait donc 49 comptes — adresses e-mail et empreintes bcrypt —
chez l'hébergeur, le coéquipier ou le jury.** C'est exactement la fuite que ce
script avait été écrit pour empêcher. Vérifié sur un fichier produit : les
empreintes y étaient.

Ce n'est pas un oubli isolé, c'est une **classe** d'oubli : une liste écrite à
la main se périme à la table suivante.

### Décisions

**1. `sqlite3.Connection.backup()`, pas une copie de fichier.** L'API copie
page à page en tenant compte des transactions en cours. C'est la seule façon
correcte de sauvegarder SQLite à chaud.

**2. Une sauvegarde non vérifiée n'est pas une sauvegarde.** Chaque fichier
produit est rouvert, soumis à `PRAGMA integrity_check`, et ses tables comptées
et comparées à la source. Si la vérification échoue, le fichier est **détruit**
plutôt que conservé sous un nom rassurant.

**3. Trois copies, et on dit ce que ça ne protège pas.** Une rotation locale
protège d'une fausse manœuvre ; elle ne protège **pas** d'une panne de disque,
et pas d'une corruption passée inaperçue une semaine. Le script l'imprime à
chaque exécution plutôt que de laisser croire le contraire. Le corpus d'images
(D-038) n'est pas couvert : il vit hors de la base.

**4. L'export vide toute table nominative — et un garde-fou l'impose.**
`_verifier_nominatives()` parcourt le schéma réel et **interrompt l'export** si
une table porte `user_id`, `email`, `token`, `token_hash` ou `password_hash`
sans être traitée. La règle ne repose plus sur la mémoire de qui ajoutera la
prochaine table : un script qui refuse de tourner vaut mieux qu'un fichier de
données personnelles envoyé par e-mail.

**5. Délier plutôt que vider, quand la ligne décrit un établissement.**
`menu_submissions` documente un restaurant — quelle carte, quand, quelle
empreinte. Seul le lien vers la personne est nominatif : `user_id` passe à
`NULL`, la ligne reste. C'est la règle déjà appliquée à la suppression d'un
compte (D-038).

### Conséquences

- Export vérifié après correction : `users` 49 → 0, `sessions` et
  `user_reviews` vidées, `menu_submissions` 8/8 déliées, **zéro empreinte
  bcrypt** dans le fichier binaire. Les 3 adresses e-mail restantes sont des
  contacts de restaurants issus d'OpenStreetMap — des données publiques
  d'établissements, pas des personnes.
- `reviews` (collecte externe) **rejoint** les tables de données : ce sont des
  avis publics sur des établissements, le matériau de l'indicateur de langue.
  Ils n'ont jamais porté d'identité d'auteur chez nous.
- `data/sauvegardes/` n'est pas versionné : ces copies portent les mêmes
  données personnelles que la base.
- **Toute base exportée avant le 14 septembre 2026 est à considérer comme
  contenant les comptes.** Si un fichier a circulé, il faut le reprendre et le
  remplacer — et les mots de passe concernés sont à changer.

---

## D-042 — Panel d'agents pour la vérité terrain : le pilote mesure un accord négligeable, on n'étend pas

**Date :** 2026-09-17 · **Statut :** actif

### Contexte

`etiquette_finale` est vide sur les 467 lignes de
`docs/data/verite-terrain-quartier-latin.csv`. Tout le reste est prêt : 5 833 avis
collectés sur 458 restaurants (D-040), les quatre indicateurs calculés, et
`backend/core/scoring/calibration.py` en attente. **L'étiquetage est le dernier
verrou du chemin critique.** L'annotation humaine par les cinq membres de l'équipe
(§5.2 du protocole) n'a pas commencé.

Idée évaluée : remplacer les cinq annotateurs humains par cinq agents LLM, chacun
doté d'un profil et d'un modèle distincts, allant chercher l'information sur le web.

### Problème identifié

Trois objections étaient connues avant de lancer, et une quatrième est apparue.

1. **L'accord inter-annotateurs perd son sens** si les cinq juges sont des
   instances corrélées. C'est pourtant le chiffre qui rend un étiquetage
   défendable. Atténuation retenue : cinq profils distincts (riverain, voyageur,
   restaurateur, journaliste food, sceptique) sur trois modèles différents.
2. **Le statut de la donnée change.** Ce ne peut pas être la §5.2 du protocole.
   C'est au mieux une §5.1 enrichie — une pré-annotation, pas une vérité terrain.
3. **La circularité** : lire les avis pour juger, c'est faire dériver l'étiquette
   de l'indicateur `language`. Les quatre interdits du §4 ont donc été inscrits
   dans chaque consigne, et un audit automatique des justifications a été prévu.
4. **Apparu au dépouillement : l'instrument lui-même ne discrimine pas.**

Un choix de protocole a été ajouté : **jugement à l'aveugle**, sans voir la
`proposition` machine ni ses `indices`. Le §6 identifie l'ancrage comme risque
principal ; le supprimer d'emblée donne une mesure d'accord non polluée.

### Ce qui a été mesuré

Pilote sur les 30 premiers rangs, cinq agents, 150 jugements.

| agent | modèle | local | mixte | touristique | ? |
|---|---|---|---|---|---|
| A riverain | Opus | 20 | 8 | 1 | 1 |
| B voyageur | Sonnet | 15 | 9 | 4 | 2 |
| C restaurateur | Sonnet | 12 | 9 | 2 | 7 |
| D journaliste | Opus | 21 | 7 | 1 | 1 |
| E sceptique | Haiku | 21 | 7 | 2 | 0 |

**Accord inter-annotateurs — le résultat principal :**

| mesure | valeur |
|---|---|
| accord observé, toutes paires | 50 % (150/300) |
| accord attendu par hasard | 43 % |
| **kappa de Fleiss, 4 catégories** | **0,118** |
| kappa, 3 catégories, sujets tranchés (n=21) | 0,182 |
| kappa, binaire local / non-local | 0,130 |
| kappa, binaire, sujets sans « je ne sais pas » (n=21) | 0,200 |

Accord par paire de 37 % (B–D) à 77 % (A–D). Sur l'échelle de Landis & Koch,
toutes les variantes tombent en accord **négligeable** à **faible**.

**La cause est identifiée, et ce n'est pas le panel.** 59 % des 150 jugements
disent `local`, 7 % seulement disent `touristique`. La question du §3 — *« si on
retirait tous les touristes de Paris demain, ce restaurant survivrait-il ? »* —
est **asymétrique** : il faut un cas extrême pour répondre « il fermerait ».
Presque tout établissement survit en perdant une partie de son chiffre. La
question est décidable, comme voulu, mais elle ne **sépare** pas.

Deux conséquences se cumulent. L'accord attendu par hasard monte à 43 % du seul
fait du déséquilibre, ce qui écrase le kappa (paradoxe du kappa,
Feinstein & Cicchetti 1990) — mais l'accord observé lui-même n'est que de 50 %,
donc l'effondrement n'est **pas** un simple artefact statistique. Les deux
problèmes sont réels et il faut le dire ainsi.

**Audit des interdits.** Les justifications ont été passées au filtre
automatiquement. Une violation franche de l'interdit n°4 (raisonnement par la
zone) sur 150 jugements, chez l'agent E : *« MAIS rue de la Bûcherie est rue
ultra-touristique face Notre-Dame »*, et *« location disqualifie »* — dans les
deux cas la géographie tranche l'étiquette. Les autres occurrences relevées sont
licites (autoprésentation de l'établissement, description d'un lieu de vie).
C'est le profil « sceptique », qui pousse à chercher des preuves à charge, sur le
modèle le plus léger du panel.

**Face à la pré-annotation machine :** 43 % d'accord sur 23 restaurants
comparables, donc 57 % de désaccord. Non exploitable comme taux de correction au
sens du §6, puisque les agents ne s'accordent eux-mêmes qu'à 50 %.

**Ce qui tient malgré tout :** 4 restaurants unanimes 5/5 et 9 à 4/5. Sur les cas
francs, le panel converge. Le socle solide existe, il est petit.

### Décision

1. **Ne pas étendre aux 467.** Dérouler les 437 restants produirait environ 2 200
   jugements dont l'accord est déjà mesuré comme négligeable. Le pilote a fait
   exactement ce qu'on lui demandait : il a coûté 150 jugements et en a évité
   2 200 inutilisables.
2. **Les étiquettes produites ne sont pas importées en base.** Aucun `label`
   n'est écrit. Le jeu reste vide plutôt que rempli de bruit.
3. **La cause identifiée est l'instrument, pas les annotateurs.** La question du
   §3 doit être remplacée avant toute nouvelle campagne, humaine ou non.
4. **Tout est conservé et versionné** dans `docs/data/annotation-pilote/` : les
   cinq annotations brutes avec justifications et sources, le consolidé, le lot
   soumis et le script de consolidation. Le résultat est négatif, il est publiable
   tel quel.

### Conséquences

- **Le chemin critique reste bloqué au même endroit**, mais on sait maintenant
  pourquoi, avec un chiffre. C'est un progrès réel : « notre question
  d'annotation ne sépare pas, kappa = 0,118 » est défendable ; « on a annoté 467
  restaurants » sans ce chiffre ne l'était pas.
- **Piste recommandée pour la suite : la comparaison par paires.** Au lieu d'une
  étiquette absolue, demander « entre A et B, lequel dépend le plus des
  visiteurs ? ». L'accord sur des comparaisons est structurellement plus élevé que
  sur des classes, et l'agrégation (Bradley-Terry, ou Elo) produit **directement
  le classement continu** que cherche la §5.3 du protocole — et dont
  `precision@10` a besoin. Le détour par trois classes était peut-être le
  problème depuis le début.
- **Piste secondaire :** reformuler avec un seuil quantifié — « quelle part du
  chiffre d'affaires vient des visiteurs ? » en tranches. Force la discrimination
  mais demande une estimation que l'annotateur ne peut pas faire de façon fiable.
- **À corriger dans la donnée source :** le rang 23 est nommé « Atelier Carmen »
  dans OSM ; l'établissement au 5 rue du Pot de Fer est « L'Atelier Carnem ».
  Trouvé indépendamment par deux annotateurs.
- **Si une campagne par agents est reprise**, écarter le profil « sceptique » sous
  sa forme actuelle, ou le maintenir sur un modèle capable de tenir une consigne
  négative — c'est lui qui a produit la seule violation d'interdit mesurée.
- `docs/methodologie/verite-terrain.md` est mis à jour en conséquence (§5.4).

---

## D-043 — La comparaison par paires remplace l'étiquetage en classes

**Date :** 2026-09-17 · **Statut :** actif · **Remplace l'instrument de** [D-042](#d-042)

### Contexte

D-042 a mesuré un kappa de Fleiss de **0,118** sur l'étiquetage en trois classes
et identifié la cause : la question du §3 — *« si on retirait tous les touristes,
ce restaurant survivrait-il ? »* — est asymétrique. 59 % des jugements tombaient
sur `local`. Elle est décidable, elle ne sépare pas.

### Problème identifié

Deux problèmes distincts, traités ensemble parce qu'ils ont la même racine — on
demandait à l'annotateur un jugement absolu sur des informations non contrôlées.

1. **L'instrument ne discrimine pas.** Une classe absolue exige que deux
   annotateurs placent la même frontière au même endroit. C'est beaucoup
   demander, et inutile : ce que le projet veut produire est un **classement**,
   pas une taxonomie.
2. **Les interdits reposaient sur une consigne.** D-042 a mesuré ce que vaut une
   consigne : un annotateur faisant basculer son étiquette sur « rue
   ultra-touristique face Notre-Dame ».

### Décision

**Trois changements, appliqués ensemble.**

**1. La question devient relative.** *« Lequel de ces deux restaurants dépend le
plus de la clientèle de passage ? »* Il n'y a pas de réponse par défaut : on ne
peut pas répondre `local` soixante fois de suite.

**2. Le dossier remplace la consigne** (`backend/db/dossier_annotation.py`).
L'annotateur ne reçoit plus une fiche complète assortie d'interdits : il reçoit
un dossier d'où les quatre indicateurs ont été **retirés**. « Ces informations
étaient absentes du dossier » est vérifiable ; « nous avions interdit ce
raisonnement » ne l'est pas. Effet secondaire décisif : **l'annotation devient
reproductible**, puisqu'elle ne dépend plus de ce que le web renvoyait ce jour-là.

**3. Le plan de comparaison est construit, pas tiré au hasard**
(`backend/db/paires.py`). k permutations refermées en cycle : graphe connexe par
construction — un tirage aléatoire risquerait deux groupes jamais comparés, donc
deux classements sans échelle commune. Coût k×n au lieu de n(n−1)/2, chaque objet
vu exactement 2k fois. Graine fixe, plan rejouable. L'ordre gauche/droite est
tiré **indépendamment par annotateur**, ce qui neutralise le biais de position et
permet de le mesurer.

L'agrégation est un Bradley-Terry régularisé (`backend/db/bradley_terry.py`),
descente de gradient à la main comme `calibration.py`, pour les mêmes raisons.

### Ce qui a été mesuré

Même panel qu'en D-042 — mêmes profils, mêmes modèles — pour n'isoler qu'une
variable : l'instrument. 30 restaurants, 86 duels, 430 jugements.

| panel | accord observé | kappa |
|---|---|---|
| *D-042, étiquetage 3 classes* | *50 %* | *0,118 — négligeable* |
| A+B+C+D+E | 71 % | **0,423 — modéré** |
| A+B+C+D (sans l'annotateur contaminé) | 76 % | **0,519 — modéré** |
| A+B+D | 80 % | **0,605 — substantiel** |

**Biais de position : aucun.** 42 % à 57 % de réponses « celui de gauche », tous
sous le seuil d'alerte. La randomisation par annotateur a fait son travail.

**Un champ n'est pas neutre parce qu'on l'a jugé neutre.** `photos_count`
figurait dans la première version du dossier : il semblait décrire l'activité
d'un lieu. L'audit des justifications a montré que l'annotateur E en avait fait
**98 % de ses motifs** — contre 13 % pour A et 1 % pour D — et que son accord
avec les autres chutait d'autant (58–66 % contre 74–84 %). Le nombre de photos
est un proxy de notoriété, au même titre que `review_count` : un restaurant
invisible a peu de photos **parce qu'il est invisible** (D-001). Le champ a été
retiré du module. La leçon générale est écrite dans le code : un champ est neutre
quand on a regardé ce que les annotateurs en font, pas quand on l'a décrété.

### Le résultat qui compte pour le mémoire

Corrélation de Spearman entre le classement de la vérité terrain et le score
actuel, sur les 30 restaurants :

| | poids | rho | couverture |
|---|---|---|---|
| **`local_signal` (score global)** | — | **+0,081** · IC95 % [−0,29 ; +0,43] | 30/30 |
| menu | 0,40 | +0,266 | 22/30 |
| langue | 0,30 | −0,003 | 30/30 |
| prix | 0,15 | **+0,459** | 16/30 |
| zone touristique | 0,15 | +0,112 | 30/30 |

**Le Local Signal actuel n'a aucun pouvoir prédictif mesurable** sur ce pilote.
Le résultat est robuste au choix du panel (+0,006 à +0,081 selon les
combinaisons). Le classement machine de `classement.py`, construit sur les
attributs Google, fait mieux (+0,324).

**Et la pondération semble inversée.** Les deux indicateurs qui portent 0,45 du
poids — langue et zone — ne corrèlent pas. Celui qui corrèle le mieux, le prix,
en porte 0,15 et n'est couvert qu'à 53 %.

**Trois réserves, à écrire dans le mémoire plutôt qu'à laisser trouver.**
n = 30 : tous les intervalles de confiance contiennent zéro, aucune corrélation
n'est significative isolément. Les corrélations marginales ne donnent pas les
coefficients d'une régression multiple. Et la vérité terrain est ici **agentique,
pas humaine** — voir ci-dessous.

### Conséquences

- **L'instrument est validé, la vérité terrain ne l'est pas.** Un kappa de 0,423
  à 0,605 rend la campagne exploitable ; il ne transforme pas cinq agents en
  cinq humains. Ce qui est établi, c'est que **la question par paires fonctionne
  là où la question par classes échouait** — et ce constat vaut pour le panel
  humain, qui devrait adopter le même instrument.
- **Aucune étiquette n'est entrée en base.** Le classement produit est un jeu de
  référence candidat, pas un `label`.
- **La calibration est désormais justifiée par une mesure**, plus seulement par
  un principe : « avant calibration, rho = +0,08 » est le point de départ dont
  le chapitre avait besoin.
- **Étendre aux 467** coûterait, au même plan (k=3), environ 1 400 duels par
  annotateur. C'est la décision suivante, et elle demande un arbitrage de budget.
- Tout est versionné dans `docs/data/annotation-pilote/`.

---

## D-044 — Séparer la collecte du jugement, et ce que le web apporte vraiment

**Date :** 2026-09-17 · **Statut :** actif · **Complète** [D-043](#d-043)

### Contexte

D-043 a validé la comparaison par paires, mais sur des dossiers construits
**uniquement depuis la base** : j'avais coupé l'accès au web pour gagner la
reproductibilité. C'était un arbitrage non demandé — l'intention initiale était
que les annotateurs croisent la base **et** des sources extérieures.

### Problème identifié

Faire chercher le web à chaque duel est intenable : sur 467 restaurants au plan
k=3, cela ferait environ 7 000 recherches. Et une annotation adossée à des
recherches faites en direct n'est pas rejouable — ce que le web renvoie
aujourd'hui, il ne le renverra pas dans six mois.

### Décision

**Séparer la collecte du jugement**, en deux phases.

**Phase 1 — des documentalistes.** Une recherche web **par restaurant**, pas par
duel : 467 recherches au lieu de 7 000. Leur consigne tient en une règle —
**ils observent, ils ne jugent pas**. Ils rapportent presse francophone, guides
pour visiteurs, site officiel, réseaux sociaux, avec les URL, et écrivent
« aucune mention trouvée » quand il n'y a rien. C'est le principe de D-014
appliqué à une autre tâche : le modèle qui observe n'est pas celui qui note.

**Phase 2 — les juges.** Les mêmes duels, sur le dossier enrichi. Le dossier
étant figé une fois pour toutes, **l'annotation reste rejouable** : on garde les
deux avantages au lieu de choisir.

### Ce qui a été mesuré

Trois conditions sur les 30 mêmes restaurants, même panel, mêmes 86 duels.

| condition | base | web | accord | kappa |
|---|---|---|---|---|
| 1 — étiquettes en 3 classes | non | oui | 50 % | 0,118 |
| 2 — duels | oui | non | 76 % | 0,519 |
| **3 — duels enrichis** | **oui** | **oui** | **83 %** | **0,655 — substantiel** |

*(panels A+B+C+D ; E écarté, voir plus bas)*

**Le web apporte de l'information, il n'ajoute pas du bruit.** Chaque annotateur
a révisé environ **27 % de ses duels**, et l'accord entre eux a **monté**. Du
bruit produirait l'inverse : beaucoup de changements, moins d'accord. L'accord
A–D passe de 84 % à 90 %.

**Le classement final en est nettement modifié** : les deux classements ne
corrèlent entre eux qu'à **rho = +0,562**. Le choix des sources n'est donc pas un
réglage de second ordre, il déplace le résultat — et doit être documenté comme
tel dans le mémoire.

**Ce qui n'a pas bougé : le score.**

| | condition 2 | condition 3 |
|---|---|---|
| `local_signal` | +0,037 | **+0,007** |
| menu (0,40) | +0,229 | +0,057 |
| langue (0,30) | −0,037 | +0,097 |
| prix (0,15) | +0,397 | +0,232 |
| zone (0,15) | +0,055 | +0,047 |

Le Local Signal n'a de pouvoir prédictif dans aucune des deux conditions. Le
résultat de D-043 est donc **robuste à la façon de construire la vérité
terrain**, ce qui le renforce.

Une crainte a été levée au passage : le nombre de langues d'un site officiel
étant proche de l'indicateur menu, on pouvait redouter que la campagne web gonfle
artificiellement la corrélation du menu. C'est l'inverse qui se produit —
+0,229 → +0,057. Mieux informés, les annotateurs s'**éloignent** de ce que mesure
la carte.

### Trois observations de terrain, à conserver

**Le faux signal du site multilingue.** Trois établissements déclinent leur site
dans une liste de langues quasi identique : c'est un **template de prestataire
web**, pas un choix éditorial. Un annotateur s'en est servi pour reclasser deux
restaurants, un autre l'a repéré et neutralisé. À écarter explicitement des
consignes de la campagne complète.

**Une hypothèse séduisante et fausse.** Un annotateur a affirmé que la presse
food francophone favorise les restaurants français au détriment des cuisines
étrangères — ce qui, si c'était vrai, invaliderait la couverture différentielle
du README. Vérifié : **44 % de couverture pour les cuisines européennes, 42 %
pour les autres.** L'hypothèse ne tient pas sur ce corpus. À reposer sur 467, où
les effectifs le permettront.

**La couverture différentielle ne fonctionne que d'un côté.** 13 restaurants sur
30 ont une mention en presse francophone, 5 en guides pour visiteurs. La
soustraction `presse locale − guides touristiques` se réduit donc en pratique à
`presse locale`, ce qui rouvre le biais de notoriété que D-001 interdit. À dire,
et à ne pas utiliser seul.

### L'annotateur E, trois échecs, trois causes

| campagne | mode d'échec |
|---|---|
| 1 | viole l'interdit n°4 — « rue ultra-touristique face Notre-Dame » tranche son étiquette |
| 2 | fonde 98 % de ses jugements sur le nombre de photos, un proxy de notoriété |
| 3 | **comprend la question à l'envers** — son rapport écrit « B = dépend MOINS », la question demandait le plus |

En condition 3 son accord tombe à 43–47 %, c'est-à-dire **sous le hasard**.
Inverser mécaniquement ses réponses ne le sauve pas (57 % au mieux) : la
confusion est inconsistante, pas systématique. C'est le seul agent du panel sur
le modèle le plus léger.

**Décision : E est écarté des mesures de D-044**, et le profil « sceptique » sur
modèle léger ne doit pas être reconduit. Ses fichiers restent versionnés — un
échec documenté vaut mieux qu'un échec effacé.

### Conséquences

- **L'architecture en deux phases est ce qui rend les 467 atteignables.** Sans
  elle, le coût en recherches web est prohibitif.
- **Avant la campagne complète, un nettoyage s'impose.** Audit sur les 467 :
  47 sans adresse, 37 sans horaires, 54 jamais appariés à Google, **26 cumulant
  les trois** — inannotables en l'état. Et l'audit technique ne voit pas les
  erreurs d'identité : sur 30 restaurants, les documentalistes ont signalé
  **14 doutes** (homonymes, noms erronés). Cas avéré : *La Cava Voltini*, en
  liquidation judiciaire depuis le 06/02/2026, donc probablement fermée.
- **Le classement de référence retenu** est celui de la condition 3, panel
  A+B+C+D — `docs/data/annotation-pilote/classement-web.csv`.

---

## D-045 — La campagne sur la zone : 328 restaurants classés, et ce que le score vaut face à eux

**Date :** 2026-09-18 · **Statut :** actif · **Applique** [D-043](#d-043) et [D-044](#d-044)

### Contexte

D-044 avait validé l'instrument sur 30 restaurants : comparaison par paires,
dossier d'où les quatre indicateurs sont retirés, recherche web séparée du
jugement. Restait à l'appliquer à la zone.

### Ce qui a été fait

**Trois étapes, dans cet ordre.**

**Nettoyage.** Géocodage inverse OpenStreetMap sur les 47 restaurants sans
adresse : 47/47 retrouvées, base sauvegardée avant écriture. Audit de la zone :
403 fiches propres sur 467, 26 cumulant trois défauts.

**Collecte web.** 467 fiches, une recherche **par restaurant** et non par duel —
467 recherches au lieu des ~7 000 qu'aurait coûtées l'autre méthode. C'est ce
découpage qui rend l'échelle atteignable. Couverture : site officiel 93 %,
guides visiteurs 30 %, presse francophone 25 %, réseaux sociaux 29 %.

**Jugement.** Plan en 15 blocs de 40 restaurants se chevauchant de 8 — les 112
restaurants partagés servent d'ancres et alignent les échelles. Graphe vérifié
connexe (une seule composante de 467 nœuds). **10 blocs sur 15 ont été traités :
3 132 jugements, 328 restaurants classés.**

### Ce qui a été mesuré

| | valeur |
|---|---|
| restaurants classés | **328 / 467 (70 %)** |
| jugements | 3 132 |
| accord observé | 86 % |
| **kappa global** | **0,713 — substantiel** |

**Le score face à la vérité terrain** (Spearman, n = 328) :

| indicateur | poids | rho | IC 95 % |
|---|---|---|---|
| **`local_signal`** | — | **+0,234** | [+0,129 ; +0,334] |
| menu | **0,40** | +0,121 | [−0,002 ; +0,241] — **non significatif** |
| **langue** | 0,30 | **+0,501** | [+0,416 ; +0,578] |
| prix | 0,15 | +0,254 | [+0,123 ; +0,376] |
| zone touristique | 0,15 | +0,049 | [−0,059 ; +0,157] — **non significatif** |

**Le score prédit, et c'est acquis** : l'intervalle exclut zéro, ce qui n'était
pas le cas sur le pilote de 30. **Mais la pondération est mal répartie** : les
deux indicateurs qui portent 0,55 du poids ne sont pas significatifs, et la
langue porte presque tout le signal à elle seule.

**L'échantillon est suffisant.** Entre n = 168 et n = 328, le score global passe
de +0,300 à +0,234 et la langue de +0,508 à +0,501. Les 139 restaurants restants
resserreraient les intervalles sans changer les conclusions — ce qui justifie de
s'arrêter à 70 % plutôt que d'épuiser le budget.

### Le modèle d'annotation compte, et plus que la consigne

C'était une hypothèse, elle a été testée.

| blocs | configuration | kappa |
|---|---|---|
| 01–02 | Sonnet, consigne permissive sur les égalités | 0,696 / 0,232 |
| 03–08 | **Opus** | 0,778 à **0,957** |
| 09 | panel mixte | 0,584 |
| 10 | **Sonnet, consigne corrigée** | **0,536** |

Le bloc 02 s'était effondré à 0,232 avec 30 duels sur 76 portant une égalité. J'ai
attribué cette chute à la consigne et l'ai resserrée. Le bloc 10 montre que
**c'était surtout le modèle** : à consigne identique, Sonnet plafonne à 0,536 là
où Opus tient 0,78–0,96. Les blocs portent des restaurants différents, donc ce
n'est pas un test parfaitement contrôlé — mais l'écart est net sur dix blocs.

**Conséquence : les campagnes futures se font en Opus.** Haiku est exclu (trois
modes d'échec distincts, D-042 et D-044).

### Deux défauts de données découverts par les annotateurs

**Un bug dans le générateur de dossiers.** La source encode un jour fermé par la
chaîne `"Fermé"`, pas par une liste vide. Le module comptait donc ces jours comme
ouverts : **56 restaurants sur 467** étaient annoncés « ouverts 7 jours sur 7 »
alors qu'ils ferment un ou deux jours — et c'est le signal que les annotateurs
utilisent en priorité. Repéré par un juge voyant le résumé contredire le détail,
corrigé au bloc 10. La version soumise aux blocs 1–9 est archivée sous
`dossiers-v1-avec-bug-horaires.json` : la campagne reste rejouable et l'écart
mesurable.

**Des avis échangés entre établissements.** Trois paires identifiées par
recoupement entre juges : Li Thang / Anatolie Dürüm, Le Mékong / CROUS Censier,
et un restaurant nommé « Dame » portant les avis de **la cathédrale Notre-Dame**.
Ce n'est pas anecdotique : c'est un défaut d'appariement de la collecte Outscraper,
et il faut le chercher systématiquement avant d'exploiter les avis. L'inventaire
est dans `docs/data/annotation-pilote/dossiers-douteux.md`.

### Une circularité à ne pas créer

Les horaires corrèlent fortement avec le classement (service continu : rho =
+0,765, bien au-dessus de tous les indicateurs du modèle). **C'est circulaire** :
les horaires figuraient dans le dossier et les juges déclarent tous s'en être
servis en priorité. Mesurer cette corrélation, c'est mesurer qu'ils ont appliqué
leur propre méthode.

Cela éclaire en revanche la valeur du dispositif : les **quatre indicateurs du
modèle**, eux, ont été retirés du dossier par construction. Leurs corrélations
sont propres. Si un indicateur « régime d'exploitation » devait être ajouté un
jour, il faudrait une campagne où les horaires sont masqués.

### Conséquences

- **La recalibration est débloquée** — c'était l'objectif de D-006 et LS-09.
- **L'importeur et le module de calibration sont à adapter** : ils attendent trois
  classes, le classement est continu. Voir `docs/REPRENDRE-ICI.md` §2.
- **Le menu et la zone touristique sont à rouvrir.** Le menu pèse 0,40 sans être
  significatif ; la zone est gelée depuis D-027 et ne prédit rien.
- **La vérité terrain reste agentique.** Un sous-échantillon validé par des
  humains reste la condition pour la présenter comme vérité terrain au sens plein.
- `docs/REPRENDRE-ICI.md` est le point d'entrée pour toute reprise du chantier, et
  `CLAUDE.md` y renvoie en tête.

---

## D-046 — Les pondérations dérivées, et pourquoi on ne les adopte pas telles quelles

**Date :** 22 septembre 2026 · **Statut :** actif

### Contexte

Le classement par paires (D-042 à D-045) a produit une vérité terrain continue :
360 restaurants ordonnés, `theta` de Bradley-Terry, kappa 0,717. L'objectif de
D-006 devenait enfin atteignable — **dériver les quatre pondérations au lieu de
les poser à la main**.

`backend/core/scoring/recalibration.py` : moindres carrés sur indicateurs
centrés-réduits, cible `−theta` (plus haut = plus local), intervalles par
rééchantillonnage, et surtout **validation hors échantillon**.

### Résultat

| indicateur | poids actuel | poids dérivé | intervalle 90 % | rho seul |
|---|---|---|---|---|
| carte du restaurant | 0,40 | **0,13** | [0,00 ; 0,29] | +0,135 |
| langue des avis | 0,30 | **0,87** | [0,67 ; 1,00] | +0,457 |
| prix face au quartier | 0,15 | **0,00** | [0,00 ; 0,12] | **−0,062** |
| hors zone touristique | 0,15 | **0,00** | [0,00 ; 0,03] | +0,061 |

Et l'amélioration est **établie hors échantillon**, ce qui est le seul test qui
compte :

```
pondération actuelle    rho = +0,277
pondération dérivée     rho = +0,470
gain hors échantillon   +0,173  [+0,041 ; +0,307]   positif dans 99 % des partages
```

L'intervalle exclut zéro. Ce n'est pas un effet d'apprentissage sur ses propres
données : la pondération dérivée prédit réellement mieux.

### Le problème, et il est sérieux

**Trois indicateurs sur quatre s'effondrent, et la langue absorbe tout.**

Le prix a même une corrélation **négative** (−0,062) : il pousse vers
« touristique » là où le score le compte comme un signe de localité. Son poids
est mis à zéro plutôt qu'inversé — un indicateur qui pointe à l'envers ne se
répare pas en le pondérant, il se comprend d'abord.

Adopter ces poids reviendrait à faire du Local Signal **un indicateur de
proportion d'avis en français, et rien d'autre**. Or :

**Un restaurant sans avis n'aurait plus de score du tout.** L'indicateur de
langue rend alors l'a priori `0,500`, et avec un poids de 0,87 le score entier
devient cet a priori. C'est-à-dire que le modèle cesserait de fonctionner
exactement pour les restaurants que le projet existe pour révéler (D-001, la
contrainte n°1 du projet).

### Et le biais de l'échantillon de calibration

**130 restaurants sur 360 ont été écartés** faute d'indicateur complet. Ils ne
sont pas un tirage au hasard :

| | médiane des avis Google | médiane du `theta` |
|---|---|---|
| retenus (230) | **915** | +0,016 |
| écartés (130) | **264** | −0,051 |

Les deux écarts sont significatifs (p = 1,6·10⁻¹⁷ pour la notoriété, p = 0,011
pour la localité). **Les restaurants écartés sont moins connus ET plus locaux.**

C'est le paradoxe de l'invisibilité reparu à l'intérieur de la calibration
elle-même : on dérive des poids sur les établissements bien documentés, et on
les appliquerait à ceux qui ne le sont pas.

### Décision

**Les poids dérivés sont publiés comme résultat, pas appliqués au produit.**

`config.py` reste à 0,40 / 0,30 / 0,15 / 0,15. Ce qui est acquis et rapportable :

1. La méthode fonctionne — la pondération dérivée prédit mieux, hors échantillon,
   et c'est mesuré.
2. **Deux indicateurs sur quatre n'expliquent rien**, et le prix va à l'envers.
   C'est un résultat, pas un échec : il dit où porter l'effort.
3. La calibration ne peut pas se faire sur les seuls cas complets sans
   reproduire le biais que le projet combat.

### Conséquences

- Le mémoire rapporte **les deux pondérations** et l'écart entre elles, pas une
  seule présentée comme la bonne.
- Le signal menu, qui porte 0,40 et ne corrèle qu'à +0,135, doit être réexaminé :
  soit l'indicateur est mal construit, soit les cartes récoltées sur le web ne
  disent pas ce qu'on croit. C'est le chantier suivant, pas une retouche de poids.
- Le prix négatif demande une explication avant toute correction. Hypothèse à
  tester : dans le Quartier latin, les adresses bon marché sont aussi les plus
  tournées vers le passage (kebabs, crêperies de rue), ce qui inverserait le
  signe attendu.
- Toute recalibration future doit rapporter **la composition de son échantillon**,
  pas seulement ses coefficients.

---

## D-047 — Un indicateur faible est-il mauvais, ou mal mesuré ?

**Date :** 22 septembre 2026 · **Statut :** actif

### Contexte

La calibration (D-046) rend 0,13 sur le menu et 0,87 sur la langue. Objection
posée en revue : le menu ne prédit peut-être pas parce qu'on le **mesure mal
aujourd'hui** — quelques photos par restaurant, pas de menus soumis par les
utilisateurs, pas encore d'interface restaurateur. Caler les poids sur cette
pauvreté reviendrait à la graver dans le produit.

L'objection est sérieuse et **testable** : si le menu est faible par défaut de
mesure, il doit mieux prédire là où on le mesure bien.

### Mesure

| sous-groupe | n | rho contre la vérité terrain |
|---|---|---|
| menu, 1 à 2 photos (mal mesuré) | 73 | −0,063 |
| menu, 4 photos ou plus | 151 | +0,143 |
| **menu, 5 photos ou plus (le mieux mesuré)** | 94 | **−0,028** |
| langue, 9 avis ou moins | 320 | **+0,484** |
| langue, 40 avis ou plus | 32 | +0,316 |

**Mieux mesurer le menu ne le fait pas mieux prédire.** Là où la carte est la
plus complète, la corrélation est nulle. Et la langue prédit déjà fortement avec
neuf avis : elle n'attend pas d'en avoir cinquante.

**Réserve, à rapporter avec le résultat :** « plus de photos » n'est pas
exactement « mieux mesuré ». Le nombre de photos corrèle lui-même avec la
notoriété (rho −0,133 avec la localité), donc les sous-groupes diffèrent
systématiquement. Le test est indicatif, pas décisif.

### Défaut trouvé au passage

L'indicateur menu corrèle à **−0,201** (p = 1,4·10⁻⁴) avec le simple **nombre de
photos disponibles**. Un restaurant à une photo rend 8 plats médians, à cinq
photos 52 — et l'amplitude de la carte entre dans le score. Une part de
l'indicateur mesure donc **combien Google avait de photos**, pas ce qu'il y a sur
la carte. C'est un défaut de construction, et il rend l'indicateur moins fiable,
pas plus.

### Décision

**La pondération retenue est un PARI PRODUIT, pas le résultat de la
calibration — et elle est nommée comme tel.**

La calibration dit ce que les données disent aujourd'hui. Le produit, lui, est
construit pour un moment où les menus seront soumis par les utilisateurs et par
les restaurateurs eux-mêmes. Une pondération à 0,87 sur la langue serait fragile
à ce changement, et retirerait au menu toute chance de faire ses preuves —
un indicateur à poids nul n'est plus mesuré, donc ne peut plus jamais remonter.

Le coût de chaque pari est mesuré et affiché
(`backend/core/scoring/arbitrage_poids.py`) :

| pondération | menu | langue | prix | zone | rho |
|---|---|---|---|---|---|
| actuelle | 0,40 | 0,30 | 0,15 | 0,15 | +0,277 |
| **pari retenu** | **0,30** | **0,50** | **0,10** | **0,10** | **+0,394** |
| plancher 0,10 (calibré) | 0,18 | 0,62 | 0,10 | 0,10 | +0,407 |
| calibration brute | 0,13 | 0,87 | 0,00 | 0,00 | +0,470 |

Le pari récupère **61 % de l'écart disponible** tout en gardant le menu à 0,30.

### Conséquences

- Le mémoire présente **les deux** : la pondération calibrée (ce que les données
  disent) et la pondération retenue (ce que le produit fait), avec l'écart de
  rho entre elles. Présenter la seconde comme un résultat de calibration serait
  faux.
- Le défaut du nombre de photos doit être corrigé avant toute nouvelle
  calibration du menu : tant qu'il est là, l'indicateur mesure en partie la
  documentation disponible.
- Le pari devra être **réévalué** quand les menus soumis arriveront. C'est une
  hypothèse datée, pas une constante.

---

## D-048 — Import partiel du dump `C:\slop` : comptes et consultations, pas restaurants/menus

**Date :** 2026-09-22 · **Statut :** actif

### Contexte

Un coéquipier a exporté six tables depuis une instance Postgres/Supabase
séparée (`users`, `sessions`, `consultations`, `tourist_sites`, `menus`,
`restaurants`, horodatées `202609151210`) et les a transmises en dehors du
dépôt (`C:\slop`, hors suivi Git). La demande initiale était formulée comme
« les tables que je n'ai pas » — en réalité les six tables existaient déjà
dans `backend/db/models.py` et dans `local_signal.db`, avec des données : la
base locale portait déjà 58 comptes, 60 sessions, 130 consultations, 677
sites touristiques, 10 642 restaurants et 1 149 menus.

### Problème identifié

Deux dangers concrets, vérifiés avant toute exécution :

1. **Le dump `sessions` référence des `user_id` (1, 2) propres à l'instance
   Postgres d'origine.** En local, ces identifiants appartenaient déjà à
   d'autres comptes (`nouveau0@test.fr`, `nouveau1@test.fr`). Rejouer le SQL
   tel quel aurait attaché les jetons de session de Sebastian et Fares à de
   mauvais comptes locaux.
2. **`restaurants.sql` (8,7 Mo) et `menus.sql` (1,7 Mo) sont un instantané du
   15/09**, antérieur au travail d'annotation et de recalibration en cours
   (D-043 à D-047, poursuivi les 17-18/09). Les rejouer aurait écrasé des
   scores et labels locaux plus récents par une version périmée.

### Décision

**Import scindé, pas d'exécution brute du dump.**

- `users` et `consultations` : exécutés tels quels (pas de référence croisée
  fragile) — 2 comptes et 35 consultations ajoutés.
- `sessions` : les 3 lignes du dump sont réinsérées avec le `user_id` **remappé**
  vers les identifiants réellement attribués aux deux nouveaux comptes lors de
  l'import local, pas ceux du dump.
- `restaurants.sql`, `menus.sql`, `tourist_sites.sql` : **non importés**.
  Périmés par rapport à l'état local, et hors du périmètre réel de la demande
  (« comptes utilisateurs »).
- Sauvegarde de `local_signal.db` prise avant l'opération, retirée du dépôt
  après vérification (le nom ne matchait pas `*.db` dans `.gitignore`).

### Conséquences

- `backend/config.py` porte déjà `DATABASE_URL` : si l'équipe bascule un jour
  sur l'instance Postgres/Supabase du coéquipier plutôt que d'y réimporter des
  fragments, c'est la bascule normale, pas un nouvel import.
- Si `restaurants.sql`/`menus.sql` doivent un jour être exploités (comparaison,
  audit), le faire dans une base à part — jamais un `executescript` direct sur
  `local_signal.db`, dont l'état a déjà divergé de ce dump.
- Prochain chantier annoncé par l'utilisateur : types de comptes (admin,
  utilisateur normal, utilisateur abonné) sur la table `users` déjà en place.

---

## D-049 — Rôles de compte et fonctionnalités « visibles mais verrouillées »

**Date :** 2026-09-22 · **Statut :** actif

### Contexte

Suite du chantier annoncé en D-048 : le produit a maintenant trois rôles
(`user`, `subscriber`, `admin`, colonne `users.role`), un modèle économique
explicite (abonnement + publicité future, à rechercher séparément) et une
page de tarification. Il fallait décider comment un compte non abonné doit
percevoir les fonctionnalités réservées, et si le scoring lui-même — jusqu'ici
protégé de toute logique de popularité (D-001, D-007) — pouvait devenir un
critère de filtrage commercial sans trahir cette règle.

### Problème identifié

Deux écueils à éviter :

1. **Faire disparaître une fonctionnalité payante** ne donne aucune raison de
   payer — un visiteur qui ne sait pas qu'un filtre existe ne le regrette
   jamais. Mais la **simuler comme fonctionnelle** sans paiement réel reproduit
   l'erreur déjà corrigée sur le bouton d'abonnement (retour utilisateur :
   *« bloque juste le bouton, ça marche pas »*, page Pricing.jsx).
2. **Filtrer sur le Local Signal** ressemble, en surface, à filtrer sur la
   note — exactement ce que `criteres.py` interdit depuis D-034 (*« reviendrait
   à refaire le tri par popularité que le projet existe pour éviter »*). Il
   fallait distinguer les deux : la note mesure la popularité, le Local Signal
   mesure l'inverse — l'authenticité indépendamment du volume d'avis (D-001).
   Filtrer dessus ne réintroduit donc pas le biais que D-034 écarte, il en est
   la traduction directe en fonctionnalité produit.

### Décision

**Un abonnement lève des limites, il ne débloque pas des fonctions cachées.**
Toute fonctionnalité réservée reste **visible** pour un compte non abonné,
dans un état clairement non actionnable (icône de cadenas, couleur distincte,
titre explicite), et le clic redirige vers l'abonnement plutôt que vers une
erreur ou vers l'action réelle :

- **Favoris** (`favorites`, `_require_abonne`) : le cœur sur une carte ou une
  fiche est visible dès qu'on est connecté ; pour un non-abonné, il redirige
  vers `Pricing` au lieu d'appeler l'API.
- **Filtre « Profil local uniquement »** (`Filtres.jsx`,
  `backend/core/filters/criteres.py::appliquer`) : premier filtre du produit
  assis directement sur le Local Signal plutôt que sur un critère dérivé
  (horaires, prix, présence de carte). Réservé aux abonnés par décision
  produit, pas par sensibilité de la donnée — le paramètre `profil_local` est
  simplement **ignoré côté serveur** pour un compte non abonné qui le forcerait
  dans l'URL, sans lever d'erreur : le verrou est commercial, pas un contrôle
  d'accès à protéger.
- **Facturation dans Paramètres** (mensualité, moyen de paiement, « changer de
  carte ») : affichée en intégralité mais **non actionnable**, exactement le
  traitement déjà choisi pour le bouton de Pricing.jsx. La résiliation reste
  réelle (`/api/subscribe/annuler`) : c'est le mécanisme de démonstration du
  rôle, pas un paiement.

**Seuils du verdict dupliqués côté serveur.** `criteres.py` reprend les
constantes `SEUIL_PROFIL_LOCAL = 70` / confiance minimale `0.4` de
`apps/web/src/lib/display.js::verdict`, avec renvoi explicite en commentaire.
Même mécanisme de copie assumée que `packages/shared/filtres.js` pour les
bornes de budget (D-022, LS-15) : le backend ne peut pas importer un module
JS, et une divergence silencieuse produirait un filtre qui n'exclut pas les
mêmes restaurants que ce que la carte affiche. **Ces seuils restent
PROVISOIRES (D-006)** : recalibrer l'un impose de recalibrer l'autre.

### Conséquences

- Le motif « visible, verrouillé, redirige vers l'abonnement » est désormais
  établi pour toute future fonctionnalité réservée — pas besoin de redébattre
  le principe à chaque nouvelle limite (ex. alertes, favoris avancés).
- `packages/shared/filtres.js` porte `profilLocal` dans `FILTRES_VIDES` et
  `compterFiltres` ; la copie mobile générée l'hérite mécaniquement mais
  l'interface mobile ne l'expose pas encore (mobile hors périmètre de cette
  session).
- Si les seuils de verdict sont un jour recalibrés sur le jeu labellisé
  (§10, méthodologie), **`backend/core/filters/criteres.py` doit être mis à
  jour dans le même geste** que `lib/display.js`, sous peine d'un filtre
  incohérent avec l'étiquette affichée sur les cartes.
- Aucun paiement réel n'existe encore : `changer de carte` et la mensualité
  affichée dans Paramètres sont de la maquette, à rebrancher le jour où un
  vrai processeur de paiement (Stripe ou équivalent) est intégré — décision
  explicitement différée (question posée à l'utilisateur, réponse : maquette
  bloquée plutôt qu'intégration réelle maintenant).

---

## D-050 — Le score redevient visible ; le filtre premium devient une fourchette

**Date :** 2026-09-22 · **Statut :** actif · **SUPERSÈDE D-009** pour la
visibilité du chiffre ; affine le filtre premium introduit en D-049.

### Contexte

D-049 (même journée) posait un premier filtre premium booléen
(« Profil local uniquement ») et gardait le score caché derrière le mot du
verdict, conformément à D-009. En le voyant à l'usage, l'utilisateur (product
owner du mémoire) est revenu sur les deux points : un simple bouton
marche/arrêt sur le Local Signal est trop pauvre pour « notre matière », et
le mot seul (« Profil local ») ne rend pas justice à un chiffre que le
produit passe justement son temps à calculer.

### Problème identifié

Deux demandes explicites, dans les mots de l'utilisateur :

1. *« Je pensais plus à un truc, une range comme pour le budget […] il faut
   afficher un score sur 10 […] c'est vraiment notre matière donc faut
   vraiment l'afficher. »* — le filtre booléen de D-049 devient une
   fourchette à deux poignées (comme `Budget.jsx`), et le score chiffré doit
   être visible, pas seulement le verdict en mot.
2. *« Deux, trois filtres premium minimum […] où ça se voit très bien que
   c'est premium et qu'on ne peut pas l'utiliser quand on n'est pas connecté
   ou dans l'autre profil. »* — il fallait un second filtre premium ;
   l'utilisateur a délégué le choix (« trouve une idée logique ») plutôt que
   d'en préciser un.

Le second point posait un vrai choix méthodologique, pas seulement un
réglage d'interface : afficher un chiffre brut est précisément ce que D-009
interdisait, pour une raison encore valable (« un score numérique brut
demande une interprétation qu'il n'a pas »). Il fallait vérifier que
l'utilisateur mesurait la portée de la demande avant de rouvrir une décision
citée dans une dizaine de fichiers du code (RestaurantCard, Detail, Discover,
CLAUDE.md §5) — d'où une question posée explicitement (voir conversation)
plutôt qu'une exécution silencieuse : où le chiffre doit-il apparaître
(partout, réservé aux abonnés, ou seulement dans le filtre) ? Réponse :
**partout, pour tout le monde.**

### Décision

**Le score.** `components/Verdict.jsx` (nouveau) affiche le mot du verdict
ET le Local Signal sur 10 (`lib/display.js::scoreSur10`), partout où le
verdict apparaissait déjà (`RestaurantCard`, `Detail`, le podium de
`Discover`) — plus de branche « caché par défaut ». Ce qui reste caché :
le détail indicateur par indicateur (`DetailCalcul`, LS-16), qui est un
tableau de bord et le restera — la distinction de D-009 entre « un chiffre »
et « un tableau de bord » n'a pas disparu, elle s'applique juste à un niveau
plus profond qu'avant.

**Le filtre premium devient une fourchette.** Le booléen `profil_local` de
D-049 est retiré (`backend/core/filters/criteres.py::appliquer`) et remplacé
par `score_min` / `score_max` — deux bornes numériques sur le Local Signal
stocké (échelle 0–100 côté API, affichée 0–10 côté interface,
`ScoreRange.jsx` mécaniquement identique à `Budget.jsx`, D-037). Un
restaurant au Local Signal inconnu **n'est pas exclu** — même règle que le
budget (D-012) : l'absence d'information n'est pas un jugement défavorable,
y compris dans un filtre premium.

**Second filtre premium : la fiabilité de l'évaluation.** Filtre sur le champ
`confidence` (D-012) plutôt que sur le score lui-même — proposé par
l'assistant (l'utilisateur avait délégué le choix), retenu parce qu'il
complète le premier sans le dupliquer : l'un filtre le résultat, l'autre
filtre la certitude du résultat. Une seule poignée (`ConfianceRange.jsx`),
pas une fourchette : on demande toujours « au moins X % », un plafond de
fiabilité n'aurait pas de sens. `confidence` n'étant jamais `None` (D-012,
la redistribution des poids en produit toujours un), aucun cas d'absence à
gérer ici, contrairement au score.

**Le motif « visible, verrouillé » de D-049 est confirmé, pas remplacé.**
Les deux filtres restent affichés à tout le monde (pastille ambre + cadenas,
`fbar__pastille--abonne`/`--verrouille`) ; seule l'activation reste réservée
à l'abonnement, côté serveur (`main.py::list_restaurants` ne transmet
`score_min`/`score_max`/`confiance_min` qu'à un compte abonné, silencieusement
ignorés sinon — pas d'erreur 403, le verrou est commercial).

**Page Pricing mise à jour.** `AVANTAGES_ABONNE` nomme désormais les deux
filtres premium et les favoris (D-049, jamais listés jusqu'ici) — omission
corrigée au passage.

### Conséquences

- **CLAUDE.md §5 mis à jour** : porte désormais la mention explicite de la
  supersession, avec renvoi vers cette entrée et D-009.
- Trois endroits portent maintenant les seuils/échelles du Local Signal en
  parallèle : `apps/web/src/lib/display.js` (verdict, seuils 70/45),
  `packages/shared/filtres.js` (bornes 0–10 du filtre), et la conversion
  d'échelle dans `api.js`. Aucun de ces seuils n'est calibré (D-006) —
  recalibrer l'un sans les autres romprait la cohérence entre ce qu'une
  carte affiche et ce que le filtre retient.
- Le chapitre XAI du mémoire change d'angle : il ne s'agit plus de justifier
  l'absence d'un chiffre, mais d'expliquer un chiffre désormais visible — le
  matériau reste (langage naturel derrière le « pourquoi ? »), l'angle
  d'attaque du chapitre doit être réécrit en conséquence.
- Mobile (`apps/mobile`) hérite mécaniquement des nouvelles constantes
  partagées (`packages/shared/filtres.js` → `filtres.generated.js`) mais pas
  de l'interface : le score chiffré et les deux filtres premium restent à
  construire côté Expo, hors périmètre de cette session (web uniquement).
- **Piège de génération évité, à retenir** : un commentaire JSDoc contenant
  littéralement `*/` dans son texte (ici `apps/*/src/api.js`) ferme le
  commentaire prématurément et casse la compilation. Repéré via l'erreur Vite
  exacte (`filtres.generated.js`), corrigé en reformulant la phrase plutôt
  qu'en évitant les commentaires JSDoc sur les constantes partagées.

### Addendum (2026-09-22, même jour) — le filtre de fiabilité est remplacé

En voyant le filtre « Fiabilité de l'évaluation » à l'usage, l'utilisateur
l'a rejeté : *« ça montre juste qu'on a des restaurants où on n'évalue pas
tout, donc c'est pas bien. Notre score doit être fiable à 100 %. »* Un filtre
dont l'état par défaut affiche « Toutes les évaluations » dit, en creux, que
certaines ne sont pas complètes — exactement l'aveu qu'un produit qui vend la
fiabilité de son score ne peut pas se permettre en interface, même si
CLAUDE.md §10 l'assume ouvertement côté méthodologie (mémoire).

**Décision : le filtre `confidence` est retiré, remplacé par un filtre sur
`tourist_zone`.** Choix guidé par une contrainte simple : ce second filtre
premium devait porter sur un signal **sans trou de couverture** à exposer.
`tourist_zone` est statique (D-008) et couvert à 100 % des restaurants
(CLAUDE.md §12, seul indicateur dans ce cas) — impossible de reproduire le
même problème avec lui. `ConfianceRange.jsx` est supprimé (pas conservé « au
cas où » : CLAUDE.md proscrit les résidus de compatibilité) ; `ZoneRange.jsx`
reprend sa mécanique à une poignée. Backend : `criteres.py::appliquer` troque
`confiance_min` contre `zone_min`, lu sur `signals.tourist_zone.value`.

**Les pastilles verrouillées portent désormais le mot « Abonnement » en
toutes lettres** (`fbar__badgeAbonnement`), pas seulement dans l'infobulle au
survol — invisible au doigt sur mobile, et retour utilisateur explicite :
« il faudra écrire un truc, genre avec abonnement ». Le motif « visible,
verrouillé » de D-049/D-050 ne change pas ; seul son habillage se précise.

La liste `AVANTAGES_ABONNE` de `Pricing.jsx` est mise à jour en conséquence.

### Addendum 2 (2026-09-22, même jour) — le filtre de zone touristique est retiré

Quelques minutes plus tard, l'utilisateur revient sur le filtre `tourist_zone`
lui-même : *« Je suis pas très sûr qu'il va fonctionner […] il faut
l'enlever, il faut l'enlever, il faut l'enlever. »* Pas de raison technique
donnée — un doute produit, répété jusqu'à devenir une décision ferme.

**Décision : le filtre est retiré, sans remplacement proposé cette fois.**
`ZoneRange.jsx` supprimé, `zone_min` retiré de `criteres.py::appliquer` et de
`main.py::list_restaurants`, `ZONE_MIN`/`ZONE_MAX`/`ZONE_PAS`/`zoneActif`/
`libelleZone` retirés de `packages/shared/filtres.js`. Le produit revient à
**un seul filtre premium** : la fourchette de score Local Signal. La ligne
correspondante dans `Pricing.jsx::AVANTAGES_ABONNE` est retirée avec.

Trois filtres premium en deux jets, un filtre premium retenu : le motif
« visible, verrouillé, badge Abonnement » (D-049, D-050, addendum 1) tient
toujours et n'est pas remis en cause — seul le nombre de filtres qu'il habille
a changé. Si un second filtre premium redevient utile, repartir de la même
contrainte que l'addendum 1 : un signal sans trou de couverture à exposer.

---

## D-051 — Conformité RGPD/CGU, cookies, anti-spam et identité visuelle : premier passage

**Date :** 2026-09-22 · **Statut :** actif

### Contexte

L'utilisateur a apporté une liste de 20 tâches typiques d'une check-list de
mise en ligne (RGPD, CGU, HTTPS, cookies, SEO, images, accessibilité, 404,
anti-spam, analytics, etc.), en demandant explicitement de trier d'abord ce
qui est pertinent maintenant plutôt que de tout exécuter à l'aveugle. Le tri
a distingué trois catégories : des gains techniques immédiats, des sujets qui
demandent une décision produit, et des tâches prématurées (HTTPS géré par
l'hébergeur, sitemap et 404 sans objet tant qu'il n'y a pas de routeur —
voir App.jsx). L'utilisateur a ensuite demandé d'exécuter les deux premières
catégories.

### Ce qui a été trouvé en marge de la demande

En vérifiant l'existant avant d'agir (plutôt que de supposer un site vierge),
deux découvertes ont changé le périmètre :

1. **Le droit d'accès et le droit à l'effacement RGPD (LS-29, LS-39)
   existaient déjà côté API** (`repo.export_user_data`, `repo.delete_user`,
   routes `GET /api/auth/mes-donnees` et `DELETE /api/auth/compte`), sans
   qu'aucune interface ne les relie — un droit qu'on ne peut exercer qu'en
   ligne de commande n'est pas exerçable. Les brancher dans Settings.jsx
   coûtait peu et fermait un vrai manque.
2. **La limitation de débit (LS-28)** protégeait déjà connexion et
   inscription, mais **pas la route de réservation** (`POST
   /api/reservations`) — entièrement publique, sans authentification ni
   garde. C'était le vrai trou « anti-spam » de la liste, pas une fonction à
   inventer de zéro.

### Décision

**Pages légales, premier jet.** `CGU.jsx` et `Confidentialite.jsx` — texte
qui reflète honnêtement l'état réel du produit (pas de paiement réel, rôle
d'un compte, ce que la photo d'une carte devient une fois envoyée) plutôt
qu'un modèle générique recopié. Marquées explicitement comme non validées
juridiquement, avec un contact à compléter — ce n'est pas le rôle de
l'assistant de fixer une identité de contact.

**Consentement à l'inscription, avec preuve horodatée.** Une case à cocher
obligatoire dans Signup.jsx, validée côté client et côté serveur
(`accepted_terms`, 400 si absente) ; l'horodatage est stocké
(`users.accepted_terms_at`) parce qu'« a accepté » ne documente rien sans
« a accepté tel jour » — même rigueur que le reste de la colonne D-012/LS-29.

**Bannière cookies, un vrai choix binaire.** Premier jet écrit une bannière
purement informative (« un seul cookie essentiel, rien à accepter ») ; retour
utilisateur explicite : *« il faut juste dire, tu acceptes ou pas les
cookies, c'est tout, comme tous les autres »* — parce qu'un futur outil de
mesure d'audience est envisagé (retour du chantier D-050), le choix doit
exister maintenant même s'il ne pilote rien aujourd'hui.
`CookieBanner.jsx` stocke `accepter`/`refuser` dans `localStorage` ; tout
futur cookie non essentiel devra lire cette clé avant de s'activer — la
porte existe avant la pièce.

**Anti-spam : réutiliser LS-28, pas le réinventer.** `garder_reservation`
(limitation.py) applique la même garde par adresse que l'inscription. Un
champ piège (`site_web`, Reserve.jsx) hors écran et hors tabulation
complète la garde : un formulaire rempli par un script sans exécuter le CSS
le renseigne, une personne ne le voit jamais. Une soumission piégée reçoit
une réponse de succès de façade plutôt qu'une erreur, pour ne pas apprendre
au robot à retirer ce champ précis.

**Gains techniques sans dépendance produit** : meta title/description/OG
corrects (`<title>` valait encore « frontend », jamais changé depuis le
modèle Vite), `lang="fr"`, `robots.txt`, compression des photos de
démonstration (jusqu'à -80 % sur les plus lourdes). L'audit du texte
alternatif n'a rien trouvé à corriger — déjà propre.

**Identité visuelle du favicon et de l'icône mobile.** L'utilisateur a fourni
une image de référence : le symbole fourchette/couteau blanc sur fond rouge
de marque, déjà utilisé comme `.nav__mark` (Nav.jsx). Regénéré
programmatiquement depuis le tracé Phosphor `ForkKnife` (poids « fill », le
même que `.nav__mark`) plutôt que reconstruit à l'œil depuis l'image envoyée
— garantit un résultat identique au pixel près à la marque déjà en
production. `sharp` (Node) a servi de rasteriseur SVG→PNG, installé dans un
répertoire de travail temporaire hors du dépôt, jamais comme dépendance du
projet. Fichiers produits : favicon web (coins arrondis, 512 px),
`icon.png` mobile (carré plein 1024 px, l'OS applique son propre masque),
et les trois calques de l'icône adaptative Android (fond, avant-plan,
monochrome) à l'échelle de sécurité recommandée (~42 % du canevas).

### Conséquences

- **Un remplaçant de moyen de paiement reste à couvrir.** Les CGU et la
  politique de confidentialité citent un contact à compléter — ne pas les
  publier publiquement telles quelles sans cette information et sans relecture.
- **Le jour où un outil d'analytics est ajouté**, il doit lire
  `localStorage["ls-cookies-consent"]` avant de s'activer — sans quoi la
  bannière devient le même mensonge que l'ancien bouton d'abonnement
  fonctionnel (D-049).
- **`apps/mobile` n'a reçu que les icônes**, pas les pages légales ni la
  bannière cookies ni les droits RGPD dans l'app — hors périmètre de cette
  session (web uniquement, comme convenu depuis le début du chantier).
- Deux images mortes repérées en marge (`resto1.jpg`, en réalité un fichier
  AVIF mal étiqueté, jamais référencé dans le code) — signalées, non
  supprimées : le nettoyage n'était pas la tâche demandée.
- Prochaine chose à trancher explicitement si le produit avance vers un vrai
  lancement : un outil d'analytics (et lequel), et l'intégration d'un
  processeur de paiement réel — les deux sujets où CLAUDE.md n'a pas encore
  de réponse.

---

## D-052 — Rattrapage mobile : rôles, abonnement, RGPD, score, filtre premium

**Date :** 2026-09-22 · **Statut :** actif

### Contexte

Toute la colonne D-049 à D-051 (rôles, favoris, filtre premium, score
chiffré, CGU/RGPD, cookies, anti-spam) avait été construite côté web
uniquement — un choix de périmètre pris en tout début de chantier et jamais
revu depuis. L'utilisateur l'a corrigé explicitement : *« l'application
mobile, elle est aussi alignée sur tous les trucs [...] tout ce qu'on
modifie sur le web, elle doit être pareil. »* Le périmètre web-only n'était
donc pas la bonne lecture de la demande initiale, et n'aurait pas dû être
reconduit silencieusement session après session.

### Ce qui a été porté, et comment

**Le score chiffré (D-050)** : `lib/display.js::scoreSur10` et
`components/ui.js::Verdict` (accepte désormais `localSignal`), branché dans
`DiscoverScreen.js` et `DetailScreen.js`. Même comportement que le web : le
mot ET le chiffre, jamais le chiffre seul.

**Pages légales et consentement (D-051)** : `CGUScreen.js` et
`ConfidentialiteScreen.js` reprennent le texte des pages web à l'identique
(même réserve : premier jet, pas de document validé). La case à cocher de
`CompteScreen.js` (mode inscription) envoie `accepted_terms` — le backend ne
distingue pas la provenance de la requête, la même validation serveur
protège donc déjà les deux plateformes depuis D-051 ; il ne manquait que le
geste côté interface.

**Droits RGPD (LS-29, LS-39)** : mêmes routes que le web
(`fetchMesDonnees`, `supprimerCompte`), exposées dans `CompteScreen.js` →
« Vos données ». L'export utilise `Share.share` plutôt qu'un fichier écrit
sur disque : c'est le geste natif pour faire sortir une donnée de l'app
sans dépendance supplémentaire (pas de `expo-file-system`).

**Filtre premium (D-050)** : `RangeSlider.js` généralise la mécanique
`PanResponder` de `Budget.js` (mesure impérative dans une feuille modale,
poignées qui ne se croisent pas) pour que `ScoreRange.js` la réutilise sans
dupliquer ~180 lignes de gestion tactile déjà mise au point. `Budget.js`
devient un fin wrapper au-dessus de `RangeSlider.js` — aucun appelant
existant n'a dû changer. La pastille verrouillée (`PastilleAbonne` dans
`Filtres.js`) reprend le ton « mixte » de la palette et le mot
« ABONNEMENT » en toutes lettres, comme `fbar__badgeAbonnement` côté web.

**Abonnement et rôle** : `PricingScreen.js` miroir de `Pricing.jsx`, bouton
volontairement bloqué pour la même raison (pas de paiement réel). Rôle
affiché dans `CompteScreen.js`, résiliation réelle (même mécanisme de
démonstration que le web).

### Ce qui n'a PAS d'équivalent mobile, et pourquoi ce n'est pas un oubli

- **Bannière cookies** : les cookies HTTP sont un mécanisme du navigateur.
  L'application mobile s'authentifie par un jeton porté en en-tête
  (`X-Jeton-Session`, LS-40), jamais par un cookie — il n'y a rien à
  bannir ici. Le droit d'information équivalent (quelles données, pourquoi)
  est couvert par `ConfidentialiteScreen.js`.
- **Champ piège anti-spam** (honeypot) sur la réservation : c'est une
  défense contre des robots qui remplissent des formulaires HTML détectés
  par DOM-scraping — un vecteur propre au web. La vraie protection
  (`limitation.garder_reservation`, LS-28) est côté serveur et s'applique
  déjà à tout appelant de `POST /api/reservations`, mobile compris, sans
  rien à ajouter.
- **Favoris (cœur sur les cartes, écran dédié)** : pas encore fait. C'est le
  morceau le plus proche d'un vrai nouvel écran (liste, ajout/retrait,
  état vide) plutôt qu'un branchement de fonctions déjà écrites côté API —
  volontairement laissé pour une prochaine passe plutôt que bâclé dans
  celle-ci.

### Ce qui reste fragile, à vérifier hors de cet environnement

**`Alert.alert` (confirmation de suppression de compte) n'a pas pu être
vérifié dans l'aperçu web d'Expo** : react-native-web n'implémente pas de
UI pour les alertes à plusieurs boutons dans cette configuration, le clic
n'ouvre visiblement rien et rien ne se passe — comportement sans risque
(aucune suppression accidentelle), mais aussi sans confirmation possible
depuis cet environnement. La route elle-même a été vérifiée directement en
contournant l'interface (`curl -X DELETE /api/auth/compte`, succès,
compte réellement supprimé) : c'est l'appel qui fonctionne, c'est
`Alert.alert` qui ne peut pas être jugé ici. `Alert.alert` est l'API React
Native standard et fonctionne nativement sur iOS/Android — **à confirmer
sur un simulateur ou un appareil réel avant de considérer ce geste
définitivement vérifié.**

### Conséquences

- Les deux applications partagent maintenant le même vocabulaire de
  fonctionnalités pour tout ce qui a été construit depuis D-049, à
  l'exception explicite des favoris.
- `packages/shared/filtres.js` reste la source unique des constantes de
  score (D-050) : aucune nouvelle divergence introduite par ce chantier.
- Prochaine étape explicite si le rattrapage doit être complet : les
  favoris côté mobile (écran + cœur sur les cartes), puis une vérification
  de `Alert.alert` sur un vrai environnement Expo (simulateur ou appareil).

## D-053 — Les pondérations recalibrées à partir de la vérité terrain

**Contexte.** La vérité terrain (D-042 à D-045) donne un classement de
référence sur 467 restaurants. Les pondérations D-013 étaient posées à la
main : menu 0,40 / langue 0,30 / prix 0,15 / zone touristique 0,15.

**Problème.** Une régression sur le classement de référence (D-046) montre que
ces poids ne sont pas ceux qui prédisent le mieux : la langue des avis porte
plus de signal que le menu sur la zone témoin, le prix moins qu'attendu. Rester
sur D-013 sans en tenir compte revient à ignorer la vérité terrain qu'on vient
de construire.

**Décision.** Les poids bougent dans le sens indiqué par la vérité terrain,
sans adopter la pondération dérivée brute (qui écraserait tout sur un seul
indicateur — voir D-046 pour pourquoi ce n'est pas souhaitable) :

```
WEIGHT_MENU          0.40 → 0.30
WEIGHT_LANGUAGE       0.30 → 0.40
WEIGHT_PRICE          0.15 → 0.10
WEIGHT_TOURIST_ZONE   0.15 → 0.20
```

La langue passe devant le menu, sans dépasser ce que le menu pesait déjà
(0,40) — aucun indicateur n'est poussé au-delà de ce plafond. Le menu reste le
deuxième poste le plus élevé : c'est le seul signal disponible pour un
restaurant sans aucun avis, la contrainte n°1 du projet (D-001).

**Conséquences.** `backend/config.py` mis à jour. Tests de propriétés
(`backend.tests.test_scoring`) toujours au vert — ils vérifient des
invariants, pas des valeurs, donc ils survivent à la recalibration comme
prévu. Le classement obtenu se rapproche de la vérité terrain sans s'y
identifier : c'est un compromis entre la mesure et la logique du projet, pas
un ajustement mécanique.

---

## D-054 — Finition produit : identité, classement expliqué, pages institutionnelles, scan lié

**Date :** 2026-09-22 · **Statut :** actif

### Contexte

Premier retour explicite sur le passage « projet de mémoire » → « application
professionnelle » : *« il faut que ce soit vraiment une application
professionnelle [...] faut pas mettre [mémoire HETIC] du tout. »* Trois
demandes concrètes accompagnaient ce cap : expliquer pourquoi le premier
résultat d'une recherche n'a pas toujours le meilleur Local Signal, ajouter
À propos / Contact / Dons, et refaire le scan mobile qui n'attachait aucune
carte à un restaurant.

### Décision

**Retrait de la mention « mémoire HETIC ».** Pied de page web (`App.jsx`)
et toute occurrence utilisateur-visible équivalente sur mobile (il n'y en
avait pas). **Non touché, volontairement** : les mentions « provisoire »
dans `WhyPanel.jsx` / `DetailCalcul.jsx` (pondérations non calibrées) — §10
de CLAUDE.md rend cette rigueur non négociable pour la soutenance, et ces
panneaux sont déjà repliés derrière un « pourquoi ? », pas la vitrine du
produit. La ligne « Tarif indicatif, pas encore arrêté » de Pricing.jsx et
PricingScreen.js a, elle, été retirée : le bouton déjà bloqué dit à lui
seul qu'aucun paiement n'a lieu, la remarque était redondante.

**Le classement s'explique, plutôt que d'afficher « Triés par score ».**
Ce libellé était trompeur — le classement n'est pas le score seul, mais
Local Signal × 0,70 + proximité × 0,30 (D-008, `engine.py`). Un bouton
« Classement : authenticité et proximité » (web : `Discover.jsx`, mobile :
`DiscoverScreen.js`) révèle une phrase au clic plutôt que d'imposer un
paragraphe permanent — l'explication n'intéresse que qui se demande
pourquoi le premier résultat n'a pas le meilleur chiffre.

**Trois pages institutionnelles, web et mobile.** `About` (le paradoxe de
l'invisibilité, sans mention d'origine académique), `Contact`
(`fareshafianepro@gmail.com`, lien `mailto:`), `Dons` — bouton
volontairement bloqué, même traitement que le bouton d'abonnement (D-049) :
la page existe, le geste non, jusqu'à ce qu'un vrai moyen existe. Sur
mobile, sans pied de page, ces trois liens vivent au bas de `CompteScreen.js`
(connecté et non connecté) — seul endroit qu'un compte, quel que soit son
état, traverse forcément.

**Le scan mobile s'attache désormais à un restaurant.** Jusqu'ici
`ScanScreen.js` appelait `/api/menu/scan`, la route anonyme : l'analyse
s'affichait puis se perdait, sans rejoindre le corpus structuré qui est
l'actif du projet (CLAUDE.md §3) — exactement le défaut que
`AjouterCarte.jsx` avait déjà corrigé côté web (D-038, D-039), jamais
répercuté côté mobile. Nouveau parcours : chercher le restaurant par nom →
photographier sa carte (`envoyerCarte`, pas `scanMenu`) → avis facultatif
si connecté (`laisserAvis`). Une route publique,
`GET /api/restaurants/recherche`, a été ajoutée pour ce sélecteur — nom et
adresse ne sont pas des données sensibles, déjà visibles via la recherche
géographique ; elle réutilise `repo.get_restaurants(q=...)`, déjà écrite
pour la page admin.

**Aucun repli anonyme si le restaurant est introuvable.** Choix délibéré :
c'est précisément ce repli que ce chantier retire. Un restaurant manquant de
la base reste un trou à combler autrement (import OSM), pas une carte
scannée sans rattache.

### Conséquences

- `RangeSlider.js` (D-052) et ce chantier confirment le même principe :
  généraliser plutôt que dupliquer dès qu'un deuxième appelant apparaît.
- Aucune fonctionnalité de scan n'existe encore pour créer un restaurant
  absent de la base depuis l'app — limite connue, pas un oubli.
- Les pages À propos / Contact / Dons restent volontairement courtes
  (« on sera vide, on expliquera un petit peu ») : à enrichir plus tard,
  pas à combler de contenu inventé maintenant.
- Si un jour le don devient réellement payant, `Dons.jsx` / `DonsScreen.js`
  suivent le même chemin que Pricing le jour où un vrai processeur de
  paiement sera intégré (D-049).

---

## D-055 — Rôle restaurateur : revendication/création validée à la main, et fréquentation par compte

**Date :** 2026-09-23 · **Statut :** actif

### Contexte

Premier chantier B2B du produit : donner à un restaurant sa propre
interface de gestion, distincte du compte client. Demande explicite,
avec deux points structurants laissés ouverts à la décision de
l'utilisateur plutôt que tranchés par défaut :

1. Comment un compte devient-il légitimement propriétaire d'une fiche —
   et que faire d'un restaurant qui n'est pas encore dans la base ?
2. Un restaurateur abonné doit pouvoir voir *qui* a consulté sa fiche
   (au moins un nom) — cela suppose de rattacher une consultation à un
   compte, ce que le schéma refusait jusqu'ici par choix de vie privée
   (`consultations` sans `user_id`, commentaire explicite dans
   `repository.py` : « délibérément non rattaché »). Comment obtenir le
   consentement à ce changement ?

### Décision

**1. Revendication ou création, toujours validée par un humain.** Réponse
littérale de l'utilisateur : *« la deuxième option me semble plus
logique. C'est-à-dire qu'il fait la demande et nous, on valide. Après, il
a l'accès. [...] s'il y a un restaurant qui est nouveau aussi, qui
n'existe pas, il peut le créer dans notre place [...] et nous, on doit
valider [...] au premier temps, et après, peut-être on fera une
validation automatique. »* D'où `restaurant_claims` (`backend/db/models.py`) :
une demande porte soit un `restaurant_id` existant (revendication), soit
des champs `proposed_*` (nom, adresse, lat/lng, cuisine, téléphone) pour
une fiche qui n'existe pas encore. Dans les deux cas, la fiche publique
n'est touchée qu'à l'approbation (`repository.py::approve_claim`) — jamais
avant. Une fiche créée par approbation prend l'identifiant
`manuel_<uuid>`, pour ne jamais entrer en collision avec les identifiants
`osm_n...` de la collecte OSM, et son `local_signal` reste `NULL` (D-012) :
elle apparaît « Non évaluée » jusqu'au prochain calcul batch, exactement
comme n'importe quelle fiche incomplète. Aucune validation automatique
n'est implémentée pour l'instant — conforme à la demande, à rouvrir
explicitement si le volume de demandes le justifie un jour.

**2. Rattacher `consultations.user_id`, avec un consentement regroupé dans
les CGU plutôt qu'un opt-in séparé.** Réponse littérale, après que
l'opt-in granulaire proposé a été explicitement refusé : *« on met ça
dans le règlement qui coche au début [...] comme sur tous les autres
sites, en fait. Il y a plein de règlements où personne ne va dire [...]
donc on va faire pareil, on met dans le règlement au début et après, ça
passe. »* La colonne `user_id` est ajoutée à `consultations`
(`_migrate()`, nullable — NULL pour tout visiteur non connecté, qui n'a de
toute façon pas d'identifiant stable). Le consentement n'est **pas** un
second opt-in : il est couvert par la case déjà cochée à l'inscription
(`accepted_terms`), et CGU.jsx / Confidentialite.jsx disclosent
explicitement cette pratique en toutes lettres plutôt que de la laisser
implicite dans le seul texte des CGU — engagement pris pour la
défendabilité du mémoire, au-delà de ce que la conformité minimale
exigerait.

**Palier gratuit / abonné, porté par la demande, pas par le compte
client.** `restaurant_claims.abonne` est un booléen distinct de
`users.role` : un restaurateur gratuit voit un total et quelques noms
récents (`get_recent_visitor_names`), un restaurateur abonné voit le
détail complet (`get_visitor_details`) et, plus tard, pourra cibler des
notifications — non implémenté à ce stade, seule l'analytique existe.
Distinguer les deux abonnements (client à 3 €, restaurateur envisagé plus
cher) évite de faire porter au rôle `user/subscriber/admin` une
signification qu'il n'a pas.

**Le restaurateur ne modifie que le contact, jamais le menu.**
`update_restaurant_contact` n'autorise que `phone`, `reservation_url`,
`opening_hours`. Delibéré, pas encore rouvert : laisser un restaurateur
déclarer lui-même son menu court-circuiterait D-014 (le modèle observe,
il ne juge pas) — un menu auto-déclaré fausserait le signal menu de la
même façon qu'un score auto-déclaré fausserait le Local Signal. Les
réponses aux avis, évoquées dans la demande initiale comme réservées aux
restaurateurs abonnés, ne sont pas construites dans ce chantier — même
raison que les notifications ciblées : l'infrastructure (envoi, droit de
retrait de l'avis d'origine) n'existe pas encore.

**Droits RGPD étendus en conséquence.** `export_user_data` inclut
désormais les consultations d'un compte ; `delete_user` les délie (`user_id
= NULL`) plutôt que de les supprimer — même geste que pour les cartes
soumises (D-039) : la valeur du corpus de fréquentation d'un restaurateur
ne doit pas dépendre de la durée de vie du compte de chacun de ses
visiteurs.

### Conséquences

- Nouvelles routes : `POST /api/restaurateur/demande`,
  `GET /api/restaurateur/statut`, `GET`/`PATCH
  /api/restaurateur/mon-restaurant`, `GET
  /api/restaurateur/mon-restaurant/visites` côté restaurateur ;
  `GET /api/admin/demandes-restaurateur` et les deux routes de décision
  côté admin — toutes vérifiées par test manuel de bout en bout (demande,
  validation, tableau de bord, modification de contact, comptage des
  visites aux deux paliers, export et effacement RGPD) avant ce commit.
- `Restaurateur.jsx` (web) : formulaire de demande (recherche + revendication,
  ou proposition avec `LocationPicker` réutilisé tel quel), état d'attente,
  tableau de bord. Entrée dans le menu déroulant de `Nav.jsx`. `Admin.jsx`
  gagne un second onglet, « Demandes restaurateur », pour la file de
  validation.
- **Mobile non touché par ce chantier.** Contrairement au rattrapage
  systématique fait en D-052, cette fonctionnalité n'a pas été demandée
  pour mobile dans ce message — à traiter explicitement si/quand demandé,
  plutôt que supposé.
- Reste ouvert, dans l'ordre où la demande initiale les évoquait : réponses
  aux avis (abonné), notifications ciblées (abonné), page tarif
  restaurateur dédiée, et la question méthodologique de fond sur un futur
  droit d'édition du menu par le restaurateur lui-même.

---

## D-056 — Compte restaurateur séparé du compte client dès l'inscription (corrige D-055)

**Date :** 2026-09-23 · **Statut :** actif — **corrige un point de D-055**,
le reste de D-055 (table `restaurant_claims`, validation humaine,
distinction d'abonnement, édition limitée au contact, consultations
rattachées au compte) reste vrai tel quel.

### Contexte

D-055 faisait d'un compte restaurateur un compte client (`role` `user` /
`subscriber` / `admin`) qui *demandait ensuite* à gérer un restaurant,
depuis une page accessible dans le menu déroulant du compte. Relecture
explicite de l'utilisateur en la testant : *« il faut séparer les deux
comptes, je pense [...] un compte, quand il est créé, il est créé
directement en tant que restaurateur [...] ça n'a pas la même
fonctionnalité. »* Un compte client qui « devient » restaurateur en cours
de route mélangeait deux identités qui n'ont rien en commun
fonctionnellement — répertoire de restaurants d'un côté, gestion d'un
restaurant de l'autre.

### Décision

**Un compte restaurateur se crée directement comme tel, jamais par
requalification.** `users.role` gagne la valeur `'restaurateur'`,
posée dès l'`INSERT` (`repo.create_restaurateur_account`) — jamais par un
`set_user_role` a posteriori sur un compte déjà client. La demande de
revendication/création de fiche est créée dans la **même connexion, avant
le commit** : un compte restaurateur sans demande jointe ne doit jamais
exister, même un instant.

**Un formulaire d'inscription à part, pas le formulaire client suivi d'une
demande.** `SignupRestaurateur.jsx` (web) réunit les champs de compte et la
recherche/proposition de restaurant en un seul geste, via
`POST /api/auth/signup-restaurateur`. L'ancienne route
`POST /api/restaurateur/demande` (créer une demande depuis un compte déjà
existant) n'est pas supprimée — elle reste utile à un restaurateur qui
voudrait ajouter une seconde adresse, ou redéposer après un refus — mais
elle est désormais **réservée aux comptes déjà `role = 'restaurateur'`**
(403 sinon) : un compte client n'y a plus accès, ni dans l'API ni dans
l'interface (le lien « Espace restaurateur » du menu déroulant client a été
retiré).

**Navigation entièrement différente pour un compte restaurateur.**
`Nav.jsx` : pas de « Découvrir », pas de « S'abonner », pas de « Profil »,
pas de « Favoris » — aucun n'a de sens pour un compte qui ne cherche pas de
restaurant mais en gère un. À la place : « Mon restaurant » (le tableau de
bord), et dans le menu déroulant, seulement « Paramètres » et
« Se déconnecter ». `Settings.jsx` masque la section Abonnement client pour
ce rôle — l'abonnement restaurateur est un mécanisme différent
(`restaurant_claims.abonne`), pas encore une fonctionnalité de ce panneau.
`App.jsx` redirige automatiquement un compte restaurateur qui atterrit sur
« discover » (connexion, rechargement de session) vers son tableau de bord.

**Reste identique à D-055 :** la validation humaine de la demande
(`Admin.jsx`, onglet « Demandes restaurateur »), le palier gratuit/abonné
porté par `restaurant_claims.abonne` (pas par `role`), l'édition limitée
aux champs de contact (D-014), et le rattachement de
`consultations.user_id` avec consentement regroupé dans les CGU.

### Conséquences

- `Restaurateur.jsx` perd son formulaire de demande (déplacé dans
  `SignupRestaurateur.jsx`) : il ne fait plus que refléter l'état de LA
  demande créée à l'inscription (en attente / refusée / tableau de bord).
  Le cas « aucune demande trouvée » (qui ne devrait plus arriver) affiche un
  message de contact plutôt qu'un formulaire dupliqué.
- Vérifié de bout en bout dans le navigateur : inscription restaurateur
  (revendication d'une fiche réelle) → nav strictement restaurateur dès la
  création → validation admin → tableau de bord déverrouillé, avant ce
  commit.
- **Deux comptes de démonstration créés pour tester la suite (avis,
  fréquentation, future messagerie ciblée)** : `nour.restaurateur.demo@example.com`
  (non abonné, restaurant « La Table de Nour ») et
  `marco.restaurateur.demo@example.com` (abonné, restaurant « Osteria
  Bellini »), mot de passe `motdepasse123` pour les deux. Chacun possède un
  restaurant `manuel_...` (local_signal `NULL`, comme toute fiche non
  encore scorée — D-012), une dizaine de consultations simulées (mélange de
  comptes clients identifiés et de visiteurs anonymes, étalées sur les dix
  derniers jours) et 2-3 avis. Cinq comptes clients de démonstration
  (`*.demo@example.com`) portent ces visites et avis. **Les notifications
  ciblées elles-mêmes ne sont pas construites** — cette donnée sert à
  peupler le tableau de bord existant (fréquentation, avis), pas à tester
  un envoi qui n'existe pas encore.
- Mobile toujours non touché — même remarque que D-055.

---

## D-057 — Statut d'abonnement restaurateur visible, et sa page de tarifs

**Date :** 2026-09-23 · **Statut :** actif

### Contexte

Retour utilisateur après avoir testé D-056 en conditions réelles : *« il
faut que ça se voit aussi. [...] il faut que ça ait écrit restaurateur.
Abonné ou pas abonné. Et il leur faut leur page d'abonnement aussi [...]
avec lister bien sûr les différents trucs qu'ils peuvent faire. »* Le badge
de compte (`Nav.jsx`) n'affichait que « Restaurateur », sans dire si la
formule payante était active, et aucune page n'exposait les deux paliers
— contrairement au compte client (`Pricing.jsx`).

À la même occasion, un vrai bug a été signalé (voir « Problème connexe » ci-dessous).

### Décision

**Le statut d'abonnement restaurateur voyage avec le compte.**
`UserResponse` gagne `restaurateur_abonne` (`Optional[bool]`), calculé dans
`_to_user_response` en relisant `restaurant_claims.abonne` de la demande
active — uniquement pour `role = "restaurateur"`, `None` sinon. Choix
délibéré de le poser côté serveur plutôt que de multiplier les appels côté
client : c'est la même logique que `role` lui-même, disponible partout où
le compte l'est (badge, garde d'affichage) sans requête supplémentaire.
`Nav.jsx` affiche désormais « Restaurateur · Abonné » ou
« Restaurateur · Non abonné ».

**`PricingRestaurateur.jsx`, même gabarit que `Pricing.jsx`.** Grille à
deux formules (gratuit / 10 € — placeholder, même réserve que le tarif
client), bouton **volontairement bloqué** (même décision que D-049 : aucun
processeur de paiement branché, aucun clic ne doit donner l'illusion de
fonctionner). Les routes de bascule (`POST /api/restaurateur/abonnement`
et son pendant `/annuler`) existent côté serveur — même schéma que
`/api/subscribe` côté client — mais ne sont appelées par aucun bouton visible ;
elles resservent le jour où un vrai paiement existe, ou pour des comptes
de démonstration créés en base directement.

### Problème connexe (pas une décision, un correctif)

Le retour utilisateur venait avec une capture d'écran : « Impossible de
charger » sur le tableau de bord restaurateur ET sur l'onglet admin des
demandes. Cause identifiée : le serveur backend partagé (port 8000,
lancé par une autre session, sans `--reload`) tournait encore sur le code
d'avant D-055/D-056 — toutes les routes `/api/restaurateur/*` et
`/api/admin/demandes-restaurateur` lui étaient inconnues (404). Vérifié
en reproduisant l'erreur avec une instance de test isolée sur le port 8002
pointée sur l'ancien code, puis en confirmant que le code actuel fonctionne
une fois servi. **Non résolu par cette session** : redémarrer le processus
partagé du port 8000 a été refusé par le mode automatique (appartient à une
autre session) — signalé à l'utilisateur plutôt que contourné.

### Conséquences

- Vérifié dans le navigateur aux deux états (`nour.restaurateur.demo`,
  non abonné ; `marco.restaurateur.demo`, abonné) : badge, lien « S'abonner »
  dans la nav (masqué une fois abonné, même logique que côté client), et
  les deux rendus de `PricingRestaurateur.jsx`.
- Le serveur partagé du port 8000 doit être redémarré (par son propriétaire,
  ou avec l'autorisation explicite de l'utilisateur) pour que tout ce
  chantier (D-055 à D-057) soit réellement utilisable hors de cette session.
  **Résolu** : redémarré avec l'accord explicite de l'utilisateur
  (« arrete tout et relance »), désormais avec `--reload`.

---

## D-058 — Statut restaurateur visible et filtrable dans la liste admin

**Date :** 2026-09-23 · **Statut :** actif

### Contexte

Retour utilisateur : *« pour l'admin, il doit avoir la liste des restos et
en haut, il voit les restos qui sont validés puis les restos en attente
[...] il doit avoir des filtres [...] resto validé, resto en attente et
resto sans restaurateur. Comme ça il voit toute la liste. »* L'onglet
« Demandes restaurateur » (D-055) ne montre que la file en attente ; il
manquait une vue sur l'ensemble des 10 000+ restaurants avec leur statut
restaurateur, pour répondre à « qui a déjà un restaurateur, qui est en
cours, qui n'a personne ».

### Décision

**Le statut restaurateur devient une propriété calculée de chaque
restaurant, jamais stockée.** Trois états mutuellement exclusifs, dérivés
de `restaurants.owner_user_id` et de `restaurant_claims.status` :
`valide` (fiche possédée), `en_attente` (demande déposée, pas tranchée),
`sans` (ni l'un ni l'autre). Un seul jeu d'expressions SQL
(`_RESTAURATEUR_VALIDE`, `_RESTAURATEUR_EN_ATTENTE`, `_RESTAURATEUR_SANS`,
`backend/db/repository.py`) sert à la fois de clause de filtre et de clé
de tri — les deux ne peuvent pas diverger puisque c'est littéralement le
même texte SQL.

**Le calcul est OPT-IN, pas systématique.** `get_restaurants()` sert aussi
`/api/restaurants/recherche` (10 résultats) et `/api/cuisines` (TOUTE la
base, à chaque chargement de Découvrir) — deux chemins chauds qui n'ont
rien à faire de ce statut. Lui payer une sous-requête `EXISTS` par ligne
aurait ralenti l'appli pour tout le monde pour une fonctionnalité que
seul l'admin utilise. `avec_statut_restaurateur=False` par défaut ;
`/api/admin/restaurants` est le seul appelant qui le passe à `True`.

**Sans filtre, l'ordre reste utile.** `ORDER BY restaurateur_rang ASC,
local_signal DESC` place les fiches validées en tête, puis les demandes en
attente, puis le reste — exactement ce qu'un admin doit pouvoir repérer
sans activer un filtre, conforme à la demande (« en haut, il voit les
restos qui sont validés puis les restos en attente »). Les trois boutons
de filtre (`Admin.jsx`) restreignent ensuite à un seul statut si besoin.

**Affichage : un badge sur `RestaurantCard`, pas un nouveau composant.**
`restaurant.restaurateur_statut` n'existe que sur les réponses de
`/api/admin/restaurants` — la carte l'ignore silencieusement partout
ailleurs (Découvrir, favoris n'ont jamais ce champ). Badge coin bas-droit
pour ne pas entrer en collision avec le rang (haut-gauche), la distance
(bas-gauche) et « Meilleur profil local » (haut-droit) — collision réelle
sinon, puisque le premier restaurant listé est désormais souvent validé.

### Conséquences

- `repo.get_restaurants`/`count_restaurants` gagnent `restaurateur_statut`
  (filtre) et `avec_statut_restaurateur` (calcul) ; `/api/admin/restaurants`
  gagne le paramètre `restaurateur_statut`.
- Vérifié directement en base (les trois filtres et l'ordre par défaut)
  avant ce commit ; vérification navigateur non refaite ici, le motif
  étant le même schéma déjà validé pour D-055/D-056/D-057.
- Aucun changement pour `/api/restaurants` (recherche géographique,
  utilisateur final) ni `/api/cuisines` : ce chantier est strictement
  admin.

---

## D-059 — Photo de vitrine déposée par le restaurateur, et trois bugs d'affichage des photos corrigés au passage

**Date :** 2026-09-24 · **Statut :** actif

### Contexte

Retour utilisateur : *« la Table de Nour, la photo ne marche pas. »*
`La Table de Nour` est une fiche `manuel_...` créée par D-055/D-056 —
sans import OSM/Google, elle n'a jamais eu de `photo_url`, et rien ne
permettait à son restaurateur d'en déposer une. Le vrai manque n'était pas
un bug de données, c'était une fonctionnalité absente.

### Décision

**Nouvelle colonne, nouveau canal — pas de réutilisation du corpus de
cartes.** `restaurants.photo_key`/`photo_type` (empreinte sha256 dans
`stockage()`, déjà utilisé pour le corpus de cartes — D-038 — et son type
MIME). Un nouvel endpoint, `GET /api/restaurant/{id}/photo-restaurateur`,
sert cette photo ; il reste distinct de `GET /api/restaurant/{id}/photo`
(D-025, photos Google Places) parce que la provenance et le droit de
redistribution diffèrent : le corpus de cartes n'est **jamais** servi
(D-038, ce sont des œuvres tierces photographiées en vitrine), alors
qu'ici c'est le restaurateur déjà vérifié (D-055) qui dépose la photo de
son propre établissement — la distinction mérite deux routes plutôt
qu'une seule ambiguë. `POST /api/restaurateur/mon-restaurant/photo`
dépose et remplace ; une seule photo par fiche, pas une galerie.

**`PhotoRestaurant.jsx` apprend un second type de source.** `photoUrl`
(lien externe OSM/Google) prime quand il existe ; sinon `photoKey`
(nouveau prop) déclenche `photoUrlRestaurateur(id, photoKey)`. Les trois
appelants existants (`RestaurantCard`, `Detail.jsx`, `Admin.jsx`) passent
désormais aussi `photoKey` — le composant partagé absorbe la distinction,
aucun appelant n'a à savoir d'où vient la photo.

**Trois bugs d'affichage trouvés et corrigés en vérifiant la fonctionnalité,
tous dans du code préexistant :**

1. **`.visual > svg` (l'icône de repli, `CuisineVisual.jsx`) a un
   `z-index: 1` explicite ; `.photorestau__img` n'en avait aucun.** Un
   z-index explicite gagne toujours face à `auto`, quel que soit l'ordre
   dans le DOM — l'icône peignait donc PAR-DESSUS une photo pourtant
   chargée avec succès, sur toute l'application (Découvrir, fiches,
   admin), depuis toujours. Resté invisible parce qu'une photo réelle,
   suffisamment chargée visuellement, masque un fin contour translucide à
   90 % d'opacité — un test avec une image de couleur unie l'a rendu
   flagrant. **Corrigé** : `z-index: 2` sur `.photorestau__img`.
2. **`chargee`/`cassee` (état de `PhotoRestaurant`) ne se réinitialisaient
   jamais quand `photoUrl`/`photoKey` changeaient.** Remplacer une photo
   cassée par une valide (ou l'inverse) laissait l'ancien état figé.
   **Corrigé** : un `useEffect` sur `url` remet les deux à faux, et
   `key={url}` sur l'`<img>` force un remontage propre de l'élément.
3. **Une image déjà en cache navigateur peut finir de charger de façon
   synchrone, avant que React n'ait attaché `onLoad`.** L'évènement part
   dans le vide, `chargee` ne passe jamais à vrai, l'image reste à
   `opacity: 0` indéfiniment — reproductible à chaque replacement de photo
   revisitant la même URL depuis le cache HTTP. **Corrigé** : un effet lit
   `imgRef.current.complete` une fois l'élément monté, indépendamment de
   l'évènement.

**Cache-busting par empreinte de contenu, pas par date.** La réponse de
`/photo-restaurateur` est cachée 24h (`Cache-Control`) ; sans un
paramètre qui change, le navigateur aurait continué de servir l'ancienne
photo après un remplacement. `photoUrlRestaurateur(id, photoKey)` ajoute
`?v=<photo_key>` — stable tant que la photo ne change pas (le cache reste
utile), et automatiquement invalidé exactement quand elle change (la clé
est une empreinte du contenu).

### Conséquences

- Vérifié de bout en bout dans le navigateur : dépôt d'une photo par
  `nour.restaurateur.demo@example.com`, apparition immédiate sans
  rechargement forcé, remplacement par une seconde photo visuellement
  distincte confirmant le cache-busting, et absence de régression sur
  une fiche à `photo_url` externe déjà en place (« L'île de Crête »,
  Découvrir).
- Photo de test retirée de `La Table de Nour` après vérification — la
  fiche de démonstration reste sans photo, prête pour un dépôt réel.
- Mobile non touché — comme D-055/D-056, cette fonctionnalité n'a pas été
  demandée pour mobile dans ce message.

---

## D-060 — Tableau de bord restaurateur : même gabarit que la fiche client

**Date :** 2026-09-24 · **Statut :** actif

### Contexte

Retour utilisateur direct, après avoir vu le tableau de bord en conditions
réelles : *« il a eu deux pages et elle est trop nulle [...] il voit pas
les images [...] il faut l'image de son restaurant, il faut tous les
détails [...] ce sera quand même notre meilleur, 10 euros d'abonnement
donc il faut vraiment présenter un truc qui soit bien, pas nul comme
ça. »* Le tableau de bord empilait trois petites sections (`Fréquentation`,
une vignette 120×90 pour la photo, un formulaire de contact) sans hiérarchie
visuelle — rien à voir avec la fiche que voit un client (`Detail.jsx`), déjà
soignée. Un produit facturé plus cher que l'abonnement client ne peut pas
avoir l'air moins fini que la version gratuite.

### Décision

**Même gabarit que `Detail.jsx`, pas un gabarit inventé pour l'occasion.**
`TableauDeBord` (Restaurateur.jsx) adopte la grille `.detail` (photo à
gauche, informations à droite dès 900px) déjà éprouvée côté client :
photo en grand format (`.detail__media`, plus la vignette 120×90 d'avant),
nom, cuisine, puis un `factlist` qui montre TOUS les champs de la fiche —
adresse, horaires, téléphone, réservation — pas seulement ceux qui se
modifient. Un restaurateur doit voir sa fiche telle qu'un client la voit,
en entier, avant de savoir ce qu'il a le droit de changer.

**Le bouton d'ajout de photo devient un geste sur l'image, pas une ligne
de formulaire à côté.** `.restaurateur__photoBtn` se superpose en bas à
gauche de la photo (même famille visuelle que `.card__favori`/
`.card__distance`) plutôt que d'être un bouton `<Camera>` séparé dans une
colonne de texte — le geste « changer la photo » doit partir de la photo
elle-même.

**Le formulaire de contact reste, mais en second temps.** Renommé
« Modifier les coordonnées » et placé après le factlist en lecture : on
montre d'abord ce qui EST, puis ce qui se change — jamais les deux
mélangés dans la même section.

### Conséquences

- Vérifié dans le navigateur avec le compte `marco.restaurateur.demo`
  (abonné, photo réelle déjà déposée par l'utilisateur lui-même via la
  fonctionnalité D-059) : rendu correct en colonne unique (<900px) et en
  grille à deux colonnes (≥900px, 1300px testé).
- Aucun changement de route ni de donnée — uniquement la mise en page de
  `TableauDeBord`/`PhotoEdit` et deux classes CSS nouvelles
  (`.restaurateur__media`, `.restaurateur__photoBtn`).
- Adresse de « La Table de Nour », communiquée à l'utilisateur en réponse
  à sa question : 18 Rue de la Roquette, 75011 Paris.

---

## D-061 — Retrait du podium modal après une recherche (Discover.jsx)

**Date :** 2026-09-24 · **Statut :** actif — retire une fonctionnalité de
LS-12/LS-13 (14 sept. 2026), sans lien avec D-055 à D-060.

### Contexte

Retour utilisateur, en voyant le modal « Classement de votre recherche —
Les 3 meilleures adresses » s'ouvrir après un clic sur « Chercher » :
*« depuis quand ça s'affiche ça ??? »*, puis, la fonctionnalité identifiée
et expliquée (présente depuis LS-12/LS-13, le 14 septembre, avant ce
chantier) : *« remove it, en plus ça apparaît pas tout le temps donc
bon. »* Le second point compte autant que le premier : le déclenchement
dépendait d'une ref (`ouvrirClassement.current`) armée uniquement par le
bouton « Chercher » et désarmée dans certains chemins d'erreur — une
fonctionnalité qui ne se déclenche pas de façon fiable ne rend pas le
service qu'elle promettait, indépendamment de la question du goût.

### Décision

**Retrait complet, pas un masquage.** `Discover.jsx` perd l'état
(`classementOuvert`, `podium`, la ref `ouvrirClassement`), le calcul du
podium dans le `.then()` de la recherche, et le bloc JSX du modal. La
recherche va directement aux résultats, comme le reste de l'application
(favoris, admin, restaurateur) l'a toujours fait. Le CSS dédié
(`.classement-modal__*`) est retiré avec le composant — un module CSS mort
n'aide personne à comprendre l'application.

**Ce qui reste, délibérément.** `versionResultats` (state) sert AUSSI à
rejouer l'animation d'entrée des trois premières cartes de la vraie liste
de résultats — une fonctionnalité distincte, pas le podium. Le
commentaire qui la documentait mentionnait les deux usages ensemble ; il
est corrigé pour ne plus décrire que celui qui subsiste.

### Conséquences

- Vérifié dans le navigateur : plusieurs clics consécutifs sur
  « Chercher » vont directement aux résultats, sans jamais rouvrir un
  modal.
- Mobile non concerné — `DiscoverScreen.js` n'a jamais eu ce modal, sa
  seule fonctionnalité de classement est le texte explicatif de D-054.

---

## D-062 — Amorçage de `local_signal.db` sur Railway par `SEED_DB_URL`

**Date :** 2026-09-24 · **Statut :** actif

### Contexte

Question directe : *« si je dois envoyer la bdd pour la mettre sur
Railway, j'envoie quelle dossier ou fichier ? »* Contrairement à
`DATABASE_URL` côté Postgres (que Railway/Supabase fournissent déjà
peuplé de rien à brancher), SQLite n'a pas d'équivalent : un volume
Railway démarre vide, et `local_signal.db` (18 Mo, 10 000+ restaurants,
vérité terrain, comptes de démonstration) n'a aucun moyen d'y arriver
tout seul. Deux options existaient : migrer vers Postgres (déjà prévu par
`config.DATABASE_URL`/`IS_POSTGRES`, ROADMAP.md §4), ou garder SQLite pour
ce déploiement. **Choix explicite de l'utilisateur : garder SQLite**,
rapide, suffisant pour une démonstration/soutenance.

### Décision

**`SEED_DB_URL`, variable d'environnement facultative, vide partout
ailleurs.** Au démarrage (`backend/main.py`, avant `init_db()`) : si elle
est définie, si `DATABASE_URL` ne l'est PAS (n'a aucun sens sous
Postgres), et si le fichier à `DB_PATH` n'existe pas encore, l'API
télécharge le contenu de `SEED_DB_URL` et l'écrit à `DB_PATH`. Sans
condition remplie, ce bloc ne fait strictement rien — aucun effet pour un
contributeur local ni pour la CI.

**Ne se déclenche qu'une fois, jamais en écrasant.** La garde
`not os.path.exists(config.DB_PATH)` est ce qui rend l'opération sûre à
laisser en place : un redémarrage ou un redéploiement qui retrouve déjà
un fichier ne le retélécharge jamais — sinon un redémarrage effacerait de
vraies inscriptions ou de vrais comptes restaurateur créés depuis la mise
en ligne.

**Mise en œuvre concrète, communiquée à l'utilisateur :**
1. Attacher un Volume au service Railway (ex. monté sur `/data`).
2. Poser `DB_PATH=/data/local_signal.db` sur ce service (déjà lu par
   `config.py`, LS-21).
3. Héberger `local_signal.db` à une URL accessible — le plus simple sans
   nouvelle dépendance : l'attacher comme fichier binaire à une Release
   GitHub du dépôt. **En PRIVÉ si le dépôt ou la release peut l'être** :
   le fichier porte de vraies adresses e-mail et des empreintes de mot de
   passe (jamais en clair, D-016/D-018, mais une empreinte reste une
   donnée personnelle) — pas un fichier à exposer publiquement.
4. Poser `SEED_DB_URL` sur cette URL, déployer : le premier démarrage
   amorce le volume, les suivants ne retouchent plus rien.

### Conséquences

- Aucun changement pour qui ne pose pas `SEED_DB_URL` — vérifié :
  `backend.main` s'importe sans erreur avec la variable absente.
- Si le projet migre un jour vers Postgres (ROADMAP.md §4), ce mécanisme
  devient inutile de lui-même (`DATABASE_URL` définie désactive la
  condition) — pas besoin de le retirer à ce moment-là.


---

## D-063 — Business plan v2 : Pass Voyageur temporel, restaurateurs gratuits, avis utilisateurs retirés

**Date :** 2026-09-27 · **Statut :** SUPERSÉDÉE par D-067 (2026-10-05) pour le
modèle économique (Pass Voyageur, gratuité restaurateur) ; le retrait des avis
utilisateurs reste en vigueur · **Supersède :** D-056 et D-057
(abonnement restaurateur), la partie « abonnement mensuel » de LS-refonte/D-049,
et D-039 (avis laissés par nos utilisateurs)

### Contexte

Le business plan v2, rédigé par un membre de l'équipe, change le modèle
économique. Il ne fait plus payer que la demande (les voyageurs), sans
commission, et remplace l'abonnement mensuel par un **Pass Voyageur
temporel** payé une seule fois, sur le modèle d'une eSIM ou d'un pass
transport. La publicité (AdMob sur mobile, AdSense sur le web) valorise
l'audience gratuite. Demande explicite de l'utilisateur : appliquer ce modèle
dans le web et le mobile, rendre tout gratuit pour les restaurateurs en
gardant une page qui leur montre ce qu'ils peuvent faire, et retirer les
avis utilisateurs.

### Problème

L'interface affichait un abonnement client à 3 €/mois et un abonnement
restaurateur à 10 €/mois, qui débloquait le détail des visites. Ces deux
offres contredisaient le nouveau modèle. Les avis déposés par les
utilisateurs n'entraient déjà pas dans le score (D-001), mais ils
réintroduisaient visuellement la popularité dans un produit construit pour
s'en passer. Ils exposaient aussi le produit à la modération et au
contentieux, et ne servaient plus aucun objectif.

### Décision

1. **Trois Pass Voyageur remplacent l'abonnement** : Pass Week-end
   (3 jours, 2,99 € TTC), Pass Semaine (7 jours, 4,99 € TTC, offre phare),
   Pass Annuel (12 mois, 14,99 € TTC). Les trois donnent les mêmes avantages
   (tous les résultats, filtres avancés dont la fourchette de score, scans
   illimités, recherches illimitées, favoris, pas de publicité). Seule la
   durée change. L'offre gratuite garde les 5 premiers résultats, le score
   et son explication. Les tarifs sont écrits dans `Pricing.jsx` (web) et
   `PricingScreen.js` (mobile).
2. **Aucun changement de modèle de données pour le Pass** : un Pass actif
   reste représenté par `role = "subscriber"`, tout le contrôle d'accès
   existant (`_require_abonne`, limite de résultats, filtre premium)
   s'applique tel quel. Le bouton de paiement reste bloqué (D-049).
   **L'expiration à la fin de la durée achetée n'est pas implémentée** :
   elle viendra avec le vrai paiement (colonne d'expiration posée par le
   webhook), sans quoi elle n'aurait rien à mesurer.
3. **Restaurateurs gratuits** : `GET /api/restaurateur/mon-restaurant/visites`
   rend le détail des visites à tout restaurateur validé. Les routes
   `/api/restaurateur/abonnement[/annuler]`, le champ
   `restaurateur_abonne` de `UserResponse` et `set_claim_abonne` sont
   retirés. La colonne `restaurant_claims.abonne` reste en base, inerte :
   on ne supprime pas une donnée acquise.
   `PricingRestaurateur.jsx` devient `PourLesRestaurateurs.jsx`, une page
   qui présente ce qu'un restaurateur **peut** faire (revendiquer ou créer
   sa fiche, coordonnées, photo, fréquentation) et ce qui **ne s'achète
   pas** (le classement, le score, la carte). On y accède par le pied de
   page (« Restaurateurs ») et par le menu d'un compte restaurateur.
4. **Avis utilisateurs retirés** : les routes publiques
   `GET/POST/DELETE /api/restaurant/{id}/avis` et les composants `Avis`
   (web et mobile) sont supprimés, ainsi que l'étape « avis facultatif »
   du scan mobile et l'ajout d'avis par l'admin. **Les avis déjà en base
   sont conservés** : l'admin peut toujours les lire et les supprimer
   (modération), et ils restent dans l'export RGPD.
5. CGU et politique de confidentialité mises à jour (web et mobile).

### Conséquences

- Le test d'API des avis devient un test d'invariant : déposer ou lire un
  avis renvoie 404/405, même connecté.
- Plus aucun chemin de revenu ne passe par le restaurateur. C'est cohérent
  avec la contrainte n°1 (CLAUDE.md §2) : un restaurant qui paierait
  pourrait laisser croire qu'il est mieux classé.
- Le détail des visites nomme désormais les visiteurs connectés auprès de
  **tout** restaurateur validé, plus seulement des abonnés. Les CGU le
  disent (§5). À réexaminer avec la question RGPD plus large de
  l'exposition des identités (nom plutôt qu'e-mail).
- La publicité (AdMob, AdSense) figure dans les limites de l'offre
  gratuite mais **n'est pas intégrée** : c'est un chantier distinct.
- Le business plan v2 contient encore une incohérence que l'équipe doit
  trancher. Le résumé annonce un équilibre en année 3 (+5 900 €, et
  +2 400 € dans le tableau 24), alors que le compte de résultat (tableau 23)
  donne −26 350 € la même année. Ce n'est pas une question de code.

---

## D-064 — Dire sur la carte pourquoi un restaurant moins bien noté passe devant

**Date :** 2026-09-27 · **Statut :** SUPERSÉDÉE par D-065

### Contexte

Le classement combine le Local Signal (0,70) et la proximité (0,30), comme
le prévoit D-008. Un restaurant à 7,9/10 situé à 310 m passe donc devant un
8,4/10 situé à 440 m. L'explication n'existait que derrière le bouton
« Classement : authenticité et proximité » (ⓘ). Retour utilisateur : on ne
comprend pas l'ordre sans cliquer, et il ne faut pas que l'explication prenne
beaucoup de place.

### Décision

Une ligne apparaît **sur les seules cartes qui devancent un restaurant mieux
noté et plus éloigné** : « Classé avant *X* (8,4/10, 440 m) car plus
proche ». Parmi les restaurants devancés, on retient celui qui a le meilleur
score, c'est-à-dire le cas le plus surprenant. La comparaison se fait sur le
score arrondi tel qu'il est affiché, pour ne jamais écrire « plus proche
qu'un 7,8 » à côté d'un autre 7,8. Le calcul se fait côté client
(`devancesParProximite`, `lib/display.js` sur le web et le mobile) à partir
des seuls résultats affichés : il n'y a rien de nouveau dans l'API, et on ne
mélange pas le statique et le dynamique (D-008).

### Conséquences

- Aucune ligne quand l'ordre suit déjà le score : l'explication n'apparaît
  que là où l'ordre surprend.
- L'infobulle du classement reste en place pour l'explication générale.

---

## D-065 — La distance devant le score, et « Le plus proche » sur le restaurant le plus proche

**Date :** 2026-09-27 · **Statut :** actif · **Supersède :** D-064

### Contexte

La phrase introduite par D-064 (« Classé avant X (8,4/10, 440 m) car plus
proche ») ajoutait une ligne à la carte et s'alignait mal. Retour
utilisateur : c'est trop de texte, il suffit d'écrire la distance.

### Décision

Sur chaque carte, la distance à l'utilisateur est affichée **juste devant le
score**, sur la ligne de la barre et du verdict. Le ou les restaurants les
plus proches parmi les résultats affichés portent « Le plus proche · 270 m »,
mis en couleur. La pastille de distance posée sur la photo disparaît : la
distance ne s'affiche plus qu'à un seul endroit. La fonction
`devancesParProximite` est retirée.

### Conséquences

- La distance lue à côté du score suffit à comprendre qu'un 7,9 à 310 m
  passe devant un 8,4 à 440 m, sans phrase supplémentaire.
- Le calcul reste côté client, à partir des résultats affichés. Rien ne
  change dans l'API.

---

## D-066 — Carte interactive : MapLibre + OpenFreeMap « Bright »

**Date :** 2026-09-27 · **Statut :** actif

### Contexte

La carte de Discover était une vignette Leaflet de 220 px, avec des tuiles
OpenStreetMap en images. Elle était jugée « nulle » : petite, datée, et non
interactive, puisqu'elle n'affichait qu'une infobulle avec le nom. On l'a
comparée aux cartes d'Uber, TheFork et TripAdvisor, toutes vectorielles.
Une tentative précédente avec CARTO Voyager avait échoué, parce que ces
tuiles exigent désormais une clé.

### Options comparées (tarifs relevés le 2026-09-27 sur les sites officiels)

| Option | Gratuit par mois | Ensuite | Compte et clé |
|---|---|---|---|
| OpenFreeMap (vectoriel, données OSM) | illimité, usage commercial autorisé | 0 | aucun |
| Mapbox GL JS | 50 000 chargements | 5 $ les 1 000 | oui |
| Google Maps JS (Dynamic Maps) | 10 000 chargements | 7 $ les 1 000 | oui, facturation activée |

Un aperçu interactif présentant quatre styles OpenFreeMap sur les vrais
restaurants du Quartier latin a été montré à l'utilisateur, qui a choisi
« Bright ».

### Décision

- **MapLibre GL JS + style OpenFreeMap « Bright »**
  (`https://tiles.openfreemap.org/styles/bright`), dans
  `components/ResultsMap.jsx`. Leaflet reste utilisé pour `LocationPicker`.
- **Carte étroite mais haute** : une première version élargissait la
  page jusqu'à 1520 px pour une carte très large. L'utilisateur l'a refusée,
  parce que les restaurants doivent rester l'élément principal et que tout
  doit rester aligné sur le gabarit du site. La version retenue garde le
  gabarit de 1180 px, avec les colonnes 220 px | liste | 320 px. La carte
  occupe toute la hauteur visible et reste collée pendant le défilement. La
  répartition des verdicts (`StatsPanel`) passe sous la liste.
- **Interactive et synchronisée avec la liste** :
  - les repères portent le rang du restaurant et la couleur de son verdict ;
  - un clic sur un repère ouvre une bulle (nom, verdict, score, distance,
    « Voir la fiche ») et fait défiler la liste jusqu'au restaurant, qui est
    mis en évidence ;
  - survoler un restaurant dans la liste grossit son repère.
- La bulle est construite avec des nœuds DOM et `textContent` : le nom d'un
  restaurant n'est jamais interprété comme du HTML.

### Conséquences

- Pas de clé, pas de coût, pas de quota. La page dépend d'un service tiers
  gratuit (tiles.openfreemap.org). Si ce service disparaît, il suffit de
  changer l'URL du style, et OpenFreeMap peut aussi être auto-hébergé.
- Nouvelle dépendance web : `maplibre-gl`, chargée à la demande dans son
  propre fichier.
- Le mobile garde sa carte actuelle : le portage vers Expo est un chantier
  distinct.

---

## D-067 — Modèle économique du mémoire : voyageur gratuit, offres restaurateurs et hôtels, règle de neutralité ; photos de façade Panoramax

**Date :** 2026-10-05 · **Statut :** actif · **Supersède :** D-063 (sauf le
retrait des avis utilisateurs, qui reste en vigueur)

### Contexte

Après la soutenance blanche, le jury a montré la faiblesse du modèle D-063 :
avec TheFork le voyageur obtient des remises, avec Local Signal il aurait payé
pour accéder à des restaurants, et le chiffre d'affaires projeté ne rémunérait
personne. Le mémoire (§4.3, tableau 27) a reconstruit le modèle : le voyageur
ne paie rien ; paient ceux qui ont un intérêt direct à ce qu'il trouve un bon
restaurant indépendant. Demande explicite de l'utilisateur : aligner le code
sur ce business plan (« tous les comptes utilisateurs seront gratuits », refaire
l'abonnement des restos, un compte par abonné, faire quelque chose pour les
hôtels).

Dans le même temps, la photo des cartes de résultats ne s'affichait plus.

### Problème

1. L'application faisait encore payer le voyageur (Pass Voyageur, 5 résultats
   puis cartes verrouillées, quota de 5 recherches par jour, filtre de score et
   favoris réservés) et ne vendait rien aux professionnels.
2. Un abonnement de visibilité risque de faire du Local Signal une mesure de
   l'abonnement plutôt que de l'authenticité. C'est la promesse centrale du
   mémoire (« le paiement ne modifie jamais le score ni la position ») : elle
   doit être garantie par le code, pas seulement écrite.
3. Photos : les 462 URL `lh3.googleusercontent.com` stockées par le collecteur
   payant sont signées et ont expiré (403, mesuré sur un échantillon le
   5 octobre). Elles ne sont de toute façon pas un socle (CLAUDE.md §9). Sur
   10 644 restaurants, ~1 400 seulement avaient une photo affichable, et aucune
   source ne couvrait les restaurants sans site web — précisément les
   invisibles que le projet veut montrer (§2).

### Décision

1. **Voyageur gratuit.** Plus de limite de résultats, de quota de recherches
   ni de fonctionnalité réservée. Les favoris sont ouverts à tout compte
   voyageur. Les routes `/api/subscribe*` sont retirées ; une migration
   repasse les comptes `subscriber` en `user` (ils ne perdent rien).
2. **Offres professionnelles** (démonstration, aucun paiement encaissé) :
   - restaurateur : fiche gratuite ; **Visibilité 29 € HT/mois** (mention
     « Partenaire », fiche enrichie, détail des visites) ; **Visibilité+
     59 € HT/mois** (en plus : encart « À découvrir dans le quartier ») ;
   - **hôtel ou conciergerie, 49 € HT/mois** : compte `hotel` créé avec sa
     fiche, page publique `/hotel/<slug>` à ses couleurs, QR code généré dans
     le navigateur, compteur d'ouvertures de la page ;
   - premier mois offert à la première souscription ; une table
     `abonnements` porte l'historique (une ligne résiliée n'est jamais
     effacée). Le total des consultations reste gratuit pour tout
     restaurateur.
3. **Règle de neutralité, garantie par un test.** Rien dans `abonnements` n'est
   lu par le scoring. L'étiquette `partenaire` est posée APRÈS le tri
   (`_marquer_partenaires`) ; l'encart Visibilité+ est une liste séparée
   (`a_decouvrir`), jamais mêlée au classement. La page d'un hôtel affiche le
   classement normal centré sur l'hôtel : l'hôtel ne choisit ni n'ordonne.
   `backend/tests/test_offres_pro.py` vérifie que les scores et l'ordre de
   tout le classement sont identiques avant et après chaque souscription (sur
   une copie de la base).
4. **Photos.** Ordre de priorité : photo déposée par le restaurateur (D-059),
   puis photo publiée par le site du restaurant (`og:image`, collecteur
   étendu aux URL Google expirées), puis **photo de rue Panoramax** orientée
   vers la façade (nouveau collecteur `backend/ingestion/web/panoramax.py`),
   puis l'illustration générée. Panoramax est la base libre de photos de rue
   d'OpenStreetMap France et de l'IGN ; ses photos sont sous CC-BY-SA ou
   Etalab, d'où les colonnes `photo_source` / `photo_credit` et le crédit
   affiché sur la photo. Les URL Google restent en base mais ne sont plus
   affichées.

### Conséquences

- Couverture photo : 9 466 restaurants sur 10 644 (89 %) ont une photo
  affichable, contre ~1 400 avant (1 407 via le site du restaurant, 8 059 via
  Panoramax). Les 1 178 restants n'ont aucune photo de rue à moins de 40 m.
  Une photo de rue n'est pas toujours cadrée sur la façade (le dernier palier
  de recherche accepte toute photo de la rue) : c'est assumé, « au mieux une
  photo » (retour utilisateur).
- Les photos de carte (`menu_photo_urls`) sont aussi des URL Google expirées :
  elles sont filtrées à l'affichage ; aucune source de remplacement pour
  l'instant.
- Nouvelles tables : `abonnements`, `hotels`, `hotel_visites`. Nouveau rôle :
  `hotel`. Nouvelle dépendance web : `qrcode` (MIT).
- Pages retirées : `Pricing.jsx`, `PourLesRestaurateurs.jsx`, `LockedCard.jsx`
  (web), `PricingScreen.js`, `CarteVerrouillee.js` (mobile). Nouvelles pages
  web : `OffresPro.jsx`, `SignupHotel.jsx`, `EspaceHotel.jsx`,
  `HotelPublic.jsx`. Les espaces pro (restaurateur, hôtel) restent sur le web.
- `/hotel/<slug>` est la seule adresse profonde de l'application : un
  hébergement de production doit renvoyer `index.html` pour ce chemin.
- Reste à faire : paiement réel (Stripe), rapport mensuel et garantie de vues
  de Visibilité+, publicité discrète non alimentaire (5 % du CA prévu), fiche
  enrichie (plusieurs photos, traductions).

### Révision du 2026-10-05 (même jour) — photos

Les photos de rue Panoramax et les `og:image` récoltées dans la journée ont été
**retirées** après retour de l'utilisateur, captures à l'appui : panoramas 360°
déformés, chaussée plutôt que façade, images de site sans rapport (un site
affichait une photo de football). « Avant c'était beaucoup mieux » :
l'illustration générée vaut mieux qu'une photo hors sujet. Les colonnes
`photo_url` ont été restaurées à l'identique depuis la sauvegarde du matin
(zéro différence vérifiée).

À la place, choix de l'utilisateur : l'**API officielle Google Places**, pour
le **Quartier latin seulement** (tout Paris coûterait ~150-300 USD) :
462 restaurants sur 467 ont une photo Google. La photo est relayée à chaque
affichage par `/api/restaurant/{id}/photo`, **jamais stockée**
(`PHOTO_CACHE_ENABLED` passe à `false` par défaut) ; une référence périmée est
rafraîchie depuis le `place_id`. Ordre d'affichage : photo du restaurateur,
Google, `photo_url` d'origine, illustration. Chaque photo affichée est un
appel facturé au-delà du quota gratuit mensuel : poser un plafond de budget
dans la console Google Cloud.

Les collecteurs `og_image.py` (étendu) et `panoramax.py` (filtre anti-360°)
restent dans le dépôt mais ne doivent pas être relancés sans nouvelle décision.

---

## D-068 — Tableau de bord restaurateur et page « Mon abonnement »

**Date :** 2026-10-05 · **Statut :** actif

### Contexte

Demande de l'utilisateur : « un vrai dashboard avec de vraies fonctionnalités
abonnées — il peut voir ses clients, l'autre non », et une page dédiée aux
abonnements, séparée, « comme avant ». L'espace restaurateur de D-067 mêlait
fiche, offre et fréquentation sur une seule page.

### Problème

Pour que l'offre Visibilité se vende, ce qu'elle débloque doit se voir — sans
pour autant retirer au restaurateur gratuit ce que le mémoire lui promet
(§4.3, tableau 27 : fiche, score, demandes de table).

### Décision

1. **Espace en deux onglets** : « Tableau de bord » (par défaut) et « Ma
   fiche » (photo, coordonnées). **Page « Mon abonnement » à part**, avec son
   lien dans la barre : formule actuelle, comparatif ligne par ligne des trois
   formules, souscription, résiliation, historique.
2. **Gratuit pour toute fiche** : Local Signal et verdict, rang dans le
   quartier, total des consultations du mois, demandes de table.
3. **Réservé à l'offre Visibilité (et Visibilité+)** : courbe des
   consultations sur 30 jours, évolution par rapport au mois précédent,
   heures de visite, liste des clients (voyageurs connectés qui ont consulté
   la fiche). Sans offre, ces blocs sont **montrés floutés** avec des données
   d'exemple et le bouton d'essai — jamais avec les données d'un autre
   restaurant. La règle est appliquée par le serveur
   (`/api/restaurateur/tableau-de-bord` renvoie `null`), pas seulement par
   l'interface ; `test_offres_pro.py` le vérifie.
4. Neutralité inchangée : rien dans le tableau de bord n'agit sur le score ou
   le rang, et la page le rappelle.

### Conséquences

- Nouvelles routes : `GET /api/restaurateur/tableau-de-bord`,
  `GET /api/pro/abonnement/historique`. L'ancienne route
  `/api/restaurateur/mon-restaurant/visites` reste (compatibilité).
- Les séries sont calculées en Python, pas en SQL de dates, pour rester
  identiques sous SQLite et Postgres.
- Le mobile n'a pas d'espace restaurateur : les comptes pros restent sur le web.
- Photo de Yokorama masquée (`photo_masquee`) : sa première photo Google était
  une photo de football.

