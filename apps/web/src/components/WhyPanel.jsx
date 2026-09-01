// apps/web/src/components/WhyPanel.jsx
//
// Explication « pourquoi ce restaurant ? » (D-009).
//
// L'explicabilité n'est pas cosmétique : côté produit c'est ce qui crée la
// confiance, côté mémoire c'est le chapitre sur l'IA explicable.
//
// Deux niveaux : des raisons en français, toujours visibles, et le détail du
// calcul replié pour les curieux. Le score chiffré n'apparaît que dans le
// second niveau, jamais dans le premier.

import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

const LIBELLES = {
  menu: "Carte du restaurant",
  language: "Langue des avis",
  price: "Prix face au quartier",
  tourist_zone: "Hors zone touristique",
};

export default function WhyPanel({ scoring }) {
  const [open, setOpen] = useState(false);

  const reasons = scoring?.reasons ?? [];
  const signals = scoring?.signals ?? {};
  const confidence = scoring?.confidence ?? 0;

  if (!reasons.length && !Object.keys(signals).length) return null;

  return (
    <section className="why">
      <h2 className="why__title">Pourquoi ce restaurant</h2>

      <ul className="why__list">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <button
        className="linkbtn"
        style={{ marginTop: 14 }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Masquer le détail" : "Voir le détail du calcul"}
        {open ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
      </button>

      {open && (
        <div className="why__detail">
          <div className="why__row">
            <span>Local Signal</span>
            <strong>{Math.round(scoring.local_signal ?? 0)} / 100</strong>
          </div>

          {Object.entries(signals).map(([name, signal]) => (
            <div className="why__row" key={name}>
              <span>{LIBELLES[name] ?? name}</span>
              <strong>
                {signal.value == null
                  ? "non disponible"
                  : `${Math.round(signal.value * 100)} %`}
              </strong>
            </div>
          ))}

          <p className="why__note">
            Confiance : {Math.round(confidence * 100)} %. Les pondérations sont
            provisoires. Elles seront dérivées d'un jeu de données labellisé,
            pas choisies à la main.
          </p>
        </div>
      )}
    </section>
  );
}
