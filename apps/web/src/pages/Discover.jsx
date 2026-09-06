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
import Filtres from "../components/Filtres";
import LocationPicker from "../components/LocationPicker";
import RestaurantCard from "../components/RestaurantCard";
import {
  EmptyState,
  ErrorState,
  LocationNotice,
  ResultsSkeleton,
} from "../components/States";
import { FILTRES_VIDES, RAYON_DEFAUT, RAYONS } from "../lib/filtres";
import { useGeolocation } from "../lib/hooks";

export default function Discover({ onOpen }) {
  const { position, denied, relocate } = useGeolocation();

  // Lieu choisi explicitement. Tant qu'il est nul, on suit la géolocalisation ;
  // dès qu'il existe, il prime — l'utilisateur qui a nommé un endroit ne veut
  // pas que sa position le contredise.
  const [lieu, setLieu] = useState(null);
  const origine = lieu ?? position;

  const [radius, setRadius] = useState(RAYON_DEFAUT);
  const [cuisineOptions, setCuisineOptions] = useState([]);

  // Tous les filtres dans un seul objet : ils partent ensemble a l'API, et un
  // seul effet suffit a les surveiller.
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const cuisine = filtres.cuisine;

  const [restaurants, setRestaurants] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);

  // Les filtres proposés viennent de la base : on ne propose jamais un filtre
  // qui ne renverrait aucun résultat.
  //
  // La liste n'est PLUS tronquée. Elle l'était à 14 entrées du temps où les
  // cuisines s'affichaient en rangée de pastilles — au-delà, la rangée
  // devenait illisible. Le menu déroulant est recherchable (D-035) : tronquer
  // à 14 rendait le champ de recherche inutile et cachait 253 cuisines sur
  // 267, dont l'italienne. On les charge toutes.
  useEffect(() => {
    fetchCuisines()
      .then(setCuisineOptions)
      .catch(() => setCuisineOptions([]));
  }, []);

  // La requête vit dans l'effet plutôt que dans un callback appelé par lui :
  // poser l'état de façon synchrone depuis un effet déclenche une cascade de
  // rendus. Les relances manuelles passent par un compteur.
  useEffect(() => {
    if (!origine) return undefined;

    let cancelled = false;

    fetchRestaurants({
      lat: origine.lat,
      lng: origine.lng,
      radius,
      cuisines: filtres.cuisine ? [filtres.cuisine] : undefined,
      budgetMin: filtres.budgetMin,
      budgetMax: filtres.budgetMax,
      ouvert: filtres.ouvert,
      reservation: filtres.reservation,
      avecCarte: filtres.avecCarte,
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
  }, [origine, radius, filtres, reloads]);

  const relancer = () => { setStatus("loading"); setReloads((n) => n + 1); };

  const reset = () => { setFiltres(FILTRES_VIDES); setRadius(RAYON_DEFAUT); };

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
            <LocationPicker
              value={lieu ?? (position && {
                ...position,
                label: denied ? "Quartier latin, Paris" : "Autour de moi",
              })}
              onChange={setLieu}
              onUseGps={() => { setLieu(null); relocate(); }}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cuisine">Cuisine</label>
            <select
              id="cuisine"
              className="field__control"
              value={cuisine ?? ""}
              onChange={(e) =>
                setFiltres((f) => ({ ...f, cuisine: e.target.value || null }))
              }
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

        {/* Le repli n'a plus de sens dès qu'un lieu est choisi : il dirait
            que les résultats viennent d'ailleurs qu'ils ne viennent. */}
        {denied && !lieu && <div style={{ marginTop: 12 }}><LocationNotice /></div>}
      </section>

      <div className="enter" style={{ "--enter-delay": "380ms" }}>
        <Filtres
          valeurs={filtres}
          onChange={setFiltres}
          cuisines={cuisineOptions}
          nbResultats={status === "ready" ? restaurants.length : null}
          chargement={status === "loading"}
        />
      </div>

      <section>
        <div className="results__head">
          <h2 className="detail__title" style={{ fontSize: "var(--font-size-xl)" }}>
            {lieu ? `Autour de ${lieu.label}` : "Autour de vous"}
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
          // Un lieu choisi explicitement qui ne renvoie rien, sans filtre actif,
          // signale une zone non relevée plutôt que des critères trop stricts.
          <EmptyState
            onReset={reset}
            horsCouverture={Boolean(lieu) && !cuisine && radius >= 1500}
            lieu={lieu?.label}
          />
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
