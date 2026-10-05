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
// le dernier point. Le verdict porte désormais aussi le score chiffré sur 10
// (D-050, supersède D-009 : « aucun score visible par défaut ») — c'est
// l'actif du projet, décision produit de le mettre en valeur plutôt que de
// le cacher derrière un mot seul. Voir components/Verdict.jsx.
//
// LES ÉTOILES ONT ÉTÉ RETIRÉES DU CLASSEMENT. Elles affichaient `score / 20`,
// ce qui reprenait le symbole de la note de popularité que le projet récuse
// (D-007) et, sur données réelles, plaçait presque tout le monde à trois
// étoiles. Le chiffre qui revient avec D-050 est le Local Signal, pas la
// note — la distinction reste entière. Voir `BarreSignal` pour le
// raisonnement complet.

import { ForkKnife, Heart, MapPin } from "@phosphor-icons/react";

import BarreSignal from "./BarreSignal";
import PhotoRestaurant from "./PhotoRestaurant";
import Verdict from "./Verdict";

import { useFavori, useReveal } from "../lib/hooks";
import { distance, verdict } from "../lib/display";

// Décalage entre deux cartes. Assez pour qu'on perçoive une succession, assez
// peu pour que la liste ne se fasse pas attendre.
const PAS_MS = 60;
const DECALAGE_MAX_MS = 400;

export default function RestaurantCard({
  restaurant, onOpen, index = 0, user, onUnlock, onFavoriChange, plusProche = false,
  selectionne = false, onSurvol,
}) {
  const delai = Math.min(index * PAS_MS, DECALAGE_MAX_MS);
  const ref = useReveal(delai);

  // Le cœur n'apparaît que pour un compte voyageur connecté — tous les
  // comptes voyageur depuis D-067 (plus de Pass). Les comptes pro n'ont pas
  // de favoris (D-055 v2).
  const voyageur = Boolean(user) && !["restaurateur", "hotel"].includes(user.role);
  const { favori, toggle: toggleFavori } = useFavori(
    restaurant.id, restaurant.favori, voyageur, onUnlock,
    onFavoriChange && ((v) => onFavoriChange(restaurant.id, v)),
  );

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
    <article
      className={`card${premier ? " card--premier" : ""}${selectionne ? " card--selection" : ""} reveal`}
      ref={ref}
      data-restaurant-id={restaurant.id}
      // Survol → le repère correspondant grossit sur la carte (D-066).
      onMouseEnter={onSurvol && (() => onSurvol(restaurant.id))}
      onMouseLeave={onSurvol && (() => onSurvol(null))}
    >
      <div className="card__media">
        {/* Le rang porte le classement : on est en liste unique, verticale,
            « le premier, puis juste en dessous le deuxième » — le chiffre le
            dit explicitement plutôt que de le laisser déduire de l'ordre. */}
        <span className="card__rang" aria-hidden="true">{index + 1}</span>
        <PhotoRestaurant
          id={restaurant.id}
          cuisine={restaurant.cuisine}
          photoUrl={restaurant.photo_url}
          photoKey={restaurant.photo_key}
          credit={restaurant.photo_credit}
          photoGoogle={restaurant.photo_google}
          nom={restaurant.name}
          size={64}
        />
        {premier && <span className="card__premier">Meilleur profil local</span>}
        {/* N'existe que sur les réponses admin (D-057) — absent partout
            ailleurs (Découvrir, favoris), donc invisible par défaut. */}
        {restaurant.restaurateur_statut === "valide" && (
          <span className="card__restaurateur card__restaurateur--valide">Restaurateur validé</span>
        )}
        {restaurant.restaurateur_statut === "en_attente" && (
          <span className="card__restaurateur card__restaurateur--en_attente">Demande en attente</span>
        )}

        {/* Restaurant abonné à une offre Visibilité (D-067). Étiquette
            d'affichage seulement : posée APRÈS le classement, elle ne change
            ni le score ni le rang (règle de neutralité). */}
        {restaurant.partenaire && (
          <span className="card__partenaire" title="Restaurant abonné à une offre Local Signal. Son score et son rang n'en dépendent pas.">
            Partenaire
          </span>
        )}

        {voyageur && (
          <button
            type="button"
            className={`card__favori${favori ? " is-favori" : ""}`}
            onClick={(e) => { e.stopPropagation(); toggleFavori(); }}
            aria-pressed={favori}
            aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
            title={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Heart size={16} weight={favori ? "fill" : "regular"} />
          </button>
        )}
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
        {/* Distance juste sous le score (D-065) : le classement mêle score
            et proximité, la distance lue avec le score explique qu'un 7,9
            passe devant un 8,4 — sans pousser la barre. */}
        <div className="card__score">
          <Verdict
            localSignal={restaurant.local_signal}
            confidence={restaurant.confidence}
            className="card__verdict"
          />
          {dist && (
            <span className={`card__dist${plusProche ? " card__dist--proche" : ""}`}>
              <MapPin size={12} weight="fill" aria-hidden="true" />
              {plusProche ? `Le plus proche · ${dist}` : dist}
            </span>
          )}
        </div>
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
