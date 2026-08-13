// apps/mobile/src/theme.js
//
// Le mobile ne définit AUCUNE valeur : il réexporte les jetons partagés
// (D-022). Toute couleur ou espacement écrit en dur ici recréerait la
// divergence que packages/shared existe pour empêcher.
//
// Modifier une valeur : packages/shared/tokens.js, puis
//   node packages/shared/build-css.js   (pour répercuter côté web)

import tokens from "../../../packages/shared/tokens.js";

export const colors = tokens.color;
export const spacing = tokens.spacing;
export const radius = tokens.radius;
export const fontSize = tokens.fontSize;
export const fontWeight = tokens.fontWeight;
export const lineHeight = tokens.lineHeight;

export default tokens;
