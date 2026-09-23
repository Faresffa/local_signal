// apps/web/src/pages/PricingRestaurateur.jsx
//
// Page d'abonnement RESTAURATEUR (D-056) — même gabarit que Pricing.jsx
// (grille à deux formules), mais un abonnement distinct : porté par
// `restaurant_claims.abonne`, pas par `users.role`. Un restaurateur non
// abonné garde l'accès à son tableau de bord (coordonnées, fréquentation
// résumée) ; l'abonnement débloque le détail des visiteurs et, plus tard,
// les notifications ciblées et les réponses aux avis.
//
// LE PRIX EST UN PLACEHOLDER, MÊME RÉSERVE QUE Pricing.jsx : personne n'a
// arbitré le vrai tarif. Écrit en dur ici, pas dans packages/shared ni
// config.py, pour ne pas le confondre avec une valeur déjà décidée.
//
// LE BOUTON EST BLOQUÉ, VOLONTAIREMENT — même décision que Pricing.jsx
// (D-049) : aucun processeur de paiement n'est branché, aucun clic ne doit
// avoir l'air de fonctionner. `onAbonner` reste câblé (App.jsx) pour le
// jour où un vrai paiement existera.

import { Check, CreditCard, Storefront, X } from "@phosphor-icons/react";

const AVANTAGES_GRATUIT = [
  "Fiche revendiquée ou créée, après validation",
  "Modification des coordonnées (téléphone, réservation, horaires)",
  "Nombre de consultations, et quelques noms récents",
];

const LIMITES_GRATUIT = [
  "Détail des visiteurs non accessible",
  "Pas de notification aux clients",
];

const AVANTAGES_ABONNE = [
  "Tout le palier gratuit",
  "Détail complet des visites : qui, quand",
  // Non construit — voir DECISIONS.md D-055/D-056 : l'infrastructure
  // d'envoi n'existe pas encore, seule l'analytique est fonctionnelle.
  "Notifications ciblées aux clients ayant consulté la fiche (à venir)",
  "Réponses aux avis laissés sur le restaurant (à venir)",
];

export default function PricingRestaurateur({ user, onBack }) {
  const dejaAbonne = Boolean(user?.restaurateur_abonne);

  return (
    <>
      <h1 className="detail__title">
        <Storefront size={26} weight="bold" style={{ verticalAlign: "-3px", marginRight: 8 }} />
        Abonnement restaurateur
      </h1>
      <p className="detail__meta" style={{ marginBottom: 28, maxWidth: 60 + "ch" }}>
        La gestion de votre fiche reste gratuite. L'abonnement débloque le
        détail de qui consulte votre restaurant.
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
            {dejaAbonne ? "Formule de base" : "Formule actuelle"}
          </button>
        </div>

        <div className="pricing__carte pricing__carte--vedette">
          <span className="pricing__badge">Recommandé</span>
          <h2 className="pricing__nom">Abonné</h2>
          <p className="pricing__prix">
            10&nbsp;€<span className="pricing__periode">/mois</span>
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
