const API_BASE = "http://localhost:8000";

export async function fetchRestaurants(params = {}) {
  const query = new URLSearchParams({
    lat: params.lat || 48.8566,
    lng: params.lng || 2.3522,
    budget_min: params.budgetMin || 0,
    budget_max: params.budgetMax || 200,
    ...(params.lieu && { lieu: params.lieu }),
    ...(params.types && params.types.length > 0 && { types: params.types.join(",") }),
    ...(params.ambiances && params.ambiances.length > 0 && { ambiances: params.ambiances.join(",") }),
    ...(params.allergenes && params.allergenes.length > 0 && { allergenes: params.allergenes.join(",") }),
  });

  const res = await fetch(`${API_BASE}/api/restaurants?${query}`);
  const data = await res.json();
  return data;
}

export async function fetchRestaurant(id) {
  const res = await fetch(`${API_BASE}/api/restaurant/${id}`);
  return res.json();
}

export async function createReservation(reservation) {
  const res = await fetch(`${API_BASE}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reservation),
  });
  return res.json();
}
