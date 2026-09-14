// apps/mobile/src/api.js
//
// Client API. Miroir de apps/web/src/api.js : à factoriser dans
// packages/shared quand la duplication deviendra coûteuse.
//
// ATTENTION : sur un téléphone physique, "localhost" désigne le téléphone et
// non la machine de développement. Renseigner EXPO_PUBLIC_API_BASE avec l'IP
// locale de la machine, par exemple http://192.168.1.20:8000
import { BUDGET_MAX, BUDGET_MIN } from "./lib/filtres";
import { effacerJeton, ecrireJeton, lireJeton } from "./lib/session";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

// LE JETON EST GARDÉ EN MÉMOIRE EN PLUS DU STOCKAGE SÉCURISÉ (LS-40).
//
// Lire le Keychain à chaque requête coûterait un aller-retour natif par appel,
// pour une valeur qui ne change qu'à la connexion et à la déconnexion. Le
// stockage reste la source de vérité entre deux lancements ; cette variable
// est le cache de la session en cours.
let jetonCourant = null;

/** Recharge le jeton depuis le stockage sécurisé. À appeler au démarrage. */
export async function restaurerSession() {
  jetonCourant = await lireJeton();
  return jetonCourant;
}

async function poserJeton(jeton) {
  jetonCourant = jeton ?? null;
  if (jeton) await ecrireJeton(jeton);
  else await effacerJeton();
}

