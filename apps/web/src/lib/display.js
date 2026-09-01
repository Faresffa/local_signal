// apps/web/src/lib/display.js
//
// Traductions d'affichage partagées par les écrans web.
// Le mobile a son équivalent : toute modification ici doit y être répercutée
// tant que packages/shared ne porte pas encore cette logique.

// Seuils du verdict. PROVISOIRES : à caler sur le jeu labellisé (D-006).
const SEUIL_LOCAL = 70;
const SEUIL_MIXTE = 45;

/**
 * Traduit un Local Signal en verdict lisible.
 *
 * Règle d'affichage (D-009) : on ne montre jamais le score chiffré par défaut.
 * L'utilisateur veut savoir où manger, pas lire un tableau de bord.
 *
 * Une confiance faible ne produit pas un verdict tiède mais un verdict
 * explicitement incertain : l'incertitude se dit, elle ne se maquille pas.
 */
export function verdict(localSignal, confidence = 1) {
  if (localSignal == null) {
    return { label: "Non évalué", tone: "unknown" };
  }
  if (confidence < 0.4) {
    return { label: "Évaluation provisoire", tone: "unknown" };
  }
  if (localSignal >= SEUIL_LOCAL) return { label: "Profil local", tone: "local" };
  if (localSignal >= SEUIL_MIXTE) return { label: "Profil mixte", tone: "mixed" };
  return { label: "Profil touristique", tone: "tourist" };
}

/** Distance lisible : mètres en dessous d'un kilomètre, kilomètres au-delà. */
export function distance(metres) {
  if (metres == null) return null;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Horaires OSM : format brut peu lisible, on le nettoie a minima. */
export function hours(osmOpeningHours) {
  if (!osmOpeningHours) return null;
  return osmOpeningHours.replace(/;/g, " · ").replace(/,/g, ", ");
}
