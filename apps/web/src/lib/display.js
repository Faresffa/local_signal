// apps/web/src/lib/display.js
//
// Traductions d'affichage partagées par les écrans web.
// Le mobile a son équivalent : toute modification ici doit y être répercutée
// tant que packages/shared ne porte pas encore cette logique.

// Seuils du verdict. PROVISOIRES : à caler sur le jeu labellisé (D-006).
const SEUIL_LOCAL = 70;
const SEUIL_MIXTE = 45;

/**
 * Traduit un Local Signal en verdict lisible.
 *
 * Règle d'affichage (D-009) : on ne montre jamais le score chiffré par défaut.
 * L'utilisateur veut savoir où manger, pas lire un tableau de bord.
 *
 * Une confiance faible ne produit pas un verdict tiède mais un verdict
 * explicitement incertain : l'incertitude se dit, elle ne se maquille pas.
 */
export function verdict(localSignal, confidence = 1) {
  if (localSignal == null) {
    return { label: "Non évalué", tone: "unknown" };
  }
  if (confidence < 0.4) {
    return { label: "Évaluation provisoire", tone: "unknown" };
  }
  if (localSignal >= SEUIL_LOCAL) return { label: "Profil local", tone: "local" };
  if (localSignal >= SEUIL_MIXTE) return { label: "Profil mixte", tone: "mixed" };
  return { label: "Profil touristique", tone: "tourist" };
}

/** Distance lisible : mètres en dessous d'un kilomètre, kilomètres au-delà. */
export function distance(metres) {
  if (metres == null) return null;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Horaires OSM : format brut peu lisible, on le nettoie a minima. */
/**
 * Rend les horaires lisibles.
 *
 * DEUX FORMATS COHABITENT EN BASE. OpenStreetMap écrit
 * « Mo-Fr 12:00-14:30,19:00-22:00 » ; les fiches importées portent un objet
 * JSON dont les clés sont les jours en toutes lettres. L'import est non
 * destructif (D-029), donc il n'a pas uniformisé l'existant : le lecteur doit
 * accepter les deux. Sans ça la fiche affichait le JSON brut, accolades
 * comprises.
 *
 * Les jours consécutifs aux mêmes horaires sont regroupés — sept lignes
 * identiques n'apprennent rien de plus qu'une seule.
 */
export function hours(openingHours) {
  if (!openingHours) return null;

  const texte = String(openingHours).trim();
  if (!texte.startsWith("{")) {
    return texte.replace(/;/g, " · ").replace(/,/g, ", ");
  }

  let table;
  try {
    table = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!table || typeof table !== "object") return null;

  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const COURT = { lundi: "Lun", mardi: "Mar", mercredi: "Mer", jeudi: "Jeu",
                  vendredi: "Ven", samedi: "Sam", dimanche: "Dim" };

  const groupes = [];
  for (const jour of JOURS) {
    const plages = table[jour];
    if (!Array.isArray(plages) || plages.length === 0) continue;
    const valeur = plages.join(", ");
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.valeur === valeur) dernier.fin = jour;
    else groupes.push({ debut: jour, fin: jour, valeur });
  }
  if (groupes.length === 0) return null;

  return groupes
    .map((g) => {
      const nom = g.debut === g.fin ? COURT[g.debut] : `${COURT[g.debut]}–${COURT[g.fin]}`;
      return `${nom} ${g.valeur}`;
    })
    .join(" · ");
}
