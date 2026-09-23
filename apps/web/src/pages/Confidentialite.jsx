// apps/web/src/pages/Confidentialite.jsx
//
// Politique de confidentialité / RGPD.
//
// PREMIER JET, PAS UN DOCUMENT JURIDIQUE VALIDÉ — mêmes réserves que CGU.jsx.
// Décrit ce que le service collecte RÉELLEMENT aujourd'hui (vérifié dans le
// code : backend/db/models.py, repository.py::export_user_data/delete_user),
// pas une liste générique recopiée d'un autre site.

import { ArrowLeft } from "@phosphor-icons/react";

const DERNIERE_MISE_A_JOUR = "22 septembre 2026";

export default function Confidentialite({ onBack, onGoToCGU }) {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Politique de confidentialité</h1>
      <p className="detail__meta" style={{ marginBottom: 28 }}>
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}
      </p>

      <section className="legal__section">
        <h2>1. Quelles données sont collectées</h2>
        <ul className="legal__liste">
          <li>
            <strong>Compte</strong> : nom d'utilisateur, adresse électronique,
            mot de passe (jamais stocké en clair — uniquement son empreinte
            cryptographique).
          </li>
          <li>
            <strong>Connexion Google</strong>, si vous l'utilisez : votre
            adresse et votre nom Google, rien de plus.
          </li>
          <li>
            <strong>Avis</strong> que vous publiez sur un restaurant.
          </li>
          <li>
            <strong>Photos de cartes de restaurant</strong> envoyées — que
            vous soyez connecté ou non. Une fois envoyée, une photo est
            « déliée » de la personne qui l'a soumise : nous gardons ce
            qu'elle nous a appris sur le restaurant, pas qui l'a envoyée.
          </li>
          <li>
            <strong>Réservations</strong> effectuées via le service (nom,
            e-mail, date).
          </li>
          <li>
            <strong>Historique de consultation</strong> des fiches restaurant,
            uniquement si vous êtes connecté — voir §2 pour ce qu'il devient.
          </li>
          <li>
            <strong>Demande de compte restaurateur</strong>, le cas échéant :
            le restaurant revendiqué ou proposé, et les informations que vous
            transmettez pour le décrire.
          </li>
          <li>
            <strong>Un cookie de session</strong>, pour rester connecté — voir
            §4.
          </li>
        </ul>
        <p>
          Nous ne collectons ni ne demandons aucune donnée bancaire : aucun
          paiement réel n'est traité par le service à ce stade.
        </p>
      </section>

      <section className="legal__section">
        <h2>2. Pourquoi ces données</h2>
        <p>
          Le compte sert à retrouver vos avis et vos favoris d'une visite à
          l'autre. Les avis et les photos de cartes alimentent le score
          d'authenticité des restaurants — c'est le cœur du service : sans
          cette contribution, le score ne peut pas exister. Aucune donnée
          n'est vendue ni partagée avec un tiers à des fins commerciales.
        </p>
        <p>
          Quand vous consultez la fiche d'un restaurant en étant connecté,
          cette consultation est associée à votre compte. Si ce restaurant a
          un compte restaurateur validé, celui-ci peut voir qu'il a été
          consulté et, selon sa formule, votre nom ou votre e-mail parmi ses
          visiteurs récents — c'est ce qui permet à un restaurateur de savoir
          qui s'intéresse à son établissement, au même titre que la
          fréquentation qu'il observerait en salle. Un visiteur non connecté
          n'est jamais identifiable de cette façon. En acceptant les
          conditions générales d'utilisation à l'inscription, vous acceptez
          ce fonctionnement.
        </p>
      </section>

      <section className="legal__section">
        <h2>3. Combien de temps ces données sont conservées</h2>
        <p>
          Aussi longtemps que votre compte existe. La suppression du compte
          (§5) efface immédiatement et définitivement le compte, les avis et
          les réservations qui lui sont rattachés. Comme pour les photos de
          cartes (§1), votre historique de consultation n'est pas supprimé
          mais « délié » : les restaurateurs concernés gardent un compte de
          fréquentation correct, mais plus aucune ligne ne vous désigne.
        </p>
      </section>

      <section className="legal__section">
        <h2>4. Cookies</h2>
        <p>
          Un cookie, <code>ls_session</code>, est strictement nécessaire pour
          vous reconnaître d'une page à l'autre une fois connecté ; il reste
          actif quel que soit votre choix dans la bannière, comme le permet
          la réglementation pour les cookies indispensables au fonctionnement
          du service.
        </p>
        <p>
          À votre première visite, une bannière vous demande d'accepter ou de
          refuser les cookies. Votre choix est mémorisé dans votre
          navigateur ; il ne change rien aujourd'hui, le service ne posant
          aucun autre cookie — mais il servira de porte d'entrée le jour où un
          outil de mesure d'audience sera ajouté : ce cookie-là ne s'activera
          que si vous avez accepté.
        </p>
      </section>

      <section className="legal__section">
        <h2>5. Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de
          rectification, d'effacement et de portabilité de vos données.
        </p>
        <ul className="legal__liste">
          <li>
            <strong>Accès et portabilité</strong> : téléchargez toutes vos
            données au format JSON depuis <em>Paramètres → Vos données →
            Télécharger mes données</em>.
          </li>
          <li>
            <strong>Effacement</strong> : supprimez votre compte depuis{" "}
            <em>Paramètres → Vos données → Supprimer mon compte</em> —
            immédiat et définitif.
          </li>
          <li>
            <strong>Rectification</strong> : modifiable directement pour le
            mot de passe (Paramètres) ; pour le reste, contactez-nous.
          </li>
        </ul>
        <p>
          Pour toute question ou demande que l'interface ne couvre pas :{" "}
          <a href="mailto:fareshafianepro@gmail.com">fareshafianepro@gmail.com</a>.
        </p>
      </section>

      <section className="legal__section">
        <h2>6. Hébergement</h2>
        <p>
          Les données sont hébergées chez notre prestataire d'hébergement.
          Les données de localisation des restaurants proviennent
          d'OpenStreetMap.
        </p>
      </section>

      <p className="formfield__hint" style={{ marginTop: 32 }}>
        Voir aussi les{" "}
        <button type="button" className="linkbtn" onClick={onGoToCGU}>
          conditions générales d'utilisation
        </button>.
      </p>
    </div>
  );
}
