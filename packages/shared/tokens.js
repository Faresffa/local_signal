// packages/shared/tokens.js
//
// SOURCE UNIQUE DE VÉRITÉ du design (D-022).
//
// Le web et le mobile lisent ce fichier : le premier via `tokens.css` généré,
// le second en important directement. Aucune couleur, aucun espacement ne doit
// être écrit en dur ailleurs. C'est ainsi que les deux interfaces restent
// identiques au fil des évolutions.
//
// Après modification :   node packages/shared/build-css.js
//
// Le rouge profond et le crème sont l'identité existante du projet. Les
// conventions de mise en page (carte photo dominante, filtres en pastilles,
// bouton de réservation proéminent) sont celles du secteur de la réservation
// de restaurant : des conventions d'usage, pas l'identité d'un concurrent.

// --- Mode clair (référence) -------------------------------------------------
const light = {
  brand: "#c1121f",
  brandHover: "#a50f1a",
  brandDark: "#8d0c17",
  brandSoft: "#fdecec",
  onBrand: "#ffffff",

  // Fonds : crème en page, blanc en surface. Le contraste entre les deux
  // porte la hiérarchie, ce qui évite d'empiler des ombres.
  background: "#fffbf3",
  surface: "#ffffff",
  surfaceAlt: "#faf6ee",
  surfaceSunken: "#f3ece0",
  border: "#e8e0d3",
  borderStrong: "#d5c9b6",

  text: "#1c1a17",
  textMuted: "#6f6961",
  textFaint: "#989186",
  textInverse: "#ffffff",

  // Verdict d'authenticité : vert local, ambre mixte, rouge touristique.
  local: "#2d6a4f",
  localSoft: "#e7f2ec",
  mixed: "#a8760a",
  mixedSoft: "#fdf3e0",
  tourist: "#c1121f",
  touristSoft: "#fdecec",

  overlay: "rgba(28, 26, 23, 0.55)",
  skeleton: "#efe7da",
  skeletonSheen: "#f8f3ea",
};

// --- Mode sombre ------------------------------------------------------------
// Pas d'inversion mécanique : les fonds gardent la chaleur du crème en version
// sombre, et le rouge est éclairci pour rester lisible et reconnaissable.
// Ni noir pur ni blanc pur, qui écrasent la profondeur.
const dark = {
  brand: "#e8505f",
  brandHover: "#f0616f",
  brandDark: "#c1121f",
  brandSoft: "#3a1e21",
  onBrand: "#1a1210",

  background: "#191614",
  surface: "#211d1a",
  surfaceAlt: "#272220",
  surfaceSunken: "#151211",
  border: "#332d29",
  borderStrong: "#463e38",

  text: "#f5efe6",
  textMuted: "#a9a096",
  textFaint: "#7d746a",
  textInverse: "#1c1a17",

  local: "#5fbf92",
  localSoft: "#1b2f26",
  mixed: "#d9a441",
  mixedSoft: "#332818",
  tourist: "#e8505f",
  touristSoft: "#3a1e21",

  overlay: "rgba(10, 8, 7, 0.7)",
  skeleton: "#2a2522",
  skeletonSheen: "#332d29",
};

export const tokens = {
  color: light,
  colorDark: dark,

  // Échelle géométrique en base 4 : assez de paliers pour composer,
  // assez peu pour rester cohérent.
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 72,
  },

  // Un seul système de rayons, appliqué partout (verrou de forme).
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
    display: 38,
    displayLg: 52,
  },

  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.65,
  },

  // Ombres teintées vers le fond, jamais du noir pur sur du clair.
  shadow: {
    card: "0 1px 2px rgba(60, 48, 32, 0.06)",
    raised: "0 6px 20px rgba(60, 48, 32, 0.10)",
    overlay: "0 18px 48px rgba(60, 48, 32, 0.18)",
  },

  // Une seule courbe d'accélération pour tout le produit.
  motion: {
    fast: "140ms",
    base: "220ms",
    slow: "380ms",
    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
};

export default tokens;
