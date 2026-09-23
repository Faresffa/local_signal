// apps/web/src/components/StatsPanel.jsx
//
// Répartition des résultats affichés (LS-refonte).
//
// Compte les verdicts de la page courante, rien de plus. Pas de nouvel appel
// serveur : la liste est déjà en mémoire, `verdict()` est la même fonction
// que celle qui colore chaque carte — la colonne latérale ne peut donc pas
// raconter une histoire différente de celle de la liste.

import { verdict } from "../lib/display";

const ORDRE = [
  { tone: "local", label: "Profil local" },
  { tone: "mixed", label: "Profil mixte" },
  { tone: "tourist", label: "Profil touristique" },
  { tone: "unknown", label: "Non évalué" },
];

export default function StatsPanel({ restaurants }) {
  const comptes = { local: 0, mixed: 0, tourist: 0, unknown: 0 };
  restaurants.forEach((r) => {
    const { tone } = verdict(r.local_signal, r.confidence);
    comptes[tone] += 1;
  });

  const total = restaurants.length;
  if (total === 0) return null;

  return (
    <div className="discover__stats">
      <h3 className="discover__statsTitle">Répartition de cette recherche</h3>
      <ul className="discover__statsList">
        {ORDRE.filter((o) => comptes[o.tone] > 0).map((o) => (
          <li key={o.tone} className="discover__statsRow">
            <span className={`discover__statsDot discover__statsDot--${o.tone}`} />
            <span className="discover__statsLabel">{o.label}</span>
            <span className="discover__statsValue">{comptes[o.tone]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
