// apps/web/src/components/DetailCalcul.jsx
//
// Décomposition chiffrée du Local Signal, indicateur par indicateur (D-034).
//
// CE PANNEAU N'EST PAS DESTINÉ À L'UTILISATEUR FINAL. D-009 impose de ne
// montrer aucun score par défaut : un voyageur veut une liste de restaurants,
// pas un tableau de bord, et il n'a pas à connaître l'algorithme. Ce panneau
// sert à vérifier le calcul pendant le développement et à instruire le
// mémoire — d'où son repli par défaut et son intitulé sans ambiguïté.
//
// Ce qu'il montre et qu'aucune phrase d'explication ne peut rendre :
//   - la contribution en points de chaque indicateur ;
//   - le poids EFFECTIF après redistribution, qui diffère du poids déclaré dès
//     qu'un indicateur manque (D-012) ;
//   - les observations brutes qui ont produit la note ;
//   - la vérification que la somme des contributions égale le Local Signal.

import { useState } from "react";
import { CaretDown, CaretRight, Warning } from "@phosphor-icons/react";

const LIBELLE = {
  menu: "Carte",
  language: "Langue des avis",
  price: "Prix",
  tourist_zone: "Pression touristique",
};

/** Rend lisible une observation brute sans en masquer la valeur. */
function ligneDetail(cle, valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (Array.isArray(valeur)) {
    return valeur.length ? valeur.join(", ") : "aucune";
  }
  if (typeof valeur === "number") {
    return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(3);
  }
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  if (typeof valeur === "object") return null;
  return String(valeur);
}

export default function DetailCalcul({ detail }) {
  const [ouvert, setOuvert] = useState(false);

  if (!detail?.disponible) return null;

  const somme = detail.indicateurs.reduce((t, i) => t + i.contribution, 0);
  // Contrôle d'intégrité affiché : si la somme ne retombe pas sur le score,
  // c'est le calcul qu'il faut regarder, pas l'affichage.
  const coherent = Math.abs(somme - detail.local_signal) < 0.05;

  return (
    <section className="calcul">
      <button className="calcul__bascule" onClick={() => setOuvert((o) => !o)}>
        {ouvert ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        Détail du calcul
        <span className="calcul__badge">vue technique</span>
      </button>

      {ouvert && (
        <div className="calcul__corps">
          <p className="calcul__entete">
            Local Signal <strong>{detail.local_signal?.toFixed(2)}</strong>
            {" · "}confiance <strong>{detail.confiance?.toFixed(2)}</strong>
            {" · "}poids disponible{" "}
            <strong>{(detail.poids_disponible_total * 100).toFixed(0)} %</strong>
          </p>

          <table className="calcul__table">
            <thead>
              <tr>
                <th>Indicateur</th>
                <th className="num">Valeur</th>
                <th className="num">Poids déclaré</th>
                <th className="num">Poids effectif</th>
                <th className="num">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {detail.indicateurs.map((i) => (
                <tr key={i.indicateur} className={i.disponible ? "" : "is-absent"}>
                  <td>
                    {LIBELLE[i.indicateur] ?? i.indicateur}
                    {!i.disponible && <span className="calcul__absent"> indisponible</span>}
                  </td>
                  <td className="num">{i.disponible ? i.valeur.toFixed(3) : "—"}</td>
                  <td className="num">{i.poids_declare.toFixed(2)}</td>
                  <td className="num">
                    {i.disponible ? i.poids_effectif.toFixed(3) : "0"}
                  </td>
                  <td className="num">
                    {i.disponible ? `${i.contribution.toFixed(2)} pts` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="calcul__somme">
                <td colSpan={4}>Somme des contributions</td>
                <td className="num">
                  {somme.toFixed(2)} pts {coherent ? "✓" : "⚠ écart"}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Observations brutes : ce que le modèle a relevé, avant tout calcul. */}
          {detail.indicateurs
            .filter((i) => i.disponible && Object.keys(i.details).length > 0)
            .map((i) => (
              <div key={i.indicateur} className="calcul__obs">
                <h4>{LIBELLE[i.indicateur] ?? i.indicateur} — ce qui a été observé</h4>
                <dl>
                  {Object.entries(i.details).map(([k, v]) => {
                    const rendu = ligneDetail(k, v);
                    return rendu === null ? null : (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{rendu}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}

          {detail.indicateurs_manquants.length > 0 && (
            <p className="calcul__note">
              <Warning size={13} weight="fill" style={{ verticalAlign: "-2px" }} />{" "}
              Indicateurs indisponibles :{" "}
              <strong>{detail.indicateurs_manquants.join(", ")}</strong>. Leur poids
              est redistribué sur les autres — l'absence réduit la confiance, elle ne
              pénalise pas le score.
            </p>
          )}

          {!detail.ponderations_calibrees && (
            <p className="calcul__note calcul__note--alerte">
              Pondérations <strong>provisoires</strong>, non calibrées sur un jeu
              labellisé. Ces chiffres ne sont pas encore défendables tels quels.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
