// apps/mobile/src/components/ScoreRange.js
//
// Fourchette du Local Signal, à deux poignées (D-050). Pendant mobile de
// `apps/web/src/components/ScoreRange.jsx` — même mécanique que Budget.js,
// via RangeSlider.js. Réservée aux abonnés (voir Filtres.js : ce composant
// ne fait que la glissière, la garde vit à l'appelant).

import { SCORE_MAX, SCORE_MIN, SCORE_PAS } from "../lib/filtres";
import RangeSlider from "./RangeSlider";

export default function ScoreRange({ min, max, onChange }) {
  return (
    <RangeSlider
      min={min}
      max={max}
      borneMin={SCORE_MIN}
      borneMax={SCORE_MAX}
      pas={SCORE_PAS}
      onChange={onChange}
      libelleMin={`${min.toFixed(1)}/10`}
      libelleMax={max >= SCORE_MAX ? "10/10" : `${max.toFixed(1)}/10`}
      labelAccessibiliteMin="Local Signal minimum, sur 10"
      labelAccessibiliteMax="Local Signal maximum, sur 10"
      note="Le Local Signal du restaurant, indépendant de qui cherche (D-008)."
    />
  );
}
