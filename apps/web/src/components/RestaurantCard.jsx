// apps/web/src/components/RestaurantCard.jsx
//
// Carte de résultat, photo dominante.
//
// Règle d'affichage (D-009) : aucun score chiffré. L'utilisateur voit un
// verdict lisible et la première raison en langage naturel ; le détail du
// calcul reste sur la fiche, derrière « pourquoi ? ».

import { ForkKnife } from "@phosphor-icons/react";

import CuisineVisual from "./CuisineVisual";

import { useReveal } from "../lib/hooks";
import { distance, verdict } from "../lib/display";

export default function RestaurantCard({ restaurant, onOpen, index = 0 }) {
  // Décalage progressif à l'entrée dans le viewport, plafonné pour que le
  // dernier élément d'une longue liste n'attende pas une seconde.
  const ref = useReveal(Math.min(index * 45, 320));

  const v = verdict(restaurant.local_signal, restaurant.confidence);
  const dist = distance(restaurant.distance_m);
  const reason = restaurant.reasons?.[0];

  return (
    <article className="card reveal" ref={ref}>
      <div className="card__media">
        <CuisineVisual id={restaurant.id} cuisine={restaurant.cuisine} size={58} />
        {dist && <span className="card__distance">{dist}</span>}
      </div>

      <div className="card__body">
        <h3 className="card__name">{restaurant.name}</h3>

        <p className="card__meta">
          <ForkKnife size={15} weight="light" />
          {restaurant.cuisine_label || "Restaurant"}
          {restaurant.price != null && <span>· {restaurant.price} EUR</span>}
        </p>

        {reason && <p className="card__reason">{reason}</p>}
      </div>

      <div className="card__foot">
        <span className={`verdict verdict--${v.tone}`}>{v.label}</span>
        <button
          className="btn btn--ghost"
          style={{ padding: "9px 15px" }}
          onClick={() => onOpen(restaurant)}
        >
          Voir la fiche
        </button>
      </div>
    </article>
  );
}
