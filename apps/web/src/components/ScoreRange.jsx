// apps/web/src/components/ScoreRange.jsx
//
// Fourchette du Local Signal, à deux poignées — même mécanique que
// Budget.jsx (D-037), appliquée au score plutôt qu'au prix. Premier filtre
// du produit assis directement sur le Local Signal (D-050), réservé aux
// abonnés (voir Filtres.jsx : ce composant ne fait que la glissière, la
// garde vit à l'appelant).

import { SCORE_MAX, SCORE_MIN, SCORE_PAS } from "../lib/filtres";

export default function ScoreRange({ min, max, onChange }) {
  const gauche = ((min - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
  const droite = ((max - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;

  const changerMin = (v) => onChange(Math.min(Number(v), max), max);
  const changerMax = (v) => onChange(min, Math.max(Number(v), min));

  return (
    <div className="budget">
      <div className="budget__valeurs">
        <span>{min.toFixed(1)}/10</span>
        <span>{max >= SCORE_MAX ? "10/10" : `${max.toFixed(1)}/10`}</span>
      </div>

      <div className="budget__piste">
        <div
          className="budget__retenu"
          style={{ left: `${gauche}%`, right: `${100 - droite}%` }}
        />
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={SCORE_PAS}
          value={min}
          onChange={(e) => changerMin(e.target.value)}
          aria-label="Local Signal minimum, sur 10"
          className="budget__poignee budget__poignee--min"
        />
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={SCORE_PAS}
          value={max}
          onChange={(e) => changerMax(e.target.value)}
          aria-label="Local Signal maximum, sur 10"
          className="budget__poignee budget__poignee--max"
        />
      </div>

      <p className="budget__note">
        Le Local Signal du restaurant, indépendant de qui cherche (D-008).
      </p>
    </div>
  );
}
