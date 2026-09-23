// apps/web/src/pages/Pricing.jsx
//
// Page d'abonnement (LS-refonte). Deux formules, comme demandé : gratuite et
// abonnée — pas une troisième, la démonstration porte sur DEUX comportements
// (`masques > 0` ou non dans Discover.jsx), un troisième niveau n'aurait
// rien à distinguer visuellement de plus.
//
// LES PRIX SONT DES PLACEHOLDERS. Personne n'a encore décidé le vrai tarif
// (retour utilisateur : "un euro l'autre je sais pas") — ils sont écrits en
// dur ici, PAS dans `packages/shared` ni `config.py`, précisément pour qu'on
// ne les confonde pas avec une valeur qui aurait déjà été arbitrée.
//
// LE BOUTON EST BLOQUÉ, VOLONTAIREMENT (retour utilisateur explicite après
// avoir vu la bascule automatique : "bloque juste le bouton, ça marche pas").
// `onAbonner` (App.jsx) reste câblé mais n'est plus appelé depuis ce
// bouton — il resservira le jour où un vrai processeur de paiement (Stripe
// ou équivalent) existera. D'ici là, aucun clic ne doit changer le rôle
// d'un compte : les comptes de démonstration (voir conversation) sont créés
// à la main, pas via cette page.

import { Check, CreditCard, X } from "@phosphor-icons/react";

const AVANTAGES_GRATUIT = [
  "5 premiers restaurants de chaque recherche",
  "Score Local Signal et explication complète",
  "Carte, filtres, tout le reste de l'application",
];

const LIMITES_GRATUIT = [
  "Le reste des résultats reste verrouillé",
  "Publicités affichées (à venir)",
];

const AVANTAGES_ABONNE = [
  "Tous les restaurants de chaque recherche, sans limite",
  "Recherches illimitées",
  "Aucune publicité",
  "Restaurants favoris",
  // Filtre premium (D-050) : visible pour tout le monde dans la barre de
  // filtres, mais son activation est réservée à l'abonnement — d'où sa
  // description ici plutôt qu'une simple case de plus dans AVANTAGES_GRATUIT.
  "Filtre à fourchette sur le score Local Signal",
];

// `onAbonner` n'est plus utilisé ici (bouton bloqué), mais App.jsx continue
// de le fournir : le rebrancher le jour d'un vrai paiement sera une ligne,
// pas une nouvelle prop à faire remonter depuis la racine.
export default function Pricing({ user, onBack }) {
  const dejaAbonne = user?.role === "subscriber" || user?.role === "admin";

  return (
    <>
      <h1 className="detail__title">S'abonner</h1>
      <p className="detail__meta" style={{ marginBottom: 28, maxWidth: 60 + "ch" }}>
        Local Signal reste gratuit pour découvrir les premiers restaurants de
        chaque recherche. L'abonnement lève la limite.
      </p>

      <div className="pricing__grid">
        <div className="pricing__carte">
          <h2 className="pricing__nom">Gratuit</h2>
          <p className="pricing__prix">
            0&nbsp;€<span className="pricing__periode">/mois</span>
          </p>

          <ul className="pricing__liste">
            {AVANTAGES_GRATUIT.map((a) => (
              <li key={a}>
                <Check size={16} weight="bold" className="pricing__coche" />
                {a}
              </li>
            ))}
            {LIMITES_GRATUIT.map((a) => (
              <li key={a} className="pricing__limite">
                <X size={16} weight="bold" className="pricing__croix" />
                {a}
              </li>
            ))}
          </ul>

          <button className="btn btn--ghost btn--block" disabled>
            {user ? "Formule actuelle" : "Formule de base"}
          </button>
        </div>

        <div className="pricing__carte pricing__carte--vedette">
          <span className="pricing__badge">Recommandé</span>
          <h2 className="pricing__nom">Abonné</h2>
          <p className="pricing__prix">
            3&nbsp;€<span className="pricing__periode">/mois</span>
          </p>

          <ul className="pricing__liste">
            {AVANTAGES_ABONNE.map((a) => (
              <li key={a}>
                <Check size={16} weight="bold" className="pricing__coche" />
                {a}
              </li>
            ))}
          </ul>

          <button className="btn btn--primary btn--block" disabled>
            <CreditCard size={17} weight="bold" />
            {dejaAbonne ? "Déjà abonné" : "Paiement bientôt disponible"}
          </button>
        </div>
      </div>

      <button className="linkbtn" onClick={onBack} style={{ marginTop: 24 }}>
        Retour
      </button>
    </>
  );
}
