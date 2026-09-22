# Prompt à coller dans l'autre discussion

---

Je veux une refonte graphique de l'appli web (`apps/web`, React 19 + Vite).
Utilise le skill `ui-ux-pro-max` pour la méthode et le design, et le MCP `21st`
pour générer/référencer des composants — **mais je n'ai que 2 appels gratuits
sur ce MCP, donc ne le consomme pas en exploration**.

Contrainte de méthode, dans cet ordre :

1. **D'abord, lis le code sans MCP.** Parcours `apps/web/src/` (composants dans
   `components/`, pages dans `pages/`, tokens dans `index.css` et
   `packages/shared/`) pour comprendre l'existant : ce qui est déjà cohérent,
   ce qui ne l'est pas, où sont les incohérences visuelles.
2. **Charge le skill `ui-ux-pro-max` et prépare un plan complet de refonte**
   (palette, typographie, espacements, composants clés à retravailler :
   `RestaurantCard`, `BarreSignal`, `WhyPanel`, `Nav`, `Filtres`, les pages
   `Discover`/`Detail`/`Login`/`Signup`/`Reserve`) **avant d'appeler le MCP**.
   Le plan doit être assez précis pour qu'il ne reste plus qu'à l'exécuter.
3. **Utilise le MCP `21st` seulement pour les 2 décisions les plus
   structurantes** — typiquement : (a) le système de design global (palette +
   typo + composants de base : boutons, cartes, inputs) et (b) le composant le
   plus complexe/le plus visible (probablement `RestaurantCard` ou la page
   `Discover`). Regroupe tout ce qu'il faut dans chacun de ces 2 appels — ne
   fais pas d'aller-retour, pose une seule requête complète et précise par
   appel.
4. **Tout le reste de la refonte se fait à la main**, en appliquant à la
   plume les patterns obtenus via les 2 appels MCP (mêmes tokens, mêmes
   règles d'espacement, même logique de composant) à tous les autres
   composants et pages. Pas de 3e appel MCP, même si tu penses que ce serait
   plus simple — improvise à partir de ce que les 2 premiers appels ont déjà
   établi.
5. Respecte les règles du projet (`CLAUDE.md`) :
   - Les tokens de design partagés vivent dans `packages/shared/`, recopiés
     dans les apps par `node packages/shared/build-css.js`
     (`*.generated.js`, ne jamais éditer à la main) — passe par ce mécanisme,
     pas par une duplication CSS locale.
   - Pas de couleurs/tailles en dur dispersées dans les composants si un
     token existe déjà ou peut être créé.
   - Le score (Local Signal) reste caché par défaut, visible seulement
     derrière un « pourquoi ? » (`WhyPanel`) — la refonte ne doit pas changer
     cette règle produit, juste son habillage visuel.
   - Identifiants en anglais, texte utilisateur en français, commentaires en
     français si nécessaire (mais éviter les commentaires sauf si le pourquoi
     n'est pas évident).
6. Avant de conclure, lance `cd apps/web && npm run dev` et vérifie
   visuellement (via navigateur/screenshot) le rendu réel sur au moins les
   pages `Discover` et `Detail` — pas seulement que ça compile.

Confirme-moi le plan de l'étape 2 avant de consommer le premier appel MCP.
