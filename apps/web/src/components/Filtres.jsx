// apps/web/src/components/Filtres.jsx
//
// Barre de filtres (D-034, refondue D-035).
//
// FORME : une seule ligne horizontale, pas un panneau empilé. Le panneau
// précédent poussait les résultats hors de l'écran — on filtrait sans voir ce
// qu'on filtrait. Les critères les plus utilisés restent sur la ligne, tout le
// reste vit derrière un bouton « Tous les filtres » qui porte le nombre de
// filtres actifs.
//
// LE PANNEAU AFFICHE SON EFFET AVANT QU'ON VALIDE : « Voir N restaurants »,
// recalculé à chaque changement. Sans ça, on coche à l'aveugle et on découvre
// une liste vide après coup.
//
// CE QUI N'EST PAS PROPOSÉ, ET POURQUOI. Aucun filtre sur la note ni sur le
// nombre d'avis, bien que les deux soient en base — et bien que ce soit le
// premier filtre qu'on trouve ailleurs. Laisser l'utilisateur écarter « les
// restaurants sous 4 étoiles » lui ferait refaire le tri par popularité que le
// projet existe pour éviter (D-001, D-007) : le restaurant de quartier, avec
// ses trois avis, disparaîtrait de sa liste. Ces champs s'affichent sur la
// fiche, ils ne filtrent pas.
//
// UNE DONNÉE MANQUANTE N'EXCLUT JAMAIS. Un restaurant sans prix connu reste
// visible sous un filtre de budget, un restaurant sans horaires reste visible
// sous « ouvert maintenant ». Même règle que D-012 côté scoring : l'absence
// d'information ne devient pas un jugement défavorable — et les restaurants les
// moins renseignés sont justement ceux que le projet veut faire remonter.
//
// Le seul filtre où l'absence exclut est « carte analysée », qui porte sur la
// présence même.

import { useEffect, useRef, useState } from "react";
import {
  CaretDown, Clock, ForkKnife, MagnifyingGlass, Money, Notebook, SlidersHorizontal, X,
} from "@phosphor-icons/react";

import { FILTRES_VIDES, TRANCHES } from "../lib/filtres";

/** Ferme au clic extérieur et à Échap — sans quoi un menu ouvert piège l'écran. */
function useFermeture(ouvert, fermer) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    const auClic = (e) => { if (!ref.current?.contains(e.target)) fermer(); };
    const auClavier = (e) => { if (e.key === "Escape") fermer(); };
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert, fermer]);

  return ref;
}

/** Pastille qui ouvre un menu sous elle. */
function Menu({ icone, label, actif, children, largeur = 260 }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermeture(ouvert, () => setOuvert(false));

  return (
    <div className="fbar__enveloppe" ref={ref}>
      <button
        type="button"
        className="fbar__pastille"
        aria-expanded={ouvert}
        aria-haspopup="true"
        data-actif={actif ? "true" : undefined}
        onClick={() => setOuvert((o) => !o)}
      >
        {icone}
        {label}
        <CaretDown size={13} weight="bold" className="fbar__caret" />
      </button>

      {ouvert && (
        <div className="fbar__menu" style={{ "--menu-largeur": `${largeur}px` }}>
          {typeof children === "function" ? children(() => setOuvert(false)) : children}
        </div>
      )}
    </div>
  );
}

