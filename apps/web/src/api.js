// apps/web/src/api.js
//
// Client API. Partagé de fait avec l'app mobile : à factoriser dans
// packages/shared quand la duplication deviendra coûteuse.
//
// L'URL vient de l'environnement. En dur, elle casse au premier déploiement.
import { BUDGET_MAX, BUDGET_MIN } from "./lib/filtres";

// Exportée : Login/Signup en ont besoin pour construire le lien "Continuer
// avec Google", une vraie navigation de page (pas un appel `fetch`) que
// `request()` ci-dessous ne peut pas servir.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);

  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // Réponse non JSON : on garde le message générique.
    }
    // LE CODE HTTP VOYAGE AVEC LE MESSAGE. Sans lui, l'interface ne peut pas
    // distinguer « connectez-vous » (401) de « quelque chose a cassé » (500),
    // et devrait comparer des chaînes de caractères pour le deviner — ce qui
    // casse à la première reformulation d'un message.
    const erreur = new Error(detail);
    erreur.status = res.status;
    throw erreur;
  }

  return res.json();
}

/**
 * Restaurants autour d'un point.
 *
 * `lat` et `lng` sont obligatoires côté serveur : pas de coordonnées par
 * défaut, le projet doit fonctionner dans n'importe quelle ville.
 */
export async function fetchRestaurants({
  lat, lng, radius = 2000, cuisines, limit = 24,
  budgetMin,
  budgetMax, ouvert, reservation, avecCarte, scoreMin, scoreMax,
}) {
  const query = new URLSearchParams({ lat, lng, radius, limit });
  if (cuisines?.length) query.set("cuisines", cuisines.join(","));
  // Les filtres (D-034) retirent des lignes sans toucher au classement.
  // Une borne egale a la borne par defaut n'est pas transmise : le serveur
  // ne doit filtrer que ce que l'utilisateur a reellement restreint.
  // UNE BORNE AU MAXIMUM DE L'ECHELLE N'EST PAS UN PLAFOND. La glissiere
  // s'arrete a 60 EUR, mais cette position veut dire « 60 et au-dela » : 26
  // restaurants coutent davantage, et les transmettre comme plafond les
  // ecartait alors que l'utilisateur n'avait rien restreint. Meme logique en
  // bas de l'echelle. On n'envoie donc que les bornes reellement deplacees.
  if (budgetMin != null && budgetMin > BUDGET_MIN) query.set("budget_min", budgetMin);
  if (budgetMax != null && budgetMax < BUDGET_MAX) query.set("budget_max", budgetMax);
  if (ouvert) query.set("ouvert", "true");
  if (reservation) query.set("reservation", "true");
  if (avecCarte) query.set("avec_carte", "true");
  // Filtre de score : ouvert à tous depuis D-067 (le voyageur ne paie rien).
  // Score : converti de l'échelle d'affichage (0–10) vers celle du Local
  // Signal stocké en base (0–100) — voir packages/shared/filtres.js.
  if (scoreMin != null && scoreMin > 0) query.set("score_min", scoreMin * 10);
  if (scoreMax != null && scoreMax < 10) query.set("score_max", scoreMax * 10);
  // `credentials: "include"` est indispensable : sans lui le cookie de
  // session ne part jamais, et l'API ne peut jamais distinguer un visiteur
  // connecté d'un anonyme (elle appliquerait alors toujours la limite des
  // visiteurs non connectés, même une fois inscrit).
  return request(`/api/restaurants?${query}`, { credentials: "include" });
}

/** Recherche par nom, pour rattacher une action (revendication, carte scannée) au bon restaurant. */
export async function rechercherRestaurants(q) {
  if (!q || q.trim().length < 2) return { restaurants: [] };
  return request(`/api/restaurants/recherche?q=${encodeURIComponent(q.trim())}`);
}

