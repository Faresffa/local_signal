// apps/mobile/src/api.js
//
// Client API. Miroir de apps/web/src/api.js : à factoriser dans
// packages/shared quand la duplication deviendra coûteuse.
//
// ATTENTION : sur un téléphone physique, "localhost" désigne le téléphone et
// non la machine de développement. Renseigner EXPO_PUBLIC_API_BASE avec l'IP
// locale de la machine, par exemple http://192.168.1.20:8000
import { BUDGET_MAX, BUDGET_MIN } from "./lib/filtres";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

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
