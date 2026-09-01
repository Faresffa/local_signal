// apps/mobile/src/theme.js
//
// Le mobile ne définit AUCUNE valeur : il lit les jetons partagés (D-022).
// Toute couleur écrite en dur ici recréerait la divergence que
// packages/shared existe pour empêcher.
//
// `tokens.generated.js` est produit depuis packages/shared/tokens.js. Ne pas
// l'éditer : modifier la source puis relancer
//   node packages/shared/build-css.js

import { useColorScheme } from "react-native";

import tokens from "./tokens.generated";

export const spacing = tokens.spacing;
export const radius = tokens.radius;
export const fontSize = tokens.fontSize;
export const fontWeight = tokens.fontWeight;

/**
 * Palette du thème courant.
 *
 * Suit le réglage système, comme le web. Un utilisateur qui a mis son
 * téléphone en sombre ne veut pas d'une application qui l'éblouit.
 */
export function useColors() {
  const scheme = useColorScheme();
  return scheme === "dark" ? tokens.colorDark : tokens.color;
}

export default tokens;
