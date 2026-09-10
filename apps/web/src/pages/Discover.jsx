// apps/web/src/pages/Discover.jsx
//
// Écran principal : recherche et résultats.
//
// La barre de recherche est le point d'entrée du produit, pas un ornement.
// Elle porte les trois décisions que prend un voyageur qui a faim : où, quel
// type de cuisine, jusqu'où marcher.

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, Trophy, X } from "@phosphor-icons/react";

import { fetchCuisines, fetchRestaurants } from "../api";
import Filtres from "../components/Filtres";
import StarRating from "../components/StarRating";
import LocationPicker from "../components/LocationPicker";
import RestaurantCard from "../components/RestaurantCard";
import LockedCard from "../components/LockedCard";
import {
  EmptyState,
  ErrorState,
  LocationNotice,
  ResultsSkeleton,
} from "../components/States";
import { FILTRES_VIDES, RAYON_DEFAUT, RAYONS } from "../lib/filtres";
import { useGeolocation } from "../lib/hooks";

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
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);
  const [versionResultats, setVersionResultats] = useState(0);
  const [classementOuvert, setClassementOuvert] = useState(false);
  const [podium, setPodium] = useState([]);
  const ouvrirClassement = useRef(false);

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
        const resultats = data.restaurants ?? [];
        setRestaurants(resultats);
        setTotal(data.count ?? resultats.length);
        // Relance l'animation du podium après chaque recherche ou filtre.
        setVersionResultats((version) => version + 1);
        if (ouvrirClassement.current) {
          ouvrirClassement.current = false;
          setPodium(resultats.slice(0, 3));
          setClassementOuvert(resultats.length > 0);
        }
        setError(null);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        ouvrirClassement.current = false;
        setError(e.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [origine, radius, filtres, reloads]);

  const relancer = () => {
    ouvrirClassement.current = true;
    setStatus("loading");
    setReloads((n) => n + 1);
  };

  const reset = () => {
    onFiltresChange({ ...FILTRES_VIDES });
    onRadiusChange(RAYON_DEFAUT);
  };

  // Restaurants masqués faute de compte — 0 pour un utilisateur connecté,
  // qui voit toujours l'intégralité des résultats.
  const masques = user ? 0 : Math.max(0, total - restaurants.length);

  return (
    <>
      <section className="search">
        <h1 className="search__title enter" style={{ "--enter-delay": "60ms" }}>
          Mangez là où mangent <em>les habitants</em>
        </h1>
        <p className="search__lede enter" style={{ "--enter-delay": "170ms" }}>
          Les vrais restaurants de quartier sont rarement les plus visibles.
          <br />
          Local Signal les fait remonter grâce à notre <b>score</b> calculé.
        </p>

        <div className="searchbar enter" style={{ "--enter-delay": "280ms" }}>
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

      <div
        className="discover__filters enter"
        style={{ "--enter-delay": "380ms" }}
      >
        <Filtres
          valeurs={filtres}
          onChange={onFiltresChange}
          cuisines={cuisineOptions}
          nbResultats={status === "ready" ? restaurants.length : null}
          chargement={status === "loading"}
        />
      </div>

      <section>
        <div className="results__head">
          <h2
            className="detail__title"
            style={{ fontSize: "var(--font-size-xl)" }}
          >
            {lieu ? `Autour de ${lieu.label}` : "Autour de vous"}
          </h2>
          <div className="results__summary">
            <span className="results__sort">Triés par score</span>
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
                onOpen={onOpen}
              />
            ))}
            {Array.from({ length: Math.min(masques, MAX_CARTES_VERROUILLEES) }).map((_, i) => (
              <LockedCard key={`locked-${i}`} onUnlock={onUnlock} />
            ))}
          </div>
        )}
      </section>

      {classementOuvert && (
        <div
          className="modal classement-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="classement-titre"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClassementOuvert(false);
          }}
        >
          <section className="classement-modal__contenu">
            <div className="classement-modal__entete">
              <div>
                <span className="classement-modal__sur-titre">
                  <Trophy size={16} weight="fill" /> Classement de votre
                  recherche
                </span>
                <h2 id="classement-titre">Les 3 meilleures adresses</h2>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={() => setClassementOuvert(false)}
                aria-label="Fermer le classement"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <ol className="classement-modal__liste">
              {podium.map((restaurant, index) => {
                const score =
                  restaurant.scoring?.score_final ?? restaurant.local_signal;
                const etoiles = Math.max(0, Math.min(5, (score ?? 0) / 20));
                return (
                  <li
                    className={`classement-modal__ligne classement-modal__ligne--${index + 1}`}
                    key={restaurant.id}
                  >
                    <span className="classement-modal__rang">{index + 1}</span>
                    <span className="classement-modal__nom">
                      {restaurant.name}
                    </span>
                    <strong className="classement-modal__score">
                      <StarRating value={etoiles} size={14} />
                    </strong>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => setClassementOuvert(false)}
            >
              Voir les résultats
            </button>
          </section>
        </div>
      )}
    </>
  );
}
