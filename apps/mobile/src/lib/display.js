// apps/mobile/src/lib/display.js
//
// Traductions d'affichage. Miroir exact de apps/web/src/lib/display.js :
// les deux interfaces doivent produire le même verdict pour le même
// restaurant, sinon l'utilisateur qui passe du web au mobile perd confiance.
//
// À factoriser dans packages/shared dès qu'une troisième divergence apparaît.

// Seuils du verdict. PROVISOIRES : à caler sur le jeu labellisé (D-006).
const SEUIL_LOCAL = 70;
const SEUIL_MIXTE = 45;

/**
 * Traduit un Local Signal en verdict lisible.
 *
 * Règle d'affichage (D-009) : jamais de score chiffré par défaut.
 * Une confiance faible ne produit pas un verdict tiède mais un verdict
 * explicitement incertain.
 *
 * Retourne la clé de couleur plutôt que la couleur : le composant la résout
 * selon le thème courant.
 */
export function verdict(localSignal, confidence = 1) {
  if (localSignal == null) return { label: "Non évalué", tone: "unknown" };
  if (confidence < 0.4) return { label: "Évaluation provisoire", tone: "unknown" };
  if (localSignal >= SEUIL_LOCAL) return { label: "Profil local", tone: "local" };
  if (localSignal >= SEUIL_MIXTE) return { label: "Profil mixte", tone: "mixed" };
  return { label: "Profil touristique", tone: "tourist" };
}

/** Couleurs d'un verdict dans le thème courant. */
export function verdictColors(tone, colors) {
  const map = {
    local: [colors.localSoft, colors.local],
    mixed: [colors.mixedSoft, colors.mixed],
    tourist: [colors.touristSoft, colors.tourist],
    unknown: [colors.surfaceSunken, colors.textMuted],
  };
  const [background, text] = map[tone] || map.unknown;
  return { background, text };
}

/** Distance lisible : mètres sous un kilomètre, kilomètres au-delà. */
export function distance(metres) {
  if (metres == null) return null;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Horaires OSM : format brut peu lisible, nettoyé a minima. */
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

/**
 * Teinte stable dérivée de l'identifiant, pour le visuel de remplacement.
 *
 * OpenStreetMap ne fournit pas de photographies, et une image de stock
 * aléatoire affirmerait quelque chose de faux sur un produit dont l'argument
 * est la fiabilité du jugement. Voir components/CuisineVisual.
 */
export function hue(id) {
  let hash = 0;
  for (let i = 0; i < (id || "").length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  return 12 + (hash % 46);
}

/** Convertit une teinte en couleur de fond selon le thème. */
export function visualBackground(h, isDark) {
  // MÊMES VALEURS QUE LE WEB (D-022). Le web pose un dégradé sur trois arrêts ;
  // React Native n'a pas de dégradé natif, donc on reprend l'arrêt médian —
  // la teinte dominante est identique à l'œil.
  //
  // Le clair était à 38 % de saturation sur 86 % de luminosité : les cartes
  // ressemblaient à des rectangles beiges vides. La correction avait été faite
  // sur le web seulement, ce qui est exactement la divergence que
  // packages/shared existe pour empêcher.
  return isDark ? `hsl(${h}, 28%, 30%)` : `hsl(${h}, 54%, 50%)`;
}

export function visualForeground(h, isDark) {
  return isDark ? `hsl(${h}, 55%, 88%)` : `hsl(${h}, 60%, 96%)`;
}
