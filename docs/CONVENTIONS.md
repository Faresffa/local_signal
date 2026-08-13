# Conventions du projet

Les règles d'ingénierie de Local Signal. Le *pourquoi* de chaque décision est
dans [`DECISIONS.md`](DECISIONS.md) ; ce fichier ne donne que les règles.

---

## 1. La contrainte centrale — le paradoxe de l'invisibilité

> Le problème n'est pas le manque de restaurants authentiques, c'est leur manque
> de visibilité.

Un restaurant invisible a **peu ou pas d'avis**. Donc :

**Tout critère de scoring qui dépend du volume d'avis ou de la notoriété
disqualifie mécaniquement les restaurants que le projet veut mettre en avant.**

C'est la règle n°1, elle prime sur tout le reste. À chaque ajout ou modification
d'un critère, poser la question :

> *Ce critère fonctionne-t-il pour un restaurant qui a 0 avis et pas de site web ?*

Si non, il ne peut pas être un critère majeur.

---

## 2. Architecture du scoring — statique / dynamique

Deux natures de score, jamais mélangées ([D-008](DECISIONS.md)).

**Local Signal — statique**, précalculé et stocké en base, recalculé en batch.
*Ce qu'est le restaurant :* signal menu, langue des avis, anomalie de prix,
zone touristique.

**Pertinence — dynamique**, calculée à la requête.
*Ce qui convient à l'utilisateur maintenant :* distance, ouverture, budget,
cuisine, contraintes alimentaires.

> **Ne jamais recalculer un signal statique dans le chemin d'une requête
> utilisateur.** C'est ce qui permet de rester instantané sur une base nationale.

### Règles de scoring

1. **Un signal indisponible retourne `None`, jamais `0.0`** ([D-012](DECISIONS.md)).
   Le moteur redistribue son poids sur les signaux disponibles. L'incertitude va
   dans `confidence`, pas dans le score.
2. **Toute fonction de signal retourne une valeur normalisée entre 0 et 1.**
   La pondération et la mise à l'échelle sur 100 se font uniquement dans `engine.py`.
3. **Toute constante numérique porte son statut de calibration** en commentaire :
   `à calibrer`, `dérivé des labels`, ou `justifié par …`. Aucune valeur magique.
4. **Les pondérations actuelles sont provisoires.** Elles seront dérivées du jeu
   labellisé ([protocole](methodologie/evaluation.md)), pas choisies à la main.
   Ne jamais les présenter comme justifiées.

---

## 3. Ce qu'on montre à l'utilisateur

- **Par défaut : aucun score chiffré.** L'utilisateur veut une liste de
  restaurants, pas un tableau de bord.
- **Derrière un « pourquoi ? » :** des raisons en langage naturel, puis le détail
  du calcul replié.
- **Quand la confiance est faible :** afficher « évaluation provisoire » plutôt
  qu'un chiffre net. L'incertitude se dit, elle ne se maquille pas.

---

## 4. Le scan de carte

Le modèle **observe, il ne juge pas** ([D-014](DECISIONS.md)).

On ne lui demande jamais une note d'authenticité — uniquement des faits
vérifiables : nombre de plats, cuisines, langues, formule touristique, photos
des plats. Le score est calculé ensuite par du code déterministe.

Sinon le résultat devient irreproductible, inexplicable et incalibrable.

**Le prompt système fait partie de la méthode.** Toute modification se consigne
dans `DECISIONS.md`, au même titre qu'une pondération.

---

## 5. Structure du dépôt

```
backend/                     tout le Python
  main.py                    API FastAPI — point d'entrée
  config.py                  configuration + constantes de scoring
  core/scoring/              calcul des scores
  core/filters/              filtrage multi-critères
  ingestion/osm/             OpenStreetMap / Overpass — référentiel des lieux
  ingestion/google/          Places Photos — amorçage des menus
  ingestion/menu_scan/       vision : extraction et récolte
  db/                        SQLite : models, repository
  data/                      fixtures de test uniquement
  tests/

apps/web/                    React + Vite
apps/mobile/                 Expo / React Native

packages/shared/             jetons de design — source unique web + mobile

docs/                        décisions, roadmap, méthodologie, jeu labellisé
```

**Imports Python :** absolus, enracinés sur `backend`
(`from backend.core.scoring.engine import ...`). Pas de `sys.path`.
Tout se lance depuis la racine du dépôt.

---

## 6. Conventions de code

- **Identifiants en anglais**, chaînes destinées à l'utilisateur en français.
- **Commentaires et docstrings en français** — projet et mémoire francophones.
- **Pas de coordonnées en dur.** Le projet doit fonctionner dans n'importe quelle
  ville.
- **Aucune couleur ni espacement en dur** dans `apps/web` ou `apps/mobile`.
  Tout vient de `packages/shared/tokens.js` ([D-022](DECISIONS.md)) ; après
  modification, relancer `node packages/shared/build-css.js`.

---

## 7. Secrets

**Jamais de clé dans un fichier versionné.** `backend/config.py` est dans le
dépôt : y écrire une clé la publie.

Les clés viennent de l'environnement, via un `.env` non versionné.
[`.env.example`](../.env.example) documente les variables attendues.

Une variable d'environnement système l'emporte sur le fichier — c'est ce qu'on
veut en production, où les secrets viennent de la plateforme.

---

## 8. Sources de données — ce qui est permis

| Source | Statut |
|---|---|
| **OpenStreetMap / Overpass** | ✅ référentiel des lieux. Libre, sans clause restrictive. |
| **Google Places API (New)** | ⚠️ photos uniquement, pour amorcer les menus. Stocker les **observations dérivées**, jamais les photos. |
| **Scraping de Google Maps** | ❌ suppose de contourner la détection de robots. Fragile, et indéfendable pour un produit. |
| **Google Places — avis** | ❌ plafonné à 5 avis par lieu, stockage interdit. Non exploitable pour le produit. |

---

## 9. Tests

```bash
python -m backend.tests.test_scoring
```

Ce sont des tests de **propriétés**, pas de valeurs : ils vérifient les
invariants issus des décisions (un restaurant sans avis n'est pas pénalisé, la
proximité d'un monument pénalise, la note n'influence pas le classement…).

Ils doivent rester verts après recalibration des pondérations. **Si un test
casse à la calibration, c'est la décision qu'il faut rouvrir, pas le test qu'il
faut ajuster.**

---

## 10. Traçabilité

Toute décision structurante — scoring, architecture, stack, produit — se consigne
dans [`DECISIONS.md`](DECISIONS.md) au format *contexte → problème → décision →
conséquences*.

On documente **le raisonnement**, pas seulement le changement : dans six mois, le
« pourquoi » aura plus de valeur que le « quoi ».

Ne jamais supprimer une entrée. Une décision annulée est marquée `SUPERSÉDÉE` et
remplacée par une nouvelle.
