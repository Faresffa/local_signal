// apps/mobile/src/lib/filtres.js
//
// Constantes des filtres pour le mobile (LS-15).
//
// LE GROS VIENT DE `packages/shared/filtres.js`, source unique, recopiée ici
// par `node packages/shared/build-css.js` sous le nom `filtres.generated.js`.
// Les bornes de budget, l'état initial et le comptage des filtres actifs y
// vivent : ils décrivent la même chose sur les deux interfaces, et les
// dupliquer à la main revenait à programmer leur divergence.
//
// NE RESTE ICI QUE CE QUI DIFFÈRE LÉGITIMEMENT. Les rayons portent les mêmes
// valeurs en mètres qu'en web, avec des libellés plus courts : une pastille de
// téléphone n'accueille pas « 10 min à pied ». C'est une divergence
// d'affichage, pas de comportement.

export {
  BUDGET_MIN,
  BUDGET_MAX,
  BUDGET_PAS,
  RAYON_DEFAUT,
  FILTRES_VIDES,
  budgetSansPlafond,
  budgetActif,
  libelleBudget,
  compterFiltres,
} from "./filtres.generated";

/** Rayons de recherche, exprimés en temps de marche plutôt qu'en mètres. */
export const RAYONS = [
  { value: 400, label: "5 min" },
  { value: 800, label: "10 min" },
  { value: 1500, label: "20 min" },
  { value: 3000, label: "Quartier" },
];
