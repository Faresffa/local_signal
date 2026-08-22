// Client API mobile.
//
// Vocation à être factorisé avec apps/web/src/api.js dans packages/shared/
// quand la duplication deviendra réelle (cf. CLAUDE.md §7).
//
// ATTENTION : sur un téléphone physique, "localhost" désigne le téléphone,
// pas la machine de développement. Renseigner EXPO_PUBLIC_API_BASE avec
// l'IP locale de la machine, par exemple http://192.168.1.20:8000
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : message générique
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchRestaurants({ lat, lng, budgetMin, budgetMax } = {}) {
  const query = new URLSearchParams({
    lat: lat ?? 48.8566,
    lng: lng ?? 2.3522,
    budget_min: budgetMin ?? 0,
    budget_max: budgetMax ?? 200,
  });
  return request(`/api/restaurants?${query}`);
}

/**
 * Envoie la photo d'une carte au backend pour analyse.
 *
 * C'est la fonctionnalité centrale de l'app : l'utilisateur est devant le
 * restaurant, il photographie la carte en vitrine, il obtient une réponse
 * sans qu'aucun avis ne soit nécessaire (D-004, D-001).
 *
 * @param {string} uri  URI locale de la photo (fourni par expo-image-picker)
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
