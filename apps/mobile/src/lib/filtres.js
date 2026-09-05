// apps/mobile/src/lib/filtres.js
//
// Constantes des filtres (D-034). Miroir de `apps/web/src/lib/filtres.js`.
//
// Les bornes doivent rester IDENTIQUES à celles de
// `backend/core/filters/criteres.py` et à celles du web : le libellé affiché
// et le filtrage appliqué décrivent la même chose, et diverger tromperait
// l'utilisateur. À factoriser dans packages/shared avec le client API, quand
// la duplication deviendra coûteuse.

/**
 * Tranches de budget, calées sur la distribution réelle du Quartier latin —
 * prix médian de 15 €, premier décile vers 10, dernier vers 25.
 *
 * Libellés plus courts qu'en web : les pastilles défilent horizontalement sur
 * un écran de téléphone, « Moins de 12 € » y tiendrait mal.
 */
export const TRANCHES = [
  { cle: "petit", label: "< 12 €" },
  { cle: "moyen", label: "12–18 €" },
  { cle: "eleve", label: "18–25 €" },
  { cle: "tres_eleve", label: "> 25 €" },
];

/** Rayons de recherche, exprimés en temps de marche plutôt qu'en mètres. */
export const RAYONS = [
  { value: 400, label: "5 min" },
  { value: 800, label: "10 min" },
  { value: 1500, label: "20 min" },
  { value: 3000, label: "Quartier" },
];

/** Rayon par défaut, et valeur de retour de la réinitialisation. */
export const RAYON_DEFAUT = 800;

/** État initial, aussi utilisé par la réinitialisation. */
export const FILTRES_VIDES = {
  tranchePrix: null,
  ouvert: false,
  reservation: false,
  avecCarte: false,
  cuisine: null,
};
