// apps/web/src/lib/filtres.js
//
// Constantes des filtres, isolées du composant (D-034).
//
// Elles vivent ici et non dans `Filtres.jsx` parce qu'un fichier qui exporte à
// la fois un composant et des constantes casse le rechargement à chaud de
// React. La règle vaut aussi pour la lisibilité : les tranches sont des
// données de calibration, pas de l'interface.

/**
 * Tranches de budget, calées sur la distribution réelle du Quartier latin —
 * prix médian de 15 €, premier décile vers 10, dernier vers 25.
 *
 * Les bornes doivent rester IDENTIQUES à celles de
 * `backend/core/filters/criteres.py` : le libellé affiché ici et le filtrage
 * appliqué là-bas décrivent la même chose, et diverger tromperait l'utilisateur.
 *
 * À recalibrer si la zone change : « abordable » n'a pas la même borne à Paris
 * et ailleurs.
 */
export const TRANCHES = [
  { cle: "petit", label: "Moins de 12 €" },
  { cle: "moyen", label: "12 – 18 €" },
  { cle: "eleve", label: "18 – 25 €" },
  { cle: "tres_eleve", label: "Plus de 25 €" },
];

/** Rayons de recherche, exprimés en temps de marche plutôt qu'en mètres. */
export const RAYONS = [
  { value: 400, label: "5 min à pied" },
  { value: 800, label: "10 min à pied" },
  { value: 1500, label: "20 min à pied" },
  { value: 3000, label: "Tout le quartier" },
];

/**
 * Rayon par défaut, et valeur de retour de la réinitialisation.
 *
 * Les deux étaient désynchronisés — l'état démarrait à 800 m, « Réinitialiser »
 * renvoyait à 1500 : remettre à zéro élargissait la recherche au lieu de la
 * remettre dans son état initial.
 */
export const RAYON_DEFAUT = 800;

/** État initial, aussi utilisé par la réinitialisation. */
export const FILTRES_VIDES = {
  tranchePrix: null,
  ouvert: false,
  reservation: false,
  avecCarte: false,
  cuisine: null,
};
