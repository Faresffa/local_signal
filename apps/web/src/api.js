// apps/web/src/api.js
//
// Client API. Partagé de fait avec l'app mobile : à factoriser dans
// packages/shared quand la duplication deviendra coûteuse.
//
// L'URL vient de l'environnement. En dur, elle casse au premier déploiement.
import { BUDGET_MAX, BUDGET_MIN } from "./lib/filtres";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

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
  budgetMax, ouvert, reservation, avecCarte,
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
  // `credentials: "include"` est indispensable : sans lui le cookie de
  // session ne part jamais, et l'API ne peut jamais distinguer un visiteur
  // connecté d'un anonyme (elle appliquerait alors toujours la limite des
  // visiteurs non connectés, même une fois inscrit).
  return request(`/api/restaurants?${query}`, { credentials: "include" });
}

export async function fetchRestaurant(id) {
  return request(`/api/restaurant/${encodeURIComponent(id)}`);
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

// --- Comptes utilisateurs ---
//
// La session vit dans un cookie httpOnly posé par l'API : `credentials:
// "include"` est indispensable sur chaque appel, sans quoi le navigateur
// n'envoie ni ne stocke ce cookie (fetch ne le fait jamais par défaut sur une
// requête cross-origin).

export async function signup({ email, password, name }) {
  return request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, name }),
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

// --- Avis laissés par nos utilisateurs (D-039) ---
//
// CES AVIS N'ENTRENT DANS AUCUN CALCUL. Ils sont stockés et affichés, rien de
// plus : les faire compter reviendrait à réintroduire la popularité dans un
// score construit pour s'en passer (D-001).

/** Avis d'un restaurant, et le sien s'il est connecté. */
export async function fetchAvis(restaurantId) {
  return request(
    `/api/restaurant/${encodeURIComponent(restaurantId)}/avis`,
    { credentials: "include" },
  );
}

/**
 * Dépose ou remplace son avis. Lève une erreur `status === 401` si la session
 * n'est pas valide — c'est le signal que l'interface doit proposer de se
 * connecter, pas afficher une panne.
 */
export async function laisserAvis(restaurantId, { rating, text }) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/avis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ rating, text }),
  });
}

/** Retire son propre avis. */
export async function retirerAvis(restaurantId) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/avis`, {
    method: "DELETE",
    credentials: "include",
  });
}

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
