// apps/web/src/components/RestaurantCard.jsx
//
// Carte de résultat (LS-12).
//
// CE QUE CETTE CARTE DOIT RÉPONDRE. Le retour de l'encadrant était : « des
// restaurants s'affichent, mais on ne comprend pas par rapport à quoi ».
// L'information manquante existait déjà dans l'API — le verdict et la raison
// en français sont produits par le moteur depuis le début. Elle était
// simplement invisible typographiquement, reléguée en gris sous le nom.
//
// L'ORDRE DE LECTURE EST DÉLIBÉRÉ :
//
//   1. la barre et le verdict — « à quel point est-il local ? »
//   2. le nom, la distance
//   3. la cuisine et le prix
//   4. la raison, en français — « pourquoi celui-là ? »
//
// Les deux questions du jury trouvent leur réponse dans les deux premiers et
// le dernier point, sans qu'un chiffre apparaisse.
//
// LES ÉTOILES ONT ÉTÉ RETIRÉES. Elles affichaient `score / 20`, ce qui
// reprenait le symbole de la note de popularité que le projet récuse (D-007)
// et, sur données réelles, plaçait presque tout le monde à trois étoiles. Voir
// `BarreSignal` pour le raisonnement complet.

import { ForkKnife } from "@phosphor-icons/react";

import BarreSignal from "./BarreSignal";
import PhotoRestaurant from "./PhotoRestaurant";

import { useReveal } from "../lib/hooks";
import { distance, verdict } from "../lib/display";

// Décalage entre deux cartes. Assez pour qu'on perçoive une succession, assez
// peu pour que la liste ne se fasse pas attendre.
const PAS_MS = 60;
const DECALAGE_MAX_MS = 400;

export default function RestaurantCard({ restaurant, onOpen, index = 0 }) {
  const delai = Math.min(index * PAS_MS, DECALAGE_MAX_MS);
  const ref = useReveal(delai);

  const v = verdict(restaurant.local_signal, restaurant.confidence);
  const dist = distance(restaurant.distance_m);
  const reason = restaurant.scoring?.reasons?.[0];

  // La barre porte le LOCAL SIGNAL, pas le score final : c'est ce qu'est le
  // restaurant, indépendamment de la position de celui qui cherche (D-008).
  // Afficher le score final ferait varier la barre d'un même restaurant selon
  // l'endroit d'où on le regarde — incompréhensible, et contraire au propos.
  const signal = restaurant.local_signal;

  // Le premier résultat est distingué. Pas les trois premiers : trois cartes
  // mises en avant sur cinq ne distinguent plus rien.
  const premier = index === 0;

  return (
    <article className={`card${premier ? " card--premier" : ""} reveal`} ref={ref}>
      <div className="card__media">
        <PhotoRestaurant
          id={restaurant.id}
          cuisine={restaurant.cuisine}
          photoUrl={restaurant.photo_url}
          nom={restaurant.name}
          size={64}
        />
        {dist && <span className="card__distance">{dist}</span>}
        {premier && <span className="card__premier">Meilleur profil local</span>}
      </div>

      <div className="card__signal">
        <BarreSignal
          valeur={signal}
          ton={v.tone}
          // Le remplissage part après l'entrée de la carte : sinon la barre se
          // remplit derrière une carte encore transparente, et le geste est
          // perdu.
          delai={delai + 180}
          label={`${v.label} — ${restaurant.name}`}
        />
        <span className={`verdict verdict--${v.tone} card__verdict`}>
          {v.label}
        </span>
      </div>

      <div className="card__body">
        <h3 className="card__name">{restaurant.name}</h3>

        <p className="card__meta">
          <ForkKnife size={15} weight="light" />
          {restaurant.cuisine_label || "Restaurant"}
          {restaurant.price != null && <span>· {restaurant.price} €</span>}
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
