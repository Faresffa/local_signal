// GÉNÉRÉ par packages/shared/build-css.js. NE PAS ÉDITER À LA MAIN.
// Modifier packages/shared/filtres.js puis relancer le script.
//
//   node packages/shared/build-css.js
// packages/shared/filtres.js
//
// SOURCE UNIQUE des constantes de filtrage (LS-15, D-022).
//
// Ces valeurs étaient dupliquées à l'identique dans `apps/web/src/lib/filtres.js`
// et `apps/mobile/src/lib/filtres.js`, avec un commentaire dans chacun demandant
// de garder les deux synchronisés à la main. C'est le genre de consigne qui
// tient jusqu'au premier changement pressé — et les bornes de budget décrivent
// la même chose des deux côtés : diverger tromperait l'utilisateur.
//
// LES BORNES DOIVENT RESTER IDENTIQUES À `backend/core/filters/criteres.py` et
// au traitement de `budget_min` / `budget_max` dans l'API. Le libellé affiché
// ici et le filtrage appliqué là-bas décrivent le même critère.
//
// CE QUI N'EST PAS ICI, ET POURQUOI. Les rayons de recherche restent propres à
// chaque interface : les libellés longs (« 10 min à pied ») tiennent sur un
// écran large, pas sur une pastille de téléphone. Ce sont les mêmes valeurs en
// mètres, mis en mots différemment — une divergence d'affichage, pas de
// comportement.
//
// COMMENT CE FICHIER PARVIENT AUX DEUX APPLICATIONS. Il est recopié dans
// chacune par `packages/shared/build-css.js`, comme les jetons de design. Le
// mobile ne peut pas l'importer directement : Metro ne résout pas de façon
// fiable les fichiers situés hors du dossier de l'application, et forcer sa
// configuration s'est révélé fragile (D-022). Générer une copie depuis la même
// source atteint le même but sans dépendre d'un comportement d'outil — et le
// web suit la même voie, pour qu'il n'y ait qu'un seul mécanisme à comprendre.

/**
 * Bornes de la fourchette de budget, en euros.
 *
 * Le budget était découpé en quatre tranches fixes. Une tranche impose un
 * découpage arbitraire : quelqu'un qui cherche entre 14 et 22 € devait cocher
 * deux cases, et « moins de 10 » était inexprimable.
 *
 * Les valeurs viennent de la distribution mesurée sur les 297 prix relevés du
 * Quartier latin :
 *
 *     p5   7,50 €      p50  15,00 €      p90  46,00 €
 *     p25 10,90 €      p75  19,55 €      max 181,00 €
 *
 * MIN à 5 € : sous ce seuil il ne reste rien — c'est le minimum observé.
 * MAX à 60 € : au-delà on ne compte plus que 10 % des restaurants, très
 * dispersés jusqu'à 181 €. Étirer la glissière jusque-là tasserait les
 * quatre-vingt-dix premiers pour cent sur un tiers de la course. La borne haute
 * vaut donc « et au-delà », sans plafond réel — c'est ce que traduit
 * `budgetSansPlafond`, et c'est pourquoi le client n'envoie pas `budget_max`
 * quand elle est atteinte.
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

/**
 * Rayon par défaut, et valeur de retour de la réinitialisation.
 *
 * Les deux étaient désynchronisés — l'état démarrait à 800 m, « Réinitialiser »
 * renvoyait à 1500 : remettre à zéro élargissait la recherche au lieu de la
 * ramener à son état initial.
 */
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
