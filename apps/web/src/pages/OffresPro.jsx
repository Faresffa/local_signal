// apps/web/src/pages/OffresPro.jsx
//
// Offres professionnelles (D-067, remplace Pricing.jsx — l'ancien Pass
// Voyageur — et PourLesRestaurateurs.jsx).
//
// LE MODÈLE DU MÉMOIRE (§4.3, tableau 27) : le voyageur ne paie rien. Paient
// ceux qui ont un intérêt direct à ce qu'il trouve un bon restaurant
// indépendant : le restaurateur, qui gagne des clients, et l'hôtel, qui offre
// un service à sa clientèle. Les prix vivent dans `OFFRES` ci-dessous — seul
// endroit de l'interface web qui les porte.
//
// LA RÈGLE DE NEUTRALITÉ EST ÉCRITE SUR LA PAGE, pas seulement dans les CGU :
// payer n'achète jamais un score ni un rang. C'est l'argument qui rend le
// classement crédible, il doit se lire au moment où l'on regarde les prix.

import { Bed, Check, Scales, Storefront } from "@phosphor-icons/react";

const OFFRES_RESTAURATEUR = [
  {
    id: "fiche",
    nom: "Fiche",
    prix: "0",
    periode: "pour toujours",
    avantages: [
      "Votre restaurant est déjà référencé grâce à OpenStreetMap",
      "Revendiquer ou créer votre fiche (validée par notre équipe)",
      "Coordonnées, horaires, lien de réservation, photo de devanture",
      "Demandes de table des voyageurs",
      "Le même score que tous les autres, abonnés ou non",
    ],
  },
  {
    id: "visibilite",
    nom: "Visibilité",
    prix: "29",
    periode: "HT / mois",
    vedette: true,
    avantages: [
      "Mention « Partenaire » sur votre fiche",
      "Fiche enrichie : photos, carte à jour, traductions",
      "Statistiques de vues de votre fiche",
      "Premier mois offert",
    ],
  },
  {
    id: "visibilite_plus",
    nom: "Visibilité+",
    prix: "59",
    periode: "HT / mois",
    avantages: [
      "Tout Visibilité",
      "Présence dans l'encart « À découvrir dans le quartier », séparé du classement",
      "Rapport mensuel",
      "Mois offert si l'objectif de vues n'est pas atteint",
    ],
  },
];

const OFFRE_HOTEL = {
  nom: "Hôtel ou conciergerie",
  prix: "49",
  periode: "HT / mois",
  avantages: [
    "Une page « Où manger autour de l'hôtel » à vos couleurs",
    "Un QR code à poser en chambre et à la réception",
    "Un lien à glisser dans votre livret d'accueil",
    "Le nombre de clients qui ont ouvert la page",
    "Zéro travail pour la réception, premier mois offert",
  ],
};

function Carte({ nom, prix, periode, avantages, vedette, action }) {
  return (
    <div className={`pricing__carte${vedette ? " pricing__carte--vedette" : ""}`}>
      {vedette && <span className="pricing__badge">La plus choisie</span>}
      <h3 className="pricing__nom">{nom}</h3>
      <p className="pricing__prix">
        {prix}&nbsp;€<span className="pricing__periode"> · {periode}</span>
      </p>
      <ul className="pricing__liste">
        {avantages.map((a) => (
          <li key={a}>
            <Check size={16} weight="bold" className="pricing__coche" />
            {a}
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}

export default function OffresPro({
  user, onGoToSignupRestaurateur, onGoToSignupHotel, onGoToEspaceRestaurateur,
  onGoToEspaceHotel, onBack,
}) {
  const role = user?.role;

  const actionRestaurateur =
    role === "restaurateur" ? (
      <button className="btn btn--primary btn--block" onClick={onGoToEspaceRestaurateur}>
        Gérer mon offre
      </button>
    ) : !user ? (
      <button className="btn btn--primary btn--block" onClick={onGoToSignupRestaurateur}>
        Créer un compte restaurateur
      </button>
    ) : null;

  const actionHotel =
    role === "hotel" ? (
      <button className="btn btn--primary btn--block" onClick={onGoToEspaceHotel}>
        Mon espace hôtel
      </button>
    ) : !user ? (
      <button className="btn btn--primary btn--block" onClick={onGoToSignupHotel}>
        Créer un compte hôtel
      </button>
    ) : null;

  return (
    <>
      <h1 className="detail__title">Offres professionnelles</h1>
      <p className="detail__meta" style={{ marginBottom: 20, maxWidth: 64 + "ch" }}>
        Local Signal est <strong>gratuit pour les voyageurs</strong>. Il est
        financé par les restaurateurs qui veulent une fiche plus complète, et
        par les hôtels qui l'offrent à leurs clients. Sans commission.
      </p>

      <div className="pricing__neutralite">
        <Scales size={20} weight="bold" />
        <p>
          <strong>Règle de neutralité.</strong> Payer ne change jamais le score
          d'un restaurant ni sa place dans le classement. Les offres n'achètent
          que de la présentation et un encart à part, toujours étiqueté
          « Partenaire ».
        </p>
      </div>

      <h2 className="pricing__section">
        <Storefront size={20} weight="bold" /> Restaurateurs
      </h2>
      <div className="pricing__grid pricing__grid--passes">
        {OFFRES_RESTAURATEUR.map((o) => (
          <Carte key={o.id} {...o} action={actionRestaurateur} />
        ))}
      </div>

      <h2 className="pricing__section">
        <Bed size={20} weight="bold" /> Hôtels et conciergeries
      </h2>
      <p className="detail__meta" style={{ marginBottom: 16, maxWidth: 64 + "ch" }}>
        Chaque jour, la réception se fait demander « où manger dans le coin ? ».
        Offrez à vos clients une sélection fiable des restaurants authentiques
        autour de l'établissement. L'hôtel n'est pas noté et ne choisit pas les
        restaurants : il affiche le classement Local Signal, tel quel.
      </p>
      <div className="pricing__grid pricing__grid--hotel">
        <Carte {...OFFRE_HOTEL} vedette={false} action={actionHotel} />
      </div>

      <p className="formfield__hint" style={{ marginTop: 16 }}>
        Paiement pas encore activé : la souscription est une démonstration, rien
        n'est encaissé.
      </p>

      <button className="linkbtn" onClick={onBack} style={{ marginTop: 24 }}>
        Retour
      </button>
    </>
  );
}
