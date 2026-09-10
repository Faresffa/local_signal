// apps/web/src/components/RestaurantCard.jsx
//
// Carte de résultat, photo dominante.
//
// Le verdict donne une lecture rapide ; le score chiffré rend aussi explicite
// l'ordre des résultats. Le détail de son calcul reste sur la fiche.

import { ForkKnife } from "@phosphor-icons/react";

import PhotoRestaurant from "./PhotoRestaurant";

import { useReveal } from "../lib/hooks";
import { distance, verdict } from "../lib/display";

export default function RestaurantCard({ restaurant, onOpen, index = 0 }) {
  // Décalage progressif à l'entrée dans le viewport, plafonné pour que le
  // dernier élément d'une longue liste n'attende pas une seconde.
  const ref = useReveal(Math.min(index * 45, 320));

  const v = verdict(restaurant.local_signal, restaurant.confidence);
  const dist = distance(restaurant.distance_m);
  // C'est le score final (Local Signal + proximité) qui détermine l'ordre
  // renvoyé par l'API. Le repli conserve l'affichage pour les anciennes données.
  const score = restaurant.scoring?.score_final ?? restaurant.local_signal;
  // Les explications vivent dans le bloc `scoring`, forme unique produite par
  // `rank_restaurants` et servie telle quelle par l'API.
  const reason = restaurant.scoring?.reasons?.[0];
  const rang = index < 3 ? index + 1 : 0;

  return (
    <article className={`card card--rang-${rang} reveal`} ref={ref}>
      <div className="card__media">
        <PhotoRestaurant
          id={restaurant.id}
          cuisine={restaurant.cuisine}
          photoUrl={restaurant.photo_url}
          nom={restaurant.name}
          size={64}
        />
        <span className={`verdict verdict--${v.tone} card__verdict`}>
          {v.label}
        </span>
        {dist && <span className="card__distance">{dist}</span>}
      </div>

      <div className="card__body">
        <div className="card__heading">
          <h3 className="card__name">{restaurant.name}</h3>
          {score != null && (
            <span className={`card__score card__score--rang-${rang}`}>
              Score {Math.round(score)}/100
            </span>
          )}
        </div>

        <p className="card__meta">
          <ForkKnife size={15} weight="light" />
          {restaurant.cuisine_label || "Restaurant"}
          {restaurant.price != null && <span>· {restaurant.price} EUR</span>}
        </p>

        {reason && <p className="card__reason">{reason}</p>}
      </div>

      <div className="card__foot">
        <button
          className="btn btn--ghost btn--block"
          onClick={() => onOpen(restaurant)}
        >
          Voir la fiche
        </button>
      </div>
    </article>
  );
}
