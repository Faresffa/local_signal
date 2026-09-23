// apps/mobile/src/components/Budget.js
//
// Fourchette de budget, à deux poignées (D-037). Pendant mobile de
// `apps/web/src/components/Budget.jsx`.
//
// FIN WRAPPER AUTOUR DE RangeSlider.js. La mécanique tactile (PanResponder,
// mesure impérative dans une feuille modale) est générique et vit là-bas
// depuis D-050 — ce fichier ne porte plus que le vocabulaire du budget :
// bornes en euros, libellés, note.

import { BUDGET_MAX, BUDGET_MIN, BUDGET_PAS, budgetSansPlafond } from "../lib/filtres";
import RangeSlider from "./RangeSlider";

export default function Budget({ min, max, onChange }) {
  return (
    <RangeSlider
      min={min}
      max={max}
      borneMin={BUDGET_MIN}
      borneMax={BUDGET_MAX}
      pas={BUDGET_PAS}
      onChange={onChange}
      libelleMin={min <= BUDGET_MIN ? `${BUDGET_MIN} €` : `${min} €`}
      libelleMax={budgetSansPlafond(max) ? `${BUDGET_MAX} € et plus` : `${max} €`}
      labelAccessibiliteMin="Budget minimum, en euros"
      labelAccessibiliteMax="Budget maximum, en euros"
      note="Prix médian d'un plat. Un restaurant dont le prix est inconnu reste affiché : l'absence d'information ne l'écarte pas."
    />
  );
}
