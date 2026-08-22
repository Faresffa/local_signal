// Client API — partagé de fait avec l'app mobile (à factoriser dans
// packages/shared/ quand la duplication deviendra réelle).
//
// L'URL de l'API vient de l'environnement : en dur, elle casse au premier
// déploiement (voir docs/ROADMAP.md §6).
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : on garde le message générique
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchRestaurants(params = {}) {
  const query = new URLSearchParams({
    lat: params.lat ?? 48.8566,
    lng: params.lng ?? 2.3522,
    budget_min: params.budgetMin ?? 0,
    budget_max: params.budgetMax ?? 200,
    ...(params.lieu && { lieu: params.lieu }),
    ...(params.types?.length && { types: params.types.join(",") }),
    ...(params.ambiances?.length && { ambiances: params.ambiances.join(",") }),
    ...(params.allergenes?.length && { allergenes: params.allergenes.join(",") }),
  });

  return request(`/api/restaurants?${query}`);
}

export async function fetchRestaurant(id) {
  return request(`/api/restaurant/${id}`);
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
 * Fonctionnalité centrale du projet : elle permet de scorer un restaurant
 * sans aucun avis (docs/DECISIONS.md — D-004, D-001).
 *
 * @param {File|Blob} file    photo de la carte
 * @param {string}    [provider]  'groq' ou 'claude' — pour le comparatif (D-017)
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
