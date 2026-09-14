// apps/web/src/lib/filtres.js
//
// Constantes des filtres pour le web (LS-15).
//
// LE GROS VIENT DE `packages/shared/filtres.js`, source unique, recopiée ici
// par `node packages/shared/build-css.js` sous le nom `filtres.generated.js`.
// Les bornes de budget, l'état initial et le comptage des filtres actifs y
// vivent : ils décrivent la même chose sur les deux interfaces, et les
// dupliquer à la main revenait à programmer leur divergence.
//
// NE RESTE ICI QUE CE QUI DIFFÈRE LÉGITIMEMENT. Les rayons portent les mêmes
// valeurs en mètres des deux côtés, mais des libellés plus longs : un écran
// large les accueille, une pastille de téléphone non. C'est une divergence
// d'affichage, pas de comportement.
//
// Ce fichier existe aussi parce qu'un module exportant à la fois un composant
// et des constantes casse le rechargement à chaud de React.

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
  { value: 400, label: "5 min à pied" },
  { value: 800, label: "10 min à pied" },
  { value: 1500, label: "20 min à pied" },
  { value: 3000, label: "Tout le quartier" },
];