export async function fetchRestaurant(id) {
  // `credentials: "include"` : sans le cookie, l'API ne peut pas savoir qu'un
  // compte admin regarde, et ne renverrait jamais `detail_calcul` pour lui.
  return request(`/api/restaurant/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
}

/* ------------------------------------------------------ Administration --- */
// Réservé aux comptes `role: "admin"` — l'API applique la même règle
// (`require_admin`, backend/core/auth/dependencies.py), ces fonctions ne
// font que relayer, jamais la décision elle-même.

/** `restaurateurStatut` : 'valide' | 'en_attente' | 'sans' (D-057). */
export async function fetchAdminRestaurants({ limit = 50, offset = 0, q, restaurateurStatut } = {}) {
  const query = new URLSearchParams({ limit, offset });
  if (q) query.set("q", q);
  if (restaurateurStatut) query.set("restaurateur_statut", restaurateurStatut);
  return request(`/api/admin/restaurants?${query}`, { credentials: "include" });
}

export async function fetchAdminRestaurant(id) {
  return request(`/api/admin/restaurants/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
}

/** Corrige les horaires et/ou le type de cuisine (`require_admin` côté API). */
export async function updateAdminRestaurant(id, fields) {
  return request(`/api/admin/restaurants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(fields),
  });
}

/** Retire n'importe quel avis (modération) — pas seulement le sien. */
export async function deleteAdminAvis(avisId) {
  return request(`/api/admin/avis/${avisId}`, {
    method: "DELETE",
    credentials: "include",
  });
}

/** Cuisines réellement présentes en base, pour alimenter les filtres. */
export async function fetchCuisines(zone) {
  const query = zone ? `?zone=${encodeURIComponent(zone)}` : "";
  return request(`/api/cuisines${query}`);
}

export async function createReservation(reservation) {
  return request("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reservation),
  });
}

/**
 * Analyse la photo d'une carte de restaurant.
 *
 * Fonctionnalité centrale du projet côté mobile. Exposée ici aussi : le web
 * peut recevoir un fichier déposé, même si le geste naturel reste l'appareil
 * photo du téléphone.
 */
export async function scanMenu(file, provider) {
  const form = new FormData();
  form.append("image", file);

  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  return request(`/api/menu/scan${query}`, { method: "POST", body: form });
}

/**
 * URL de la photo d'un restaurant (D-025).
 *
 * L'endpoint répond 404 quand aucune photo n'est connue — c'est un cas normal,
 * pas une anomalie. Les composants s'appuient sur `onError` pour retomber sur
 * le visuel de repli plutôt que de tester l'existence au préalable, ce qui
 * doublerait le nombre de requêtes.
 */
export function photoUrl(restaurantId) {
  return `${API_BASE}/api/restaurant/${encodeURIComponent(restaurantId)}/photo`;
}

/**
 * URL de la photo déposée par le restaurateur propriétaire (D-059) —
 * endpoint distinct de `photoUrl`.
 *
 * `photoKey` en paramètre de requête : la réponse est cachée 24h
 * (`Cache-Control`, backend/main.py), et l'URL elle-même ne change jamais
 * quand une photo est remplacée — sans ce paramètre, le navigateur
 * continuerait de servir l'ancienne photo depuis son cache après un
 * remplacement. `photo_key` étant une empreinte du contenu, il change
 * exactement quand la photo change, ni plus ni moins.
 */
export function photoUrlRestaurateur(restaurantId, photoKey) {
  const base = `${API_BASE}/api/restaurant/${encodeURIComponent(restaurantId)}/photo-restaurateur`;
  return photoKey ? `${base}?v=${encodeURIComponent(photoKey)}` : base;
}

/** Dépose (ou remplace) la photo de vitrine de la fiche possédée par le compte restaurateur connecté. */
export async function deposerPhotoRestaurant(file) {
  const form = new FormData();
  form.append("image", file);
  return request("/api/restaurateur/mon-restaurant/photo", {
    method: "POST",
    credentials: "include",
    body: form,
  });
}

// --- Comptes utilisateurs ---
//
// La session vit dans un cookie httpOnly posé par l'API : `credentials:
// "include"` est indispensable sur chaque appel, sans quoi le navigateur
// n'envoie ni ne stocke ce cookie (fetch ne le fait jamais par défaut sur une
// requête cross-origin).

export async function signup({ email, password, name, acceptedTerms }) {
  return request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, name, accepted_terms: acceptedTerms }),
  });
}

