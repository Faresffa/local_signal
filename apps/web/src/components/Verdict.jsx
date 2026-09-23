// apps/web/src/components/Verdict.jsx
//
// Badge de verdict, avec le score chiffré à côté (D-050, supersède D-009).
// Un seul endroit pour ce rendu : RestaurantCard, Detail et le classement
// du podium l'affichaient chacun en JSX dupliqué avant ce composant.

import { scoreSur10, verdict } from "../lib/display";

export default function Verdict({ localSignal, confidence, className = "" }) {
  const v = verdict(localSignal, confidence);
  const score = scoreSur10(localSignal);

  return (
    <span className={`verdict verdict--${v.tone} ${className}`.trim()}>
      {v.label}
      {score && <span className="verdict__score">{score}/10</span>}
    </span>
  );
}
