# apps/mobile — Application mobile (Expo / React Native)

Stack : **Expo / React Native** ([D-010](../../docs/DECISIONS.md)).

## Lancer

```bash
cd apps/mobile && npm start
```

Puis scanner le QR code avec **Expo Go** (iOS / Android), ou `a` / `i` pour un
émulateur.

Le backend doit tourner en parallèle, depuis la racine du dépôt :

```bash
python -m uvicorn backend.main:app --reload --port 8000 --host 0.0.0.0
```

> `--host 0.0.0.0` est nécessaire : sans lui, le serveur n'écoute que sur
> `localhost` et le téléphone ne peut pas l'atteindre.

## Configurer l'adresse de l'API

Sur un téléphone physique, `localhost` désigne **le téléphone**, pas la machine
de développement. Il faut donc pointer sur l'IP locale de la machine :

```bash
# .env  (non versionné)
EXPO_PUBLIC_API_BASE=http://192.168.1.20:8000
```

Trouver l'IP : `ipconfig` (Windows) ou `ifconfig` (macOS/Linux).

## Écrans

| Écran | Rôle |
|---|---|
| **Autour de moi** | Géolocalisation, restaurants proches, explication « pourquoi ? » |
| **Scanner** | Photo de la carte → `POST /api/menu/scan` → verdict |

`react-navigation` n'est volontairement pas installé : avec deux destinations,
une barre d'onglets locale suffit. À adopter dès qu'un troisième écran ou une
pile de navigation apparaît.

## La fonctionnalité centrale : le scan

L'utilisateur est **debout devant le restaurant**. Il photographie la carte
affichée en vitrine et obtient une réponse en quelques secondes, sans qu'aucun
avis ne soit nécessaire.

C'est la raison d'être de l'app mobile — et la réponse directe au paradoxe de
l'invisibilité ([D-001](../../docs/DECISIONS.md), [D-004](../../docs/DECISIONS.md)).
C'est aussi ce qui justifie React Native plutôt qu'une PWA : l'accès caméra doit
être natif et fiable.

## Règle d'affichage

**Aucun score chiffré par défaut** ([D-009](../../docs/DECISIONS.md)).
L'utilisateur voit un verdict lisible et des raisons en langage naturel ; le
détail du calcul est replié derrière « pourquoi ? ».

Quand l'information est faible, l'interface affiche « évaluation provisoire »
plutôt qu'un chiffre net — l'incertitude se dit, elle ne se maquille pas
([D-003](../../docs/DECISIONS.md), [D-012](../../docs/DECISIONS.md)).

## Partage de code avec le web

`src/api.js` duplique aujourd'hui `apps/web/src/api.js`. La factorisation dans
`packages/shared/` se fera quand la duplication deviendra coûteuse — pas avant.
