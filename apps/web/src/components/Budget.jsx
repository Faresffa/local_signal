// apps/web/src/components/Budget.jsx
//
// Fourchette de budget, à deux poignées (D-037).
//
// POURQUOI DEUX `input[type=range]` SUPERPOSÉS PLUTÔT QU'UNE BIBLIOTHÈQUE.
// Le navigateur ne fournit pas de glissière à deux poignées. Les superposer
// donne gratuitement ce qu'une bibliothèque met des kilo-octets à réimplémenter
// mal : le clavier (flèches, Début/Fin), le tactile, les lecteurs d'écran, et
// le respect des préférences système. Le seul travail restant est de laisser
// passer les clics vers la bonne poignée — c'est ce que fait `pointer-events`
// dans la feuille de style.
//
// LES DEUX POIGNÉES NE PEUVENT PAS SE CROISER. Sans cette contrainte, on
// obtient un minimum supérieur au maximum, donc une requête qui ne renvoie
// jamais rien et que l'utilisateur ne sait pas défaire.

import { BUDGET_MAX, BUDGET_MIN, BUDGET_PAS, budgetSansPlafond } from "../lib/filtres";

export default function Budget({ min, max, onChange }) {
  // Position des poignées en pourcentage, pour peindre la portion retenue.
  const gauche = ((min - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const droite = ((max - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  const changerMin = (v) => onChange(Math.min(Number(v), max), max);
  const changerMax = (v) => onChange(min, Math.max(Number(v), min));

  return (
    <div className="budget">
      <div className="budget__valeurs">
        <span>{min <= BUDGET_MIN ? `${BUDGET_MIN} €` : `${min} €`}</span>
        <span>{budgetSansPlafond(max) ? `${BUDGET_MAX} € et plus` : `${max} €`}</span>
      </div>

      <div className="budget__piste">
        <div
          className="budget__retenu"
          style={{ left: `${gauche}%`, right: `${100 - droite}%` }}
        />
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_PAS}
          value={min}
          onChange={(e) => changerMin(e.target.value)}
          aria-label="Budget minimum, en euros"
          className="budget__poignee budget__poignee--min"
        />
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_PAS}
          value={max}
          onChange={(e) => changerMax(e.target.value)}
          aria-label="Budget maximum, en euros"
          className="budget__poignee budget__poignee--max"
        />
      </div>

      <p className="budget__note">
        Prix médian d'un plat. Un restaurant dont le prix est inconnu reste
        affiché : l'absence d'information ne l'écarte pas.
      </p>
    </div>
  );
}