/** Bascule simple, cochée ou non. */
function Case({ coche, onChange, children }) {
  return (
    <label className="fbar__case">
      <input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export default function Filtres({
  valeurs, onChange, cuisines = [], nbResultats = null, chargement = false,
}) {
  const { tranchePrix, ouvert, reservation, avecCarte, cuisine } = valeurs;

  const [tousOuvert, setTousOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const refTous = useFermeture(tousOuvert, () => setTousOuvert(false));

  const modifier = (cle, val) => onChange({ ...valeurs, [cle]: val });

  const actifs =
    (tranchePrix ? 1 : 0) + (ouvert ? 1 : 0) + (reservation ? 1 : 0) +
    (avecCarte ? 1 : 0) + (cuisine ? 1 : 0);

  const trancheLabel = TRANCHES.find((t) => t.cle === tranchePrix)?.label;
  const cuisineLabel = cuisines.find((c) => c.value === cuisine)?.label;

  // La liste des cuisines dépasse les deux cents entrées : sans champ de
  // recherche, la trouver demande de faire défiler une colonne interminable.
  const terme = recherche.trim().toLowerCase();
  const cuisinesVues = terme
    ? cuisines.filter((c) => c.label.toLowerCase().includes(terme))
    : cuisines;

  /** Libellé du bouton de validation : il annonce l'effet, pas l'action. */
  const libelleValidation = chargement
    ? "Calcul…"
    : nbResultats === null
      ? "Voir les résultats"
      : `Voir ${nbResultats} restaurant${nbResultats > 1 ? "s" : ""}`;

  return (
    <div className="fbar" role="group" aria-label="Filtres de recherche">
      <div className="fbar__ligne">

        <div className="fbar__enveloppe" ref={refTous}>
          <button
            type="button"
            className="fbar__tous"
            aria-expanded={tousOuvert}
            onClick={() => setTousOuvert((o) => !o)}
          >
            <SlidersHorizontal size={15} weight="bold" />
            Tous les filtres
            {actifs > 0 && <span className="fbar__compteur">{actifs}</span>}
          </button>

          {tousOuvert && (
            <div className="fbar__panneau">
              <div className="fbar__groupe">
                <h4><Money size={14} weight="light" /> Budget</h4>
                <div className="fbar__pastilles">
                  {TRANCHES.map((t) => (
                    <button
                      key={t.cle}
                      type="button"
                      className="chip"
                      aria-pressed={tranchePrix === t.cle}
                      onClick={() =>
                        modifier("tranchePrix", tranchePrix === t.cle ? null : t.cle)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fbar__groupe">
                <h4><Clock size={14} weight="light" /> Disponibilité</h4>
                <Case coche={ouvert} onChange={(v) => modifier("ouvert", v)}>
                  Ouvert maintenant
                </Case>
                <Case coche={reservation} onChange={(v) => modifier("reservation", v)}>
                  Réservation possible
                </Case>
              </div>

              <div className="fbar__groupe">
                <h4><Notebook size={14} weight="light" /> Information</h4>
                <Case coche={avecCarte} onChange={(v) => modifier("avecCarte", v)}>
                  Carte analysée
                </Case>
                <p className="fbar__aide">
                  Restaurants dont la carte a été lue. C'est le seul filtre où
                  l'absence d'information écarte — parce qu'il porte justement
                  sur cette présence.
                </p>
              </div>

              <p className="fbar__note">
                Pas de filtre sur la note ni le nombre d'avis : ce serait refaire
                le tri par popularité que ce produit existe pour éviter.
              </p>

              <div className="fbar__pied">
                <button
                  type="button"
                  className="fbar__effacer"
                  onClick={() => onChange(FILTRES_VIDES)}
                  disabled={actifs === 0}
                >
                  Tout effacer
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setTousOuvert(false)}
                >
                  {libelleValidation}
                </button>
              </div>
            </div>
          )}
        </div>

        <Menu
          icone={<Money size={15} weight="light" />}
          label={trancheLabel || "Budget"}
          actif={Boolean(tranchePrix)}
        >
          {(fermer) => (
            <div className="fbar__liste">
              {TRANCHES.map((t) => (
                <button
                  key={t.cle}
                  type="button"
                  className="fbar__option"
                  aria-pressed={tranchePrix === t.cle}
                  onClick={() => {
                    modifier("tranchePrix", tranchePrix === t.cle ? null : t.cle);
                    fermer();
                  }}
                >
                  {t.label}
                </button>
              ))}
              {tranchePrix && (
                <button
                  type="button"
                  className="fbar__option fbar__option--effacer"
                  onClick={() => { modifier("tranchePrix", null); fermer(); }}
                >
                  Tous les budgets
                </button>
              )}
            </div>
          )}
        </Menu>

        <Menu
          icone={<ForkKnife size={15} weight="light" />}
          label={cuisineLabel || "Type de cuisine"}
          actif={Boolean(cuisine)}
          largeur={300}
        >
          {(fermer) => (
            <>
              <div className="fbar__recherche">
                <MagnifyingGlass size={14} weight="bold" />
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Chercher une cuisine"
                  aria-label="Chercher une cuisine"
                  autoFocus
                />
              </div>
              <div className="fbar__liste fbar__liste--haute">
                <button
                  type="button"
                  className="fbar__option"
                  aria-pressed={!cuisine}
                  onClick={() => { modifier("cuisine", null); fermer(); }}
                >
                  Toutes les cuisines
                </button>
                {cuisinesVues.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="fbar__option"
                    aria-pressed={cuisine === c.value}
                    onClick={() => {
                      modifier("cuisine", cuisine === c.value ? null : c.value);
                      fermer();
                    }}
                  >
                    {c.label}
                  </button>
                ))}
                {cuisinesVues.length === 0 && (
                  <p className="fbar__vide">Aucune cuisine ne correspond.</p>
                )}
              </div>
            </>
          )}
        </Menu>

        <button
          type="button"
          className="fbar__pastille"
          aria-pressed={ouvert}
          data-actif={ouvert ? "true" : undefined}
          onClick={() => modifier("ouvert", !ouvert)}
        >
          <Clock size={15} weight="light" />
          Ouvert maintenant
        </button>

        <button
          type="button"
          className="fbar__pastille"
          aria-pressed={reservation}
          data-actif={reservation ? "true" : undefined}
          onClick={() => modifier("reservation", !reservation)}
        >
          Réservation
        </button>

        <button
          type="button"
          className="fbar__pastille"
          aria-pressed={avecCarte}
          data-actif={avecCarte ? "true" : undefined}
          onClick={() => modifier("avecCarte", !avecCarte)}
          title="Restaurants dont la carte a été lue et analysée"
        >
          <Notebook size={15} weight="light" />
          Carte analysée
        </button>

        {actifs > 0 && (
          <button
            type="button"
            className="fbar__reset"
            onClick={() => onChange(FILTRES_VIDES)}
          >
            <X size={13} weight="bold" />
            Effacer
          </button>
        )}
      </div>
    </div>
  );
}
