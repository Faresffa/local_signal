// apps/web/src/components/Filtres.jsx
//
// Filtres de recherche (D-034).
//
// CE QUI N'EST PAS PROPOSÉ, ET POURQUOI. Aucun filtre sur la note ni sur le
// nombre d'avis, bien que les deux soient en base. Laisser l'utilisateur
// écarter « les restaurants sous 4 étoiles » lui ferait refaire le tri par
// popularité que le projet existe pour éviter (D-001, D-007) : le restaurant
// de quartier, avec ses trois avis, disparaîtrait de sa liste. Ces champs
// s'affichent sur la fiche, ils ne filtrent pas.
//
// UNE DONNÉE MANQUANTE N'EXCLUT JAMAIS. Un restaurant sans prix connu reste
// visible sous un filtre de budget, un restaurant sans horaires reste visible
// sous « ouvert maintenant ». Même règle que D-012 côté scoring : l'absence
// d'information ne devient pas un jugement défavorable — et les restaurants
// les moins renseignés sont justement ceux que le projet veut faire remonter.
//
// Le seul filtre où l'absence exclut est « carte lue », qui porte sur la
// présence même.
//
// PAS DE GROUPE « CUISINE » ICI. La barre de recherche en propose déjà la
// liste complète et écrit le même état ; deux contrôles pour un seul critère
// ne se contredisent pas, ils désorientent. Le compteur ci-dessous continue
// de compter la cuisine, et « Effacer » la remet à zéro.

import { Clock, Money, Notebook, X } from "@phosphor-icons/react";

import { FILTRES_VIDES, TRANCHES } from "../lib/filtres";


export default function Filtres({ valeurs, onChange }) {
  const { tranchePrix, ouvert, reservation, avecCarte, cuisine } = valeurs;

  const basculer = (cle, val) => onChange({ ...valeurs, [cle]: val });

  const actifs =
    (tranchePrix ? 1 : 0) + (ouvert ? 1 : 0) + (reservation ? 1 : 0) +
    (avecCarte ? 1 : 0) + (cuisine ? 1 : 0);

  return (
    <div className="filtres" role="group" aria-label="Filtres de recherche">

      <div className="filtres__groupe">
        <span className="filtres__titre">
          <Money size={14} weight="light" /> Budget
        </span>
        {TRANCHES.map((t) => (
          <button
            key={t.cle}
            className="chip"
            aria-pressed={tranchePrix === t.cle}
            onClick={() => basculer("tranchePrix", tranchePrix === t.cle ? null : t.cle)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="filtres__groupe">
        <span className="filtres__titre">
          <Clock size={14} weight="light" /> Disponibilité
        </span>
        <button
          className="chip"
          aria-pressed={ouvert}
          onClick={() => basculer("ouvert", !ouvert)}
        >
          Ouvert maintenant
        </button>
        <button
          className="chip"
          aria-pressed={reservation}
          onClick={() => basculer("reservation", !reservation)}
        >
          Réservation possible
        </button>
      </div>

      <div className="filtres__groupe">
        <span className="filtres__titre">
          <Notebook size={14} weight="light" /> Information
        </span>
        <button
          className="chip"
          aria-pressed={avecCarte}
          onClick={() => basculer("avecCarte", !avecCarte)}
          title="Restaurants dont la carte a été lue et analysée"
        >
          Carte analysée
        </button>
      </div>


      {actifs > 0 && (
        <button
          className="filtres__reset"
          onClick={() => onChange(FILTRES_VIDES)}
        >
          <X size={13} weight="bold" />
          Effacer {actifs} filtre{actifs > 1 ? "s" : ""}
        </button>
      )}

      <p className="filtres__note">
        Un restaurant dont l'information manque reste affiché : l'absence de
        donnée ne l'écarte pas.
      </p>
    </div>
  );
}
