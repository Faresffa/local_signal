// packages/shared/tokens.js
//
// SOURCE UNIQUE DE VÉRITÉ du design (D-022).
//
// Le web et le mobile lisent ce fichier — le premier via `tokens.css` généré,
// le second en important directement. Aucune couleur, aucun espacement ne doit
// être écrit en dur ailleurs : c'est ainsi que les deux interfaces restent
// identiques au fil des évolutions.
//
// Après modification :   node packages/shared/build-css.js
//
// Palette : le rouge profond et le crème sont l'identité existante du projet.
// Les conventions de mise en page (carte photo dominante, filtres en pastilles,
// bouton de réservation proéminent) sont celles du secteur de la réservation
// de restaurant — des conventions d'usage, pas l'identité d'un concurrent.

export const tokens = {
  color: {
    // --- Marque ---
    brand: "#c1121f",
    brandDark: "#8d0c17",
    brandLight: "#f8e6e7",

    // --- Surfaces ---
    background: "#fffbf3",
    surface: "#ffffff",
    surfaceAlt: "#faf6ee",
    border: "#e8e0d3",
    borderStrong: "#d5c9b6",

    // --- Texte ---
    text: "#1c1a17",
    textMuted: "#6f6961",
    textFaint: "#8b857c",
    textInverse: "#ffffff",

    // --- Sémantique ---
    // Utilisées par le verdict d'authenticité : vert = profil local,
    // ambre = mixte ou information incertaine, rouge = profil touristique.
    local: "#2d6a4f",
    localSoft: "#e7f2ec",
    mixed: "#b8860b",
    mixedSoft: "#fdf4e0",
    tourist: "#c1121f",
    touristSoft: "#f8e6e7",
  },

  // Échelle géométrique en base 4 : suffisamment de paliers pour composer,
  // assez peu pour rester cohérent.
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    sm: 8,
    md: 14,
    lg: 22,
    pill: 999,
  },

  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },

  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.65,
  },

  // Ombres discrètes : la hiérarchie vient de la photo et de l'espacement,
  // pas d'effets de profondeur appuyés.
  shadow: {
    card: "0 1px 3px rgba(28, 26, 23, 0.06)",
    raised: "0 4px 16px rgba(28, 26, 23, 0.10)",
  },
};

export default tokens;
