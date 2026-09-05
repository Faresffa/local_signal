// apps/web/src/api.js
//
// Client API. Partagé de fait avec l'app mobile : à factoriser dans
// packages/shared quand la duplication deviendra coûteuse.
//
// L'URL vient de l'environnement. En dur, elle casse au premier déploiement.
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
    throw new Error(detail);
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
  tranchePrix, ouvert, reservation, avecCarte,
}) {
  const query = new URLSearchParams({ lat, lng, radius, limit });
  if (cuisines?.length) query.set("cuisines", cuisines.join(","));
  // Les filtres (D-034) retirent des lignes sans toucher au classement.
  if (tranchePrix) query.set("tranche_prix", tranchePrix);
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
