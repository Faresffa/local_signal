// apps/web/src/pages/Discover.jsx
//
// Écran principal : recherche et résultats.
//
// La barre de recherche est le point d'entrée du produit, pas un ornement.
// Elle porte les trois décisions que prend un voyageur qui a faim : où, quel
// type de cuisine, jusqu'où marcher.

import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { fetchCuisines, fetchRestaurants } from "../api";
import RestaurantCard from "../components/RestaurantCard";
import {
  EmptyState,
  ErrorState,
  LocationNotice,
  ResultsSkeleton,
} from "../components/States";
import { useGeolocation } from "../lib/hooks";

const RAYONS = [
  { value: 400, label: "5 min à pied" },
  { value: 800, label: "10 min à pied" },
  { value: 1500, label: "20 min à pied" },
  { value: 3000, label: "Tout le quartier" },
];

export default function Discover({ onOpen }) {
  const { position, denied } = useGeolocation();

  const [radius, setRadius] = useState(800);
  const [cuisine, setCuisine] = useState(null);
  const [cuisineOptions, setCuisineOptions] = useState([]);

  const [restaurants, setRestaurants] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);

  // Les filtres proposés viennent de la base : on ne propose jamais un filtre
  // qui ne renverrait aucun résultat.
  useEffect(() => {
    fetchCuisines()
      .then((options) => setCuisineOptions(options.slice(0, 14)))
      .catch(() => setCuisineOptions([]));
  }, []);

  // La requête vit dans l'effet plutôt que dans un callback appelé par lui :
  // poser l'état de façon synchrone depuis un effet déclenche une cascade de
  // rendus. Les relances manuelles passent par un compteur.
  useEffect(() => {
    if (!position) return undefined;

    let cancelled = false;

    fetchRestaurants({
      lat: position.lat,
      lng: position.lng,
      radius,
      cuisines: cuisine ? [cuisine] : undefined,
      limit: 24,
    })
      .then((data) => {
        if (cancelled) return;
        setRestaurants(data.restaurants ?? []);
        setError(null);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus("error");
      });

    return () => { cancelled = true; };
  }, [position, radius, cuisine, reloads]);

  const relancer = () => { setStatus("loading"); setReloads((n) => n + 1); };

  const reset = () => { setCuisine(null); setRadius(1500); };

  return (
    <>
      <section className="search">
        <h1 className="search__title enter" style={{ "--enter-delay": "60ms" }}>
          Mangez là où mangent <em>les habitants</em>
        </h1>
        <p className="search__lede enter" style={{ "--enter-delay": "170ms" }}>
          Les vrais restaurants de quartier sont rarement les plus visibles.
          Local Signal les fait remonter.
        </p>

        <div className="searchbar enter" style={{ "--enter-delay": "280ms" }}>
          <div className="field">
            <label className="field__label" htmlFor="lieu">Où</label>
            <input
              id="lieu"
              className="field__control"
              value={denied ? "Quartier latin, Paris" : "Autour de moi"}
              readOnly
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cuisine">Cuisine</label>
            <select
              id="cuisine"
              className="field__control"
              value={cuisine ?? ""}
              onChange={(e) => setCuisine(e.target.value || null)}
            >
              <option value="">Toutes</option>
              {cuisineOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="rayon">Distance</label>
            <select
              id="rayon"
              className="field__control"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {RAYONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <button className="btn btn--primary btn--lg" onClick={relancer}>
            <MagnifyingGlass size={17} weight="bold" />
            Chercher
          </button>
        </div>

        {denied && <div style={{ marginTop: 12 }}><LocationNotice /></div>}
      </section>

      {/* Filtres rapides, en complément du sélecteur. */}
      {cuisineOptions.length > 0 && (
        <div
          className="chips enter"
          style={{ "--enter-delay": "380ms" }}
          role="group"
          aria-label="Filtres de cuisine"
        >
          <button
            className="chip"
            aria-pressed={cuisine === null}
            onClick={() => setCuisine(null)}
          >
            Toutes
          </button>
          {cuisineOptions.slice(0, 8).map((o) => (
            <button
              key={o.value}
              className="chip"
              aria-pressed={cuisine === o.value}
              onClick={() => setCuisine(cuisine === o.value ? null : o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <section>
        <div className="results__head">
          <h2 className="detail__title" style={{ fontSize: "var(--font-size-xl)" }}>
            Autour de vous
          </h2>
          {status === "ready" && (
            <span className="results__count">
              {restaurants.length} restaurant{restaurants.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {status === "loading" && <ResultsSkeleton />}
        {status === "error" && <ErrorState message={error} onRetry={relancer} />}
        {status === "ready" && restaurants.length === 0 && (
          <EmptyState onReset={reset} />
        )}
        {status === "ready" && restaurants.length > 0 && (
          <div className="grid">
            {restaurants.map((r, i) => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                index={i}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
