// apps/web/src/pages/Discover.jsx
//
// Écran principal : recherche et résultats.
//
// La barre de recherche est le point d'entrée du produit, pas un ornement.
// Elle porte les trois décisions que prend un voyageur qui a faim : où, quel
// type de cuisine, jusqu'où marcher.

import { useEffect, useState } from "react";
import { Info, MagnifyingGlass, MapTrifold } from "@phosphor-icons/react";

import { fetchCuisines, fetchRestaurants } from "../api";
import Filtres from "../components/Filtres";
import LocationPicker from "../components/LocationPicker";
import RestaurantCard from "../components/RestaurantCard";
import LockedCard from "../components/LockedCard";
import ResultsMap from "../components/ResultsMap";
import StatsPanel from "../components/StatsPanel";
import {
  EmptyState,
  ErrorState,
  LocationNotice,
  ResultsSkeleton,
} from "../components/States";
import { FILTRES_VIDES, RAYON_DEFAUT, RAYONS } from "../lib/filtres";
import { useGeolocation } from "../lib/hooks";
import { distance } from "../lib/display";

// Cartes verrouillées affichées au-delà de la limite — plafond purement
// visuel pour ne pas allonger indéfiniment la grille quand `total` est grand.
const MAX_CARTES_VERROUILLEES = 6;

