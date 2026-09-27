// apps/web/src/pages/PourLesRestaurateurs.jsx
//
// Ce qu'un restaurateur peut faire sur Local Signal (D-063, remplace
// PricingRestaurateur.jsx). Plus de palier payant : le modèle économique ne
// fait payer que la demande (Pass Voyageur, publicité), jamais le
// restaurateur, et ne prend aucune commission.
//
// LA PAGE DIT AUSSI CE QU'IL NE PEUT PAS FAIRE. C'est la moitié du message :
// un restaurateur ne peut ni payer ni agir pour améliorer son score — sinon
// le score mesurerait l'effort commercial, pas l'ancrage local (D-001, D-014).

import { Check, Storefront, X } from "@phosphor-icons/react";

const POSSIBLE = [
  "Revendiquer la fiche de votre restaurant, ou la créer si elle n'existe pas (validée à la main par notre équipe)",
  "Mettre à jour vos coordonnées : téléphone, lien de réservation, horaires",
  "Déposer une photo de votre devanture",
  "Suivre la fréquentation de votre fiche : nombre de consultations et détail des visites",
  "Être trouvé par des voyageurs qui cherchent précisément une adresse de quartier",
];

const IMPOSSIBLE = [
  "Payer pour être mieux classé : aucune offre ne le permet",
  "Modifier votre score, votre carte ou son analyse : ils sont calculés sans vous",
  "Recevoir ou masquer des avis : Local Signal n'en publie pas",
];

export default function PourLesRestaurateurs({ user, onGoToSignupRestaurateur, onGoToEspace, onBack }) {
  const estRestaurateur = user?.role === "restaurateur";

  return (
    <>
      <h1 className="detail__title">
        <Storefront size={26} weight="bold" style={{ verticalAlign: "-3px", marginRight: 8 }} />
        Vous êtes restaurateur ?
      </h1>
      <p className="detail__meta" style={{ marginBottom: 28, maxWidth: 60 + "ch" }}>
        Local Signal est <strong>entièrement gratuit pour les restaurateurs</strong>,
        sans abonnement ni commission. Votre restaurant est déjà référencé
        grâce à OpenStreetMap ; un compte restaurateur vous permet de tenir
        sa fiche à jour.
      </p>

      <div className="pricing__grid">
        <div className="pricing__carte pricing__carte--vedette">
          <h2 className="pricing__nom">Ce que vous pouvez faire</h2>
          <p className="pricing__prix">
            0&nbsp;€<span className="pricing__periode"> · pour toujours</span>
          </p>
          <ul className="pricing__liste">
            {POSSIBLE.map((a) => (
              <li key={a}>
                <Check size={16} weight="bold" className="pricing__coche" />
                {a}
              </li>
            ))}
          </ul>
          {estRestaurateur ? (
            <button className="btn btn--primary btn--block" onClick={onGoToEspace}>
              Mon espace restaurateur
            </button>
          ) : !user ? (
            <button className="btn btn--primary btn--block" onClick={onGoToSignupRestaurateur}>
              Créer un compte restaurateur
            </button>
          ) : null}
        </div>

        <div className="pricing__carte">
          <h2 className="pricing__nom">Ce qui ne s'achète pas</h2>
          <p className="pricing__note" style={{ marginBottom: 12 }}>
            Le score mesure l'ancrage local d'un restaurant. Il ne doit
            dépendre ni de votre budget, ni de vos efforts de communication.
          </p>
          <ul className="pricing__liste">
            {IMPOSSIBLE.map((a) => (
              <li key={a} className="pricing__limite">
                <X size={16} weight="bold" className="pricing__croix" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button className="linkbtn" onClick={onBack} style={{ marginTop: 24 }}>
        Retour
      </button>
    </>
  );
}