async function request(path, options = {}) {
  // L'en-tête n'est ajouté que s'il y a une session : envoyer « Bearer null »
  // vaudrait un jeton invalide, donc une 401 là où on attend un anonyme.
  const headers = { ...(options.headers || {}) };
  if (jetonCourant) headers.Authorization = `Bearer ${jetonCourant}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // Réponse non JSON : on garde le message générique.
    }
    // LE CODE HTTP VOYAGE AVEC LE MESSAGE : sans lui, l'interface devrait
    // comparer des chaînes pour distinguer « connectez-vous » d'une panne.
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
  lat, lng, radius = 2000, cuisines, budgetMin, budgetMax,
  ouvert, reservation, avecCarte, limit = 30,
}) {
  const query = new URLSearchParams({ lat, lng, radius, limit });
  if (cuisines?.length) query.set("cuisines", cuisines.join(","));
  // Un restaurant sans prix connu n'est pas exclu par le serveur (D-012) :
  // envoyer les bornes ne penalise pas l'information manquante.
  // UNE BORNE AU MAXIMUM DE L'ECHELLE N'EST PAS UN PLAFOND. La glissiere
  // s'arrete a 60 EUR, mais cette position veut dire « 60 et au-dela » : 26
  // restaurants coutent davantage, et les transmettre comme plafond les
  // ecartait alors que l'utilisateur n'avait rien restreint. Meme logique en
  // bas de l'echelle. On n'envoie donc que les bornes reellement deplacees.
  if (budgetMin != null && budgetMin > BUDGET_MIN) query.set("budget_min", budgetMin);
  if (budgetMax != null && budgetMax < BUDGET_MAX) query.set("budget_max", budgetMax);

  // Filtres issus des donnees collectees (D-034). On n'envoie que ceux qui
  // sont actifs : un `false` explicite dirait au serveur de filtrer, alors
  // qu'un filtre inactif ne doit rien retirer.
  if (ouvert) query.set("ouvert", "true");
  if (reservation) query.set("reservation", "true");
  if (avecCarte) query.set("avec_carte", "true");

  return request(`/api/restaurants?${query}`);
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
 * Envoie la photo d'une carte au serveur pour analyse.
 *
 * Fonctionnalité centrale de l'application : l'utilisateur est devant le
 * restaurant, il photographie la carte en vitrine, il obtient une réponse sans
 * qu'aucun avis ne soit nécessaire (D-004, D-001).
 */
export async function scanMenu(uri) {
  const name = uri.split("/").pop() || "menu.jpg";
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  const type = ext === "png" ? "image/png" : "image/jpeg";

  const form = new FormData();
  form.append("image", { uri, name, type });

  return request("/api/menu/scan", { method: "POST", body: form });
}

/**
 * URL de la photo d'un restaurant (D-025).
 *
 * L'endpoint répond 404 quand aucune photo n'est connue : c'est un cas normal.
 * Le composant Image gère l'échec via `onError` et bascule sur son visuel de
 * repli, plutôt que de vérifier l'existence au préalable — ce qui doublerait
 * le nombre de requêtes pour chaque vignette.
 */
export function photoUrl(restaurantId) {
  return `${API_BASE}/api/restaurant/${encodeURIComponent(restaurantId)}/photo`;
}

// --- Comptes utilisateurs (LS-40) ---
//
// Le même compte que sur le web : même table, même jeton, même expiration.
// L'en-tête `X-Jeton-Session` demande au serveur de rendre le jeton dans le
// corps de la réponse — ce qu'il ne fait pour personne d'autre, le navigateur
// devant continuer à s'appuyer sur son cookie httpOnly.

const DEMANDE_JETON = {
  "Content-Type": "application/json",
  "X-Jeton-Session": "oui",
};

export async function signup({ email, password, name }) {
  const user = await request("/api/auth/signup", {
    method: "POST",
    headers: DEMANDE_JETON,
    body: JSON.stringify({ email, password, name }),
  });
  await poserJeton(user.token);
  return user;
}

export async function login({ email, password }) {
  const user = await request("/api/auth/login", {
    method: "POST",
    headers: DEMANDE_JETON,
    body: JSON.stringify({ email, password }),
  });
  await poserJeton(user.token);
  return user;
}

export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    // LE JETON LOCAL PART DANS TOUS LES CAS. Si l'appel échoue — réseau
    // coupé, serveur indisponible — garder le jeton laisserait l'utilisateur
    // « connecté » dans une application qui vient de lui dire le contraire.
    await poserJeton(null);
  }
}

/**
 * Utilisateur courant, ou `null`.
 *
 * Un 401 est un état normal — jeton expiré, session révoquée depuis le web.
 * On en profite pour effacer le jeton mort : le garder ferait échouer chaque
 * requête suivante sans que personne ne sache pourquoi.
 */
export async function fetchMe() {
  if (!jetonCourant) return null;
  try {
    return await request("/api/auth/me");
  } catch (e) {
    if (e.status === 401) await poserJeton(null);
    return null;
  }
}

// --- Avis laissés par nos utilisateurs (D-039) ---
//
// CES AVIS N'ENTRENT DANS AUCUN CALCUL : ils sont stockés et affichés, rien de
// plus (D-001).

export async function fetchAvis(restaurantId) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/avis`);
}

export async function laisserAvis(restaurantId, { rating, text }) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/avis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, text }),
  });
}

export async function retirerAvis(restaurantId) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/avis`, {
    method: "DELETE",
  });
}

// --- Photo de carte envoyée depuis la fiche (D-038, D-039) ---

/**
 * Envoie la photo d'une carte, rattachée à ce restaurant.
 *
 * Même appel que `scanMenu`, à ceci près que le restaurant est connu : c'est
 * toute la différence entre une analyse affichée puis perdue et une
 * contribution qui enrichit la base (CLAUDE.md §3).
 *
 * La connexion n'est pas exigée. Si l'utilisateur est connecté, le jeton part
 * avec la requête et la contribution lui est attribuée ; sinon elle est
 * anonyme, et c'est très bien.
 */
export async function envoyerCarte(restaurantId, uri) {
  const name = uri.split("/").pop() || "carte.jpg";
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  form.append("image", { uri, name, type });

  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/carte`, {
    method: "POST",
    body: form,
  });
}

/** Combien de cartes ont été envoyées pour ce restaurant (métadonnées seules). */
export async function fetchCartes(restaurantId) {
  return request(`/api/restaurant/${encodeURIComponent(restaurantId)}/cartes`);
}
