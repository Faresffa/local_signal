// packages/shared/content.js
//
// SOURCE UNIQUE DES TEXTES ET DES LIEUX DE DÉMONSTRATION (D-026).
//
// Même raison d'être que tokens.js pour le design : le web et le mobile
// doivent tenir le même discours. Deux interfaces qui décrivent le produit
// différemment donnent l'impression de deux produits.
//
// LA RÈGLE D'ÉCRITURE, à respecter pour toute modification :
//
// Ce produit ne vend pas « la table parfaite » — c'est le discours de toutes
// les plateformes de réservation, et c'est précisément celui contre lequel le
// projet se construit. Il défend une thèse :
//
//   Les restaurants de quartier ne sont pas mal notés. Ils sont INVISIBLES.
//   Leur invisibilité vient de leur absence de popularité, pas d'un défaut
//   de qualité. Classer par popularité les condamne mécaniquement (D-001).
//
// Chaque phrase doit donc pouvoir se rattacher à cette thèse. Trois interdits :
//   1. Ne jamais promettre « les meilleurs » — le projet ne classe pas la
//      qualité, il mesure l'ancrage local.
//   2. Ne jamais s'appuyer sur les notes ou le nombre d'avis — c'est ce que
//      D-007 a explicitement sorti du scoring.
//   3. Ne jamais annoncer une certitude que le scoring n'a pas : les
//      pondérations sont provisoires tant que le jeu labellisé n'existe pas
//      (D-006). Le vocabulaire reste celui de l'indice, pas du verdict.

export const copy = {
  // --- Accueil ---
  heroTitle: "Mangez là où mangent les habitants.",
  heroSubtitle:
    "Les bonnes adresses de quartier ne sont pas mal notées — elles sont invisibles. " +
    "Local Signal les fait remonter sans se fier à leur popularité.",
  heroCta: "Trouver une adresse locale",

  recommendationsTitle: "Repérées près de vous",
  recommendationsHint:
    "Classées sur ce que dit leur carte, pas sur le nombre d'avis.",

  // --- Recherche ---
  searchTitle: "Où cherchez-vous ?",
  searchSubtitle:
    "Dites-nous d'où vous partez. Le reste se joue sur la carte des restaurants, " +
    "leurs prix et leur distance aux sites touristiques.",

  locationLabel: "Votre point de départ",
  locationAutoHint:
    "Nous cherchons autour de vous, dans un rayon de deux kilomètres.",
  locationDemoLabel: "Ou explorez le Quartier latin",
  locationDemoHint:
    "La zone d'étude du projet : touristique et populaire y sont imbriqués, " +
    "rue par rue. C'est ce qui rend la mesure intéressante.",

  peopleLabel: "Combien êtes-vous ?",
  budgetLabel: "Budget par personne",
  cuisineLabel: "Envie de quoi ?",
  ambianceLabel: "Quelle ambiance ?",
  dietaryLabel: "Contraintes alimentaires",
  searchCta: "Voir les adresses",

  // --- Résultats ---
  resultsTitle: "Adresses trouvées",
  resultsHint:
    "Ordonnées par ancrage local, puis par distance. Touchez « pourquoi » " +
    "pour voir ce qui a été observé.",
  resultsEmpty: "Aucune adresse ici pour l'instant.",
  resultsEmptyHint:
    "La base ne couvre que les zones déjà relevées. Essayez le Quartier latin.",

  // --- Explication (D-009) ---
  whyTitle: "Pourquoi cette adresse",
  whyToggleOpen: "Voir le détail du calcul",
  whyToggleClose: "Masquer le détail",
  whyDisclaimer:
    "Les pondérations sont provisoires : elles seront dérivées d'un jeu de " +
    "données labellisé, pas choisies à la main.",
  provisional: "Peu d'informations — indice provisoire",

  // --- Scan (D-004) ---
  scanTitle: "Photographiez la carte",
  scanSubtitle:
    "Devant le restaurant, prenez la carte affichée en vitrine. " +
    "C'est le seul signal disponible pour une adresse dont personne n'a jamais parlé.",
  scanCta: "Prendre la carte en photo",
  scanPickCta: "Choisir une photo",
  scanAnalyzing: "Lecture de la carte…",
};

/**
 * Lieux de départ du Quartier latin, proposés en accès direct.
 *
 * Sert deux usages qui se rejoignent : rendre la démonstration immédiate, et
 * donner un point de départ à qui n'est pas sur place. Toutes les coordonnées
 * sont à l'intérieur de la zone relevée — voir ZONES dans
 * backend/ingestion/osm/overpass.py. Un point hors zone renverrait une liste
 * vide, ce qui est le contraire du but recherché.
 */
export const demoPlaces = [
  { label: "Place Maubert", lat: 48.8503, lng: 2.3484 },
  { label: "Panthéon", lat: 48.8462, lng: 2.3464 },
  { label: "Rue Mouffetard", lat: 48.842, lng: 2.3496 },
  { label: "Saint-Michel", lat: 48.8534, lng: 2.344 },
  { label: "Odéon", lat: 48.8519, lng: 2.3399 },
  { label: "Jardin des Plantes", lat: 48.8434, lng: 2.3559 },
];

/** Repli quand la position est indisponible ou hors zone couverte. */
export const fallbackLocation = {
  lat: 48.8462,
  lng: 2.347,
  label: "Quartier latin, Paris 5ᵉ",
};

export default { copy, demoPlaces, fallbackLocation };