export default function Discover({
  onOpen,
  filtres,
  onFiltresChange,
  radius,
  onRadiusChange,
  lieu,
  onLieuChange,
  user,
  onUnlock,
}) {
  const { position, denied, relocate } = useGeolocation();

  // Lieu choisi explicitement. Tant qu'il est nul, on suit la géolocalisation ;
  // dès qu'il existe, il prime — l'utilisateur qui a nommé un endroit ne veut
  // pas que sa position le contredise.
  const origine = lieu ?? position;

  const [cuisineOptions, setCuisineOptions] = useState([]);

  // Tous les filtres dans un seul objet : ils partent ensemble a l'API, et un
  // seul effet suffit a les surveiller.
  const cuisine = filtres.cuisine;

  const [restaurants, setRestaurants] = useState([]);
  // Total après filtrage côté serveur, AVANT troncature — permet de savoir
  // combien de restaurants sont masqués sans jamais recevoir leurs données
  // (voir backend/main.py::list_restaurants).
  const [total, setTotal] = useState(0);
  // Quota de recherches d'un compte sans Pass (LS-refonte) — `null` pour
  // tout le monde d'autre (anonyme, Pass actif, admin), qui n'en a pas.
  const [quota, setQuota] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);
  const [versionResultats, setVersionResultats] = useState(0);
  // Carte et répartition : toujours visibles en colonne à partir de 1100px,
  // repliées derrière un bouton en dessous (voir .discover__railBody en CSS).
  const [railOuvert, setRailOuvert] = useState(false);
  // Synchronisation liste ↔ carte (D-066) : restaurant survolé dans la liste,
  // restaurant choisi sur la carte (ou dans la liste).
  const [survol, setSurvol] = useState(null);
  const [selection, setSelection] = useState(null);

  // Un repère cliqué fait défiler la liste jusqu'à son restaurant.
  function selectionnerDepuisCarte(id) {
    setSelection(id);
    document
      .querySelector(`[data-restaurant-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  // Explique pourquoi le premier résultat n'a pas forcément le meilleur
  // Local Signal (retour utilisateur) — le classement mêle authenticité et
  // proximité (D-008), « Triés par score » seul le laissait croire.
  const [expliqueClassement, setExpliqueClassement] = useState(false);

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
      scoreMin: filtres.scoreMin,
      scoreMax: filtres.scoreMax,
      limit: 24,
    })
      .then((data) => {
        if (cancelled) return;
        const resultats = data.restaurants ?? [];
        setRestaurants(resultats);
        setTotal(data.count ?? resultats.length);
        setQuota(data.quota ?? null);
        // Relance l'animation d'entrée des trois premières cartes après
        // chaque recherche ou filtre (voir la `key` plus bas).
        setVersionResultats((version) => version + 1);
        setError(null);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [origine, radius, filtres, reloads]);

  const relancer = () => {
    setStatus("loading");
    setReloads((n) => n + 1);
  };

  const reset = () => {
    onFiltresChange({ ...FILTRES_VIDES });
    onRadiusChange(RAYON_DEFAUT);
  };

  // Restaurants masqués faute de Pass Voyageur (D-063) — 0 seulement pour un
  // compte avec Pass ou admin. Se connecter ne suffit plus à tout débloquer :
  // c'était l'ancienne règle, et elle ne laissait aucune raison de payer.
  const abonne = user?.role === "subscriber" || user?.role === "admin";
  const masques = abonne ? 0 : Math.max(0, total - restaurants.length);
  // Distance minimale des résultats affichés : le ou les restaurants qui
  // l'atteignent portent « Le plus proche » (D-065). Comparaison sur la
  // distance AFFICHÉE : deux « 270 m » doivent porter la mention tous deux.
  const distances = restaurants.map((r) => r.distance_m).filter((d) => d != null);
  const distMin = distances.length ? Math.min(...distances) : null;

  return (
    <>
      <section className="search">
        {/* Retirée puis redemandée, en plus petit cette fois (retour
            utilisateur) : l'amorce reste, mais sans manger la hauteur qui
            revient aux résultats — voir `.search__title--compact` en CSS. */}
        <h1 className="search__title search__title--compact enter" style={{ "--enter-delay": "60ms" }}>
          Mangez là où mangent <em>les habitants</em>
        </h1>

        <div className="searchbar enter" style={{ "--enter-delay": "170ms" }}>
          <div className="field">
            <LocationPicker
              value={
                lieu ??
                (position && {
                  ...position,
                  label: denied ? "Quartier latin, Paris" : "Autour de moi",
                })
              }
              onChange={onLieuChange}
              onUseGps={() => {
                onLieuChange(null);
                relocate();
              }}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cuisine">
              Cuisine
            </label>
            <select
              id="cuisine"
              className="field__control"
              value={cuisine ?? ""}
              onChange={(e) =>
                onFiltresChange((f) => ({
                  ...f,
                  cuisine: e.target.value || null,
                }))
              }
            >
              <option value="">Toutes</option>
              {cuisineOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="rayon">
              Distance
            </label>
            <select
              id="rayon"
              className="field__control"
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
            >
              {RAYONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
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
        {denied && !lieu && (
          <div style={{ marginTop: 12 }}>
            <LocationNotice />
          </div>
        )}
      </section>

      <div className="discover__layout">
        <aside
          className="discover__aside enter"
          style={{ "--enter-delay": "380ms" }}
        >
          <Filtres
            valeurs={filtres}
            onChange={onFiltresChange}
            cuisines={cuisineOptions}
            nbResultats={status === "ready" ? restaurants.length : null}
            chargement={status === "loading"}
            abonne={abonne}
            onUnlock={onUnlock}
          />
        </aside>

        <section className="discover__results">
          <div className="results__head">
            <h2
              className="detail__title"
              style={{ fontSize: "var(--font-size-xl)" }}
            >
              {lieu ? `Autour de ${lieu.label}` : "Autour de vous"}
            </h2>
            <div className="results__summary">
              <button
                type="button"
                className="results__sort"
                onClick={() => setExpliqueClassement((v) => !v)}
                aria-expanded={expliqueClassement}
              >
                Classement : authenticité et proximité
                <Info size={13} weight="bold" />
              </button>
              {status === "ready" && masques > 0 && (
                <span className="results__count">
                  {restaurants.length} restaurant{restaurants.length > 1 ? "s" : ""} affiché
                  {restaurants.length > 1 ? "s" : ""} sur {total}
                </span>
              )}
              {status === "ready" && masques === 0 && (
                <span className="results__count">
                  {restaurants.length} restaurant
                  {restaurants.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {expliqueClassement && (
            <p className="card__reason" style={{ marginTop: -10, marginBottom: 16 }}>
              Le classement combine le Local Signal du restaurant
              (authenticité) et sa distance jusqu'à vous : un restaurant très
              proche peut donc apparaître avant un restaurant mieux noté mais
              plus loin. Le score de chaque restaurant reste visible sur sa
              carte, indépendant de ce classement (D-008).
            </p>
          )}

          {/* Quota de recherches d'un compte sans Pass (LS-refonte) —
              affiché AVANT d'être atteint, pas seulement au moment où il
              bloque (retour utilisateur : "doit être claire, affichée"). */}
          {quota && (
            <p className="card__reason" style={{ marginBottom: 16 }}>
              {quota.restantes > 0
                ? `${quota.restantes} recherche${quota.restantes > 1 ? "s" : ""} restante${quota.restantes > 1 ? "s" : ""} aujourd'hui.`
                : "Dernière recherche du jour."}{" "}
              <button type="button" className="linkbtn" onClick={onUnlock}>
                Prendre un Pass Voyageur pour un accès illimité
              </button>
            </p>
          )}

          {status === "loading" && <ResultsSkeleton />}
          {status === "error" && (
            <ErrorState message={error} onRetry={relancer} />
          )}
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
                  key={i < 3 ? `${r.id}-${versionResultats}` : r.id}
                  restaurant={r}
                  index={i}
                  plusProche={distMin != null && distance(r.distance_m) === distance(distMin)}
                  selectionne={selection === r.id}
                  onSurvol={setSurvol}
                  onOpen={onOpen}
                  user={user}
                  onUnlock={onUnlock}
                />
              ))}
              {Array.from({ length: Math.min(masques, MAX_CARTES_VERROUILLEES) }).map((_, i) => (
                <LockedCard key={`locked-${i}`} onUnlock={onUnlock} connecte={Boolean(user)} />
              ))}
            </div>
          )}
          {/* Répartition des verdicts, sous la liste depuis que la carte
              occupe toute la colonne de droite (D-066). */}
          {status === "ready" && restaurants.length > 0 && (
            <StatsPanel restaurants={restaurants} />
          )}
        </section>

        {/* Grande carte interactive (D-066), collée à droite pendant qu'on
            fait défiler la liste. Repliée sous 1100px pour ne pas passer
            avant les résultats qu'elle commente. */}
        <aside className="discover__rail">
          <button
            type="button"
            className="discover__railToggle btn btn--ghost"
            onClick={() => setRailOuvert((o) => !o)}
            aria-expanded={railOuvert}
          >
            <MapTrifold size={16} weight="bold" />
            {railOuvert ? "Masquer la carte" : "Voir la carte"}
          </button>

          <div className={`discover__railBody${railOuvert ? " is-open" : ""}`}>
            {origine && (
              <ResultsMap
                restaurants={restaurants}
                origine={origine}
                survol={survol}
                selection={selection}
                onSelect={selectionnerDepuisCarte}
                onOpen={onOpen}
              />
            )}
          </div>
        </aside>
      </div>

    </>
  );
}
