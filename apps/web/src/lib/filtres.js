// apps/web/src/lib/filtres.js
//
// Constantes des filtres, isolées du composant (D-034, D-037).
//
// Elles vivent ici et non dans `Filtres.jsx` parce qu'un fichier qui exporte à
// la fois un composant et des constantes casse le rechargement à chaud de
// React. La règle vaut aussi pour la lisibilité : ce sont des données de
// calibration, pas de l'interface.
//
// CE FICHIER DOIT RESTER IDENTIQUE À `apps/mobile/src/lib/filtres.js`. Les
// deux interfaces proposent les mêmes filtres, avec les mêmes bornes : un
// utilisateur qui passe du web au mobile ne doit pas trouver deux produits
// différents. À factoriser dans packages/shared avec le client API.

/**
 * Bornes de la fourchette de budget, en euros.
 *
 * Le budget était découpé en quatre tranches fixes (< 12, 12–18, 18–25, > 25).
 * Une tranche impose un découpage arbitraire : quelqu'un qui cherche entre 14
 * et 22 € devait cocher deux cases, et personne ne pouvait dire « moins de
 * 10 ». Une fourchette continue laisse l'utilisateur poser ses propres bornes.
 *
 * Les valeurs viennent de la distribution mesurée sur les 297 prix relevés du
 * Quartier latin :
 *
 *     p5   7,50 €      p50  15,00 €      p90  46,00 €
 *     p25 10,90 €      p75  19,55 €      max 181,00 €
 *
 * MIN à 5 € : sous ce seuil, il ne reste rien — c'est le minimum observé.
 * MAX à 60 € : au-delà, on ne compte plus que 10 % des restaurants, tous très
 * dispersés (jusqu'à 181 €). Étirer la glissière jusqu'à 181 rendrait les
 * quatre-vingt-dix premiers pour cent illisibles, tassés sur un tiers de la
 * course. La borne haute vaut donc « et au-delà », sans plafond réel.
 *
 * À RECALIBRER si la zone change : ces bornes décrivent le Quartier latin.
 */
export const BUDGET_MIN = 5;
export const BUDGET_MAX = 60;
export const BUDGET_PAS = 1;

/** La borne haute atteinte signifie « sans limite », pas « exactement 60 € ». */
export const budgetSansPlafond = (max) => max >= BUDGET_MAX;

/** Libellé d'une fourchette, tel qu'affiché sur la pastille. */
export function libelleBudget(min, max) {
  if (min <= BUDGET_MIN && budgetSansPlafond(max)) return "Budget";
  if (min <= BUDGET_MIN) return `Jusqu'à ${max} €`;
  if (budgetSansPlafond(max)) return `${min} € et plus`;
  return `${min} – ${max} €`;
}

/** Rayons de recherche, exprimés en temps de marche plutôt qu'en mètres. */
export const RAYONS = [
  { value: 400, label: "5 min à pied" },
  { value: 800, label: "10 min à pied" },
  { value: 1500, label: "20 min à pied" },
  { value: 3000, label: "Tout le quartier" },
];

/** Rayon par défaut, et valeur de retour de la réinitialisation. */
export const RAYON_DEFAUT = 800;

/** État initial, aussi utilisé par la réinitialisation. */
export const FILTRES_VIDES = {
  budgetMin: BUDGET_MIN,
  budgetMax: BUDGET_MAX,
  ouvert: false,
  reservation: false,
  avecCarte: false,
  cuisine: null,
};

/** Le budget est-il réellement restreint, ou couvre-t-il toute l'échelle ? */
export const budgetActif = (f) =>
  f.budgetMin > BUDGET_MIN || !budgetSansPlafond(f.budgetMax);

/** Nombre de filtres actifs, affiché sur le bouton « Tous les filtres ». */
export function compterFiltres(f) {
  return (
    (budgetActif(f) ? 1 : 0) +
    (f.ouvert ? 1 : 0) +
    (f.reservation ? 1 : 0) +
    (f.avecCarte ? 1 : 0) +
    (f.cuisine ? 1 : 0)
  );
}
