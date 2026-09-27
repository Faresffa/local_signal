// apps/web/src/pages/Pricing.jsx
//
// Page du Pass Voyageur (D-063, remplace l'abonnement mensuel de LS-refonte).
//
// UN FORFAIT TEMPOREL, PAS UN ABONNEMENT (modèle eSIM / pass transport) : le
// voyageur achète un accès pour la durée de son séjour, en une fois, sans
// reconduction. Trois durées, tarifs arrêtés dans le business plan v2 — ils
// vivent dans `PASS` ci-dessous, seul endroit de l'interface web qui les
// porte (le mobile a sa propre copie, PricingScreen.js).
//
// LE BOUTON EST BLOQUÉ, VOLONTAIREMENT (même décision que l'abonnement
// d'avant, D-049) : aucun processeur de paiement n'est branché. `onAbonner`
// (App.jsx) reste câblé pour le jour où un vrai paiement existera. Côté
// base, un Pass actif se traduit par `role = "subscriber"` — l'expiration
// à la fin de la durée achetée viendra avec le paiement.

import { Check, CreditCard, X } from "@phosphor-icons/react";

const AVANTAGES_GRATUIT = [
  "5 premiers restaurants de chaque recherche",
  "Score Local Signal et explication complète",
];

const LIMITES_GRATUIT = [
  "Le reste des résultats reste verrouillé",
  "Filtres avancés verrouillés",
  "Publicités affichées",
];

const AVANTAGES_PASS = [
  "Tous les restaurants de chaque recherche",
  "Filtres avancés, dont la fourchette sur le score Local Signal",
  "Scans de cartes illimités",
  "Recherches illimitées et restaurants favoris",
  "Aucune publicité",
];

const PASS = [
  { id: "3j", nom: "Pass Week-end", duree: "3 jours", prix: "2,99" },
  { id: "7j", nom: "Pass Semaine", duree: "7 jours", prix: "4,99", vedette: true },
  { id: "1an", nom: "Pass Annuel", duree: "12 mois", prix: "14,99", note: "Pour les voyageurs fréquents" },
];

export default function Pricing({ user, onBack }) {
  const passActif = user?.role === "subscriber" || user?.role === "admin";

  return (
    <>
      <h1 className="detail__title">Pass Voyageur</h1>
      <p className="detail__meta" style={{ marginBottom: 28, maxWidth: 60 + "ch" }}>
        Local Signal reste gratuit pour découvrir les premiers restaurants de
        chaque recherche. Pour tout débloquer, prenez un Pass à la durée de
        votre séjour : un seul paiement, sans abonnement ni reconduction.
      </p>

      {/* Les quatre formules côte à côte, gratuite en premier : on lit de
          gauche à droite ce qu'on gagne en passant à un Pass. */}
      <div className="pricing__grid pricing__grid--passes">
        <div className="pricing__carte">
          <h2 className="pricing__nom">Gratuit</h2>
          <p className="pricing__prix">
            0&nbsp;€<span className="pricing__periode"> · sans limite de durée</span>
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
            {user && !passActif ? "Formule actuelle" : "Formule de base"}
          </button>
        </div>

        {PASS.map((p) => (
          <div
            key={p.id}
            className={`pricing__carte${p.vedette ? " pricing__carte--vedette" : ""}`}
          >
            {p.vedette && <span className="pricing__badge">Offre phare</span>}
            <h2 className="pricing__nom">{p.nom}</h2>
            <p className="pricing__prix">
              {p.prix}&nbsp;€<span className="pricing__periode"> TTC · {p.duree}</span>
            </p>
            {p.note && <p className="pricing__note">{p.note}</p>}

            <ul className="pricing__liste">
              {AVANTAGES_PASS.map((a) => (
                <li key={a}>
                  <Check size={16} weight="bold" className="pricing__coche" />
                  {a}
                </li>
              ))}
            </ul>

            <button
              className={`btn ${p.vedette ? "btn--primary" : "btn--ghost"} btn--block`}
              disabled
            >
              <CreditCard size={17} weight="bold" />
              {passActif ? "Pass déjà actif" : "Paiement bientôt disponible"}
            </button>
          </div>
        ))}
      </div>

      <button className="linkbtn" onClick={onBack} style={{ marginTop: 24 }}>
        Retour
      </button>
    </>
  );
}
