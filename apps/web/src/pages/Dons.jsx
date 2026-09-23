// apps/web/src/pages/Dons.jsx
//
// Page de don. BOUTON VOLONTAIREMENT BLOQUÉ — même décision que Pricing.jsx :
// aucun moyen de paiement n'est intégré, rien ici ne doit avoir l'air de
// fonctionner. Retour utilisateur explicite : « on ne peut pas le mettre
// fonctionnel, mais il faut le mettre » — la page existe, le geste non.

import { ArrowLeft, Heart } from "@phosphor-icons/react";

export default function Dons({ onBack }) {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Soutenir Local Signal</h1>

      <section className="legal__section">
        <p>
          Local Signal reste gratuit à découvrir, et le restera pour son
          usage de base. Si le projet vous est utile, un don aide à couvrir
          les coûts de fonctionnement (hébergement, collecte des données) et
          à continuer de l'améliorer.
        </p>

        <button className="btn btn--primary" style={{ marginTop: 16 }} disabled>
          <Heart size={17} weight="fill" />
          Faire un don — bientôt disponible
        </button>
      </section>
    </div>
  );
}
