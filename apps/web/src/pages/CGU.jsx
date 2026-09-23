// apps/web/src/pages/CGU.jsx
//
// Conditions générales d'utilisation.
//
// PREMIER JET, PAS UN DOCUMENT JURIDIQUE VALIDÉ. Rédigé pour refléter
// honnêtement ce que fait réellement le produit aujourd'hui (démo
// d'abonnement sans paiement réel, données réellement collectées) — à faire
// relire avant tout usage en production avec de vrais utilisateurs payants.

import { ArrowLeft } from "@phosphor-icons/react";

const DERNIERE_MISE_A_JOUR = "22 septembre 2026";

export default function CGU({ onBack, onGoToConfidentialite }) {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Conditions générales d'utilisation</h1>
      <p className="detail__meta" style={{ marginBottom: 28 }}>
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}
      </p>

      <section className="legal__section">
        <h2>1. Objet</h2>
        <p>
          Local Signal est un service qui aide un voyageur à trouver des
          restaurants fréquentés par les habitants plutôt que des adresses
          orientées vers les touristes, à l'aide d'un score d'authenticité
          calculé sur la carte, la langue des avis publics et les prix — pas
          sur la popularité ni le nombre d'avis. Le projet est né d'un
          mémoire de fin d'études (HETIC) et reste, à ce stade, un produit en
          développement actif.
        </p>
      </section>

      <section className="legal__section">
        <h2>2. Compte utilisateur</h2>
        <p>
          La création d'un compte demande un nom d'utilisateur, une adresse
          électronique et un mot de passe (ou une connexion via Google). Vous
          êtes responsable de la confidentialité de votre mot de passe et de
          toute activité effectuée depuis votre compte. Les informations
          fournies doivent être exactes ; un compte peut être suspendu en cas
          d'usage frauduleux ou abusif (spam, contenu inapproprié, tentative
          de contourner les limites du service).
        </p>
      </section>

      <section className="legal__section">
        <h2>3. Contenu que vous publiez</h2>
        <p>
          Les avis et les photos de cartes de restaurant que vous envoyez
          restent votre contenu, mais vous nous accordez le droit de les
          afficher sur le service et, pour les photos de cartes, d'en extraire
          automatiquement des informations (plats, langues, prix) qui
          alimentent le score d'authenticité du restaurant concerné — jamais
          votre nom, jamais publiées telles quelles. Vous ne devez publier que
          du contenu que vous avez le droit de publier, et rien d'illicite,
          diffamatoire ou trompeur. Un avis peut être retiré par son auteur à
          tout moment, ou par un administrateur en cas de modération.
        </p>
      </section>

      <section className="legal__section">
        <h2>4. Abonnement</h2>
        <p>
          Le service propose une formule gratuite et une formule « Abonné »
          présentées sur la page <em>S'abonner</em>. <strong>À ce stade, aucun
          paiement réel n'est traité</strong> : le bouton de paiement est
          volontairement désactivé, et le passage au statut abonné se fait
          par un mécanisme de démonstration, pas par une transaction
          financière. Cette page sera mise à jour le jour où un moyen de
          paiement réel sera intégré.
        </p>
      </section>

      <section className="legal__section">
        <h2>5. Compte restaurateur</h2>
        <p>
          Un compte peut demander à gérer la fiche d'un restaurant, en le
          revendiquant ou en le proposant s'il n'existe pas encore dans notre
          base. Cette demande est examinée et validée par une personne de
          l'équipe avant tout accès — il n'y a pas de validation automatique
          à ce stade. Une fois la fiche obtenue, le compte restaurateur peut
          en modifier les coordonnées (téléphone, lien de réservation,
          horaires) et consulter sa fréquentation.
        </p>
        <p>
          <strong>En créant un compte, vous acceptez que la consultation
          d'une fiche restaurant en étant connecté soit visible du
          restaurateur propriétaire de cette fiche</strong> (nombre de
          visites et, selon sa formule d'abonnement, votre identité parmi ses
          visiteurs récents) — voir la politique de confidentialité pour le
          détail de ce que cela recouvre et comment y renoncer en supprimant
          votre compte.
        </p>
      </section>

      <section className="legal__section">
        <h2>6. Fiabilité des informations</h2>
        <p>
          Les informations sur les restaurants (horaires, prix, adresse,
          score) proviennent de sources publiques (OpenStreetMap notamment) et
          de contributions d'utilisateurs ; elles peuvent être incomplètes,
          obsolètes ou inexactes. Le score d'authenticité est une estimation,
          pas une garantie — voir le détail « Pourquoi ce restaurant ? » sur
          chaque fiche pour comprendre ce qui l'a produit. Vérifiez toujours
          les horaires et la disponibilité directement auprès du restaurant
          avant de vous déplacer.
        </p>
      </section>

      <section className="legal__section">
        <h2>7. Résiliation</h2>
        <p>
          Vous pouvez supprimer votre compte à tout moment depuis{" "}
          <em>Paramètres → Vos données</em> ; la suppression est définitive et
          immédiate. Nous pouvons suspendre ou supprimer un compte en cas de
          violation de ces conditions.
        </p>
      </section>

      <section className="legal__section">
        <h2>8. Propriété intellectuelle</h2>
        <p>
          Le nom « Local Signal », son logo et le fonctionnement du service
          (méthode de calcul du score) appartiennent au projet. Les données de
          localisation proviennent d'OpenStreetMap et restent soumises à sa
          licence (ODbL).
        </p>
      </section>

      <section className="legal__section">
        <h2>9. Contact</h2>
        <p>
          Pour toute question sur ces conditions :{" "}
          <a href="mailto:fareshafianepro@gmail.com">fareshafianepro@gmail.com</a>.
        </p>
      </section>

      <p className="formfield__hint" style={{ marginTop: 32 }}>
        Voir aussi la{" "}
        <button type="button" className="linkbtn" onClick={onGoToConfidentialite}>
          politique de confidentialité
        </button>.
      </p>
    </div>
  );
}
