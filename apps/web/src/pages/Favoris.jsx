// apps/web/src/pages/Favoris.jsx
//
// Restaurants favoris (LS-refonte, menu déroulant de Nav.jsx). Réservé aux
// détenteurs d'un Pass Voyageur (D-063) — l'API applique la même règle (`_require_abonne`,
// backend/main.py), cette page ne fait que la refléter : un compte connecté
// mais sans Pass voit une proposition de Pass, pas une erreur 403 brute
// (retour utilisateur : "s'abonner pour ajouter des favoris").

import { useEffect, useState } from "react";
import { Heart } from "@phosphor-icons/react";

import { fetchFavoris } from "../api";
import RestaurantCard from "../components/RestaurantCard";
import { ErrorState, ResultsSkeleton } from "../components/States";

export default function Favoris({ user, onOpen, onUnlock }) {
  const abonne = user?.role === "subscriber" || user?.role === "admin";
  const [status, setStatus] = useState(abonne ? "loading" : "idle");
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!abonne) return undefined;
    let cancelled = false;
    // Passer par "loading" avant de lancer la requete : sinon `reloads` en
    // dependance ne redeclencherait aucun rendu visible tant que la reponse
    // n'est pas arrivee, et un rechargement manuel semblerait ne rien faire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    fetchFavoris()
      .then((data) => {
        if (cancelled) return;
        setRestaurants(data.restaurants ?? []);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [abonne, reloads]);

  if (!abonne) {
    return (
      <div className="authpage">
        <div className="authcard enter" style={{ "--enter-delay": "0ms" }}>
          <div className="authcard__mark" aria-hidden="true">
            <Heart size={20} weight="fill" />
          </div>
          <h1 className="authcard__title">Restaurants favoris</h1>
          <p className="authcard__lede">
            Réservé au Pass Voyageur : enregistrez vos restaurants préférés
            depuis leur fiche et retrouvez-les ici d'un coup d'œil.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 24 }}
            onClick={onUnlock}
          >
            Prendre un Pass pour ajouter des favoris
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="detail__title" style={{ marginBottom: 20 }}>
        Vos restaurants favoris
      </h1>

      {status === "loading" && <ResultsSkeleton />}
      {status === "error" && (
        <ErrorState message={error} onRetry={() => setReloads((n) => n + 1)} />
      )}
      {status === "ready" && restaurants.length === 0 && (
        <p className="card__reason">
          Aucun favori pour l'instant. Le cœur sur une fiche restaurant
          l'ajoute ici.
        </p>
      )}
      {status === "ready" && restaurants.length > 0 && (
        <div className="grid">
          {restaurants.map((r, i) => (
            <RestaurantCard
              key={r.id}
              restaurant={r}
              index={i}
              onOpen={onOpen}
              user={user}
              onUnlock={onUnlock}
              // Retirer le cœur ici doit retirer la carte : c'est la seule
              // page où le favori EST le contenu, pas une option dessus.
              onFavoriChange={(id, estFavori) => {
                if (!estFavori) setRestaurants((rs) => rs.filter((x) => x.id !== id));
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