/**
 * Crée un compte restaurateur ET sa demande de revendication/création, dans
 * le même geste (D-055 v2) — compte séparé du compte client, jamais un
 * compte client requalifié.
 */
export async function signupRestaurateur({
  email, password, name, acceptedTerms, restaurantId, message,
  proposedName, proposedAddress, proposedLat, proposedLng, proposedCuisine, proposedPhone,
}) {
  return request("/api/auth/signup-restaurateur", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email, password, name, accepted_terms: acceptedTerms,
      restaurant_id: restaurantId, message,
      proposed_name: proposedName, proposed_address: proposedAddress,
      proposed_lat: proposedLat, proposed_lng: proposedLng,
      proposed_cuisine: proposedCuisine, proposed_phone: proposedPhone,
    }),
  });
}

export async function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return request("/api/auth/logout", { method: "POST", credentials: "include" });
}

/**
 * Utilisateur courant, ou `null` s'il n'y a pas de session valide.
 *
 * Un 401 est un état normal (visiteur non connecté), pas une erreur : on ne
 * laisse donc pas `request()` le lever.
 */
export async function fetchMe() {
  try {
    return await request("/api/auth/me", { credentials: "include" });
  } catch {
    return null;
  }
}

// --- Droits RGPD (LS-29, LS-39) — accès, portabilité, effacement ---
//
// L'endpoint existait déjà côté API, jamais relié à l'interface : les droits
// n'étaient exerçables qu'en ligne de commande. Voir Settings.jsx.

/** Toutes les données rattachées au compte connecté (droit d'accès + portabilité). */
export async function fetchMesDonnees() {
  return request("/api/auth/mes-donnees", { credentials: "include" });
}

/** Efface définitivement le compte connecté. Irréversible. */
export async function supprimerCompte() {
  return request("/api/auth/compte", { method: "DELETE", credentials: "include" });
}

/** Lève une erreur `status === 401` si le mot de passe actuel est incorrect. */
export async function changerMotDePasse(motDePasseActuel, nouveauMotDePasse) {
  return request("/api/auth/mot-de-passe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      mot_de_passe_actuel: motDePasseActuel,
      nouveau_mot_de_passe: nouveauMotDePasse,
    }),
  });
}

// --- Favoris (tout compte voyageur, D-067 — backend/main.py::_require_voyageur) ---

export async function fetchFavoris() {
  return request("/api/favoris", { credentials: "include" });
}

export async function addFavori(restaurantId) {
  return request(`/api/favoris/${encodeURIComponent(restaurantId)}`, {
    method: "POST",
    credentials: "include",
  });
}

export async function removeFavori(restaurantId) {
  return request(`/api/favoris/${encodeURIComponent(restaurantId)}`, {
    method: "DELETE",
    credentials: "include",
  });
}

// --- Avis laissés par nos utilisateurs — RETIRÉS (D-063) ---
//
// On ne peut plus laisser d'avis sur un restaurant. Seule la modération
// admin des avis déjà en base subsiste (`deleteAdminAvis`).

// --- Photo de carte envoyée depuis la fiche (D-038, D-039) ---

/**
 * Envoie la photo d'une carte, rattachée à ce restaurant.
 *
 * La connexion n'est pas exigée : le premier réflexe devant une carte en
 * vitrine est de la photographier, pas de créer un compte. L'envoi est alors
 * simplement anonyme.
 *
 * L'image rejoint un corpus interne qui n'est jamais servi (D-038). Ce qui
 * revient ici, c'est ce que la lecture automatique en a tiré.
 */
