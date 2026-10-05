# Vidéo de présentation — Local Signal

Deux versions, montées en code avec [Remotion](https://www.remotion.dev/) :

- **`Presentation3D`** (celle à diffuser) : environ 98 s, en 1920×1080 et
  30 i/s, avec des scènes en 3D ([Three.js](https://threejs.org/) via
  `@remotion/three`).
- `Presentation` : la première version, en 2D.

Tous les écrans sont de **vraies captures** de l'app web et de l'app mobile
(Expo). Elles sont prises avec un compte Pass Voyageur de démonstration, depuis
le **Quartier latin** (devant Tcham, rue Mouffetard). La ville en 3D est
construite à partir des **vraies coordonnées** des restaurants de la base.

## Règle : chaque restaurant affiché a sa vraie photo

Un restaurant n'apparaît à l'écran que s'il a une photo réelle, téléchargée et
vérifiée : taille minimale, image non unie, pas de doublon. Concrètement :

- la galerie ne pioche que dans `public/data/featured.json`, qui ne contient
  que ces restaurants ;
- pour les captures de l'app, le point de départ a été choisi pour que les
  **5 premiers résultats** à 5 min à pied aient tous une photo. On n'en
  montre pas davantage.

## Refaire la vidéo

L'API (`:8000`), le web (`:5173`) et le mobile (`npm run web --prefix apps/mobile`,
`:8081`) doivent tourner. Voir `CLAUDE.md` §11.

```bash
python apps/video/capture/export_data.py   # depuis la racine : ville 3D + candidats
python apps/video/capture/fetch_photos.py  # vraies photos, vérifiées → featured.json
```

Ensuite, depuis `apps/video/` :

```bash
npm install
npm run capture                  # captures web + mobile (compte démo, Quartier latin)
node capture/menus.mjs           # photos de la carte en haute définition
node capture/cards.mjs           # cartes de la galerie
npm run studio                   # aperçu interactif
npm run render                   # → out/local-signal-presentation-3d.mp4
```

Les images de tiers (photos, captures, cartes) ne sont jamais versionnées :
voir `.gitignore`.

Le rendu 3D a besoin de `--gl=angle` sous Windows : c'est déjà dans
`npm run render`.

## Structure (version 3D, `src/v3/`)

| Fichier | Scène |
|---|---|
| `City.jsx` | Paris en 3D : popularité contre Local Signal, plongée sur le Quartier latin |
| `Focus.jsx` | Les Crêpes de Louis-Marie : la photo en 3D et les 4 indicateurs |
| `WebApp.jsx` | l'app web, en panneaux dans l'espace |
| `Mobile.jsx` | trois téléphones 3D (app Expo), puis le scan de carte au laser |
| `Gallery.jsx` | carrousel des adresses locales du Quartier latin |
| `Closing.jsx` | chiffres, Pass Voyageur et restaurateurs, logo animé |
| `three.jsx` | textures, caméra à images clés, palette |

## Les chiffres affichés, et d'où ils viennent

- **Plus de 10 000 restaurants, 10 644** : lignes de `restaurants` dans
  `local_signal.db`. La ville 3D en montre 10 585 : les doublons sont retirés,
  et seuls ceux compris dans le cadre de Paris sont gardés.
- **« Quelques géants écrasent tout le reste »** : la hauteur des tours est
  proportionnelle au nombre d'avis Google. La distribution est très inégale.
  - Attention, affirmation **vérifiée et écartée** : « les tours poussent
    autour des monuments » est fausse. Les très commentés ne sont pas plus
    proches des sites touristiques (130 m contre 137 m). La vidéo ne le dit
    donc pas.
- **467 restaurants et 4 528 comparaisons** : la vérité terrain du Quartier
  latin (D-042 à D-045).
- **0,33 contre 0,18** : corrélation de Spearman avec le classement de terrain,
  sur 85 restaurants de moins de 300 avis. L'écart est **indicatif**, et la
  vidéo le précise.
- **Pass Voyageur 2,99 €, 4,99 € et 14,99 €** : tarifs D-063, tirés de
  `apps/web/src/pages/Pricing.jsx`.
- **« Profil local · 8,7/10 »** : le score stocké en base. Il a été calculé
  avec les pondérations D-013, car la base n'a pas encore été recalculée après
  D-053.