export async function envoyerCarte(restaurantId, file) {
  const form = new FormData();
  form.append("image", file);

  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/carte`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
}

/** Combien de cartes ont été envoyées pour ce restaurant (métadonnées seules). */
export async function fetchCartes(restaurantId) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/cartes`);
}

// --- Rôle restaurateur (D-055) ---
//
// Une demande (revendication ou proposition de fiche) n'accorde rien tant
// qu'un admin ne l'a pas validée (backend/main.py::admin_valider_demande) :
// ces fonctions ne font que déposer la demande ou lire son statut.

/** Dépose une demande de revendication (`restaurantId`) ou de création de fiche. */
export async function demanderRestaurateur(demande) {
  return request("/api/restaurateur/demande", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(demande),
  });
}

/** Statut de la demande du compte connecté, et sa fiche si elle est validée. */
export async function fetchStatutRestaurateur() {
  return request("/api/restaurateur/statut", { credentials: "include" });
}

/** Fiche possédée par le compte restaurateur connecté. */
export async function fetchMonRestaurant() {
  return request("/api/restaurateur/mon-restaurant", { credentials: "include" });
}

/** Corrige téléphone / lien de réservation / horaires de la fiche possédée. */
export async function modifierMonRestaurant(champs) {
  return request("/api/restaurateur/mon-restaurant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(champs),
  });
}

/** Fréquentation de la fiche possédée — détail complet, gratuit pour tous (D-063). */
export async function fetchVisitesMonRestaurant() {
  return request("/api/restaurateur/mon-restaurant/visites", { credentials: "include" });
}

/* --- Administration : file d'attente des demandes restaurateur --- */

export async function fetchDemandesRestaurateur() {
  return request("/api/admin/demandes-restaurateur", { credentials: "include" });
}

export async function validerDemandeRestaurateur(claimId) {
  return request(`/api/admin/demandes-restaurateur/${claimId}/valider`, {
    method: "POST",
    credentials: "include",
  });
}

export async function refuserDemandeRestaurateur(claimId) {
  return request(`/api/admin/demandes-restaurateur/${claimId}/refuser`, {
    method: "POST",
    credentials: "include",
  });
}


// --- Offres professionnelles et hôtels (D-067) ---
//
// Le voyageur ne paie rien. Paient les restaurateurs (Visibilité 29 €,
// Visibilité+ 59 €) et les hôtels (49 €). Démonstration : aucun paiement
// réel n'est encaissé (voir backend/main.py, section OFFRES PROFESSIONNELLES).

export async function signupHotel(fields) {
  return request("/api/auth/signup-hotel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(fields),
  });
}

/** Offre en cours du compte pro connecté : `{ abonnement: {...} | null }`. */
export async function fetchAbonnement() {
  return request("/api/pro/abonnement", { credentials: "include" });
}

/** `offre` : "visibilite", "visibilite_plus" (restaurateur) ou "hotel". */
export async function souscrireOffre(offre) {
  return request("/api/pro/abonnement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ offre }),
  });
}

export async function resilierOffre() {
  return request("/api/pro/abonnement/resilier", { method: "POST", credentials: "include" });
}

export async function fetchMonHotel() {
  return request("/api/hotel/mon-hotel", { credentials: "include" });
}

export async function updateMonHotel(champs) {
  return request("/api/hotel/mon-hotel", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(champs),
  });
}

/** Données publiques de la page d'un hôtel (404 sans abonnement en cours). */
export async function fetchPageHotel(slug) {
  return request(`/api/hotels/${encodeURIComponent(slug)}`);
}

// --- Tableau de bord restaurateur (D-068) ---

/** Statistiques, rang, demandes de table ; blocs réservés à `null` sans offre. */
export async function fetchTableauDeBord() {
  return request("/api/restaurateur/tableau-de-bord", { credentials: "include" });
}

export async function fetchHistoriqueAbonnement() {
  return request("/api/pro/abonnement/historique", { credentials: "include" });
}
