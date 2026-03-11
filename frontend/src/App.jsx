import { useState, useEffect } from "react";
import "./App.css";
import { fetchRestaurants, createReservation } from "./api";
import {
  Search, MapPin, Users, UtensilsCrossed, Sparkles,
  Wallet, ChevronLeft, CalendarClock, User, Mail,
  CheckCircle2, Info, Navigation
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const TYPES = ["Italienne", "Japonaise", "Française", "Végétarienne", "Asiatique"];
const AMBIANCES = ["Cosy", "Familial", "Romantique", "Moderne", "Rustique"];
const ALLERGENES = ["Sans gluten", "Vegan", "Végétarien", "Halal"];

// ===== Images base64 helper =====
function getImageUrl(imagePath) {
  return `http://localhost:8000/static/${imagePath}`;
}

// ===== Star display =====
function Stars({ rating }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <span className="card-stars">
      {"★".repeat(full)}
      {half ? "½" : ""}
      {"☆".repeat(empty)}
      <span style={{ marginLeft: 6, fontSize: "0.82rem", color: "#717171" }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

// =========================================================================
// RESTAURANT CARD
// =========================================================================
function RestaurantCard({ r, onReserve, compact = false, showScores = true }) {
  return (
    <div className={`resto-card ${compact ? 'compact' : ''}`}>
      <div className="resto-card-image-wrapper">
        <img
          src={`/resto${(parseInt(r.id.split("_")[1]) % 5) + 1}.jpg`}
          alt={r.name}
          onError={(e) => { e.target.src = "/localsignal-logo-header.png"; }}
        />
        {r.reservation && (
          <span className="badge-reservation">
            <CheckCircle2 size={12} style={{ marginRight: 4 }} />
            Réservation dispo
          </span>
        )}
        {showScores && (
          <span className="score-badge">
            {(r.scoring?.score_final || 0).toFixed(1)} / 100
          </span>
        )}
      </div>
      <div className="card-body">
        <h3>{r.name}</h3>
        <div className="card-meta">
          {r.type} · {r.ambiance} · {r.price}€/pers
        </div>
        {showScores && r.rating && <Stars rating={r.rating} />}

        {r.dietary_options && r.dietary_options.length > 0 && (
          <div className="dietary-tags">
            {r.dietary_options.map(tag => (
              <span key={tag} className="diet-tag">{tag}</span>
            ))}
          </div>
        )}

        {!compact && showScores && (
          <div className="card-scores">
            <span className="score-tag">Geo: {((r.scoring?.score_geo_tourist + r.scoring?.score_geo_user) / 2 * 100).toFixed(0)}%</span>
            <span className="score-tag">Lang: {r.scoring?.score_language ? "Adapté" : "Non traduit"}</span>
          </div>
        )}
      </div>
      {r.reservation && (
        <div className="card-actions">
          <button className="btn-reserve" onClick={() => onReserve(r)}>
            Réserver une table
          </button>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// HOME PAGE
// =========================================================================
function HomePage({ onStart, onReserve }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    // Demander la localisation
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchRecs(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          setGeoError(true);
          fetchRecs(48.8566, 2.3522); // Fallback Paris
        }
      );
    } else {
      fetchRecs(48.8566, 2.3522);
    }
  }, []);

  const fetchRecs = async (lat, lng) => {
    try {
      const data = await fetchRestaurants({ lat, lng });
      setRestaurants(data.restaurants?.slice(0, 4) || []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <div className="hero-section">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="hero-logo" />
        <h1 className="hero-title">Trouvez la table parfaite, n'importe où.</h1>
        <p className="hero-subtitle">Des recommandations personnalisées selon votre profil, la langue et la distance.</p>
        <button className="btn-start" onClick={onStart}>
          <Search size={18} style={{ marginRight: 8, display: "inline-block", verticalAlign: "text-bottom" }} />
          Rechercher un restaurant
        </button>
      </div>

      <div className="recommendations-section">
        <div className="recommendations-header">
          <h2 className="section-title" style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "0.2rem", color: "var(--text)" }}>
            Recommandations pour vous
          </h2>
          {!geoError ? (
            <p className="location-hint" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <MapPin size={12} /> Basé sur votre position actuelle
            </p>
          ) : (
            <p className="error-text hint-text" style={{ marginTop: 0 }}>Position inconnue (Paris par défaut)</p>
          )}
        </div>

        {loading ? (
          <div className="loader" style={{ marginTop: "3rem" }}></div>
        ) : (
          <div className="recs-grid">
            {restaurants.map(r => <RestaurantCard key={r.id} r={r} onReserve={onReserve} showScores={false} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// SEARCH PAGE
// =========================================================================
function LocationPicker({ onLocationSelect }) {
  const [mode, setMode] = useState("auto"); // auto, address, map
  const [address, setAddress] = useState("");
  const [mapPosition, setMapPosition] = useState([48.8566, 2.3522]); // Paris
  const [geoError, setGeoError] = useState("");

  const handleAutoLocation = () => {
    setGeoError("");
    setMode("auto");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onLocationSelect({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setGeoError("Impossible d'obtenir la position. Veuillez utiliser une adresse.")
      );
    } else {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur.");
    }
  };

  const geocodeAddress = async () => {
    if (!address) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        onLocationSelect({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        setGeoError("Adresse trouvée !");
      } else {
        setGeoError("Adresse introuvable.");
      }
    } catch {
      setGeoError("Erreur lors de la recherche.");
    }
  };

  // Composant pour capter les clics sur la carte Leaflet
  function MapEvents() {
    useMapEvents({
      click(e) {
        setMapPosition([e.latlng.lat, e.latlng.lng]);
        onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    return null;
  }

  return (
    <div className="location-picker">
      <div className="location-tabs">
        <button className={`tab-btn ${mode === "auto" ? "active" : ""}`} onClick={handleAutoLocation}>
          <Navigation size={16} /> Autour de moi
        </button>
        <button className={`tab-btn ${mode === "address" ? "active" : ""}`} onClick={() => setMode("address")}>
          <MapPin size={16} /> Adresse
        </button>
        <button className={`tab-btn ${mode === "map" ? "active" : ""}`} onClick={() => setMode("map")}>
          Carte
        </button>
      </div>

      {mode === "auto" && (
        <div className="location-content">
          <p className="location-hint">Nous utilisons votre position actuelle pour trouver les meilleurs restaurants à proximité.</p>
          {geoError && <p className="error-text">{geoError}</p>}
        </div>
      )}

      {mode === "address" && (
        <div className="location-content flex-row">
          <input
            type="text"
            placeholder="Ex: 15 Rue de Rivoli, Paris"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input-address"
          />
          <button className="btn-secondary" onClick={geocodeAddress}>Chercher</button>
        </div>
      )}

      {mode === "address" && geoError && <p className="error-text hint-text">{geoError}</p>}

      {mode === "map" && (
        <div className="location-content map-wrapper">
          <MapContainer center={mapPosition} zoom={13} style={{ height: "200px", width: "100%", borderRadius: "8px", zIndex: 0 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={mapPosition} />
            <MapEvents />
          </MapContainer>
          <p className="location-hint" style={{ marginTop: "8px" }}>Cliquez sur la carte pour définir votre position.</p>
        </div>
      )}
    </div>
  );
}

function SearchPage({ onSearch }) {
  const [coords, setCoords] = useState({ lat: 48.8566, lng: 2.3522 }); // Default Paris
  const [types, setTypes] = useState([]);
  const [ambiances, setAmbiances] = useState([]);
  const [allergenes, setAllergenes] = useState([]);
  const [personnes, setPersonnes] = useState(2);
  const [budgetMin, setBudgetMin] = useState(10);
  const [budgetMax, setBudgetMax] = useState(80);

  const toggleList = (list, setList, val) => {
    setList(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  };

  const handleSearch = () => {
    onSearch({
      lat: coords.lat,
      lng: coords.lng,
      types,
      ambiances,
      allergenes,
      personnes,
      budgetMin,
      budgetMax
    });
  };

  return (
    <>
      <header className="header">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="header-logo" />
      </header>
      <div className="search-page">
        <h2 className="page-title">Trouvez une table</h2>

        <div className="filter-section">
          <label className="section-title"><MapPin size={16} /> Où êtes-vous ?</label>
          <LocationPicker onLocationSelect={setCoords} />
        </div>

        <div className="filter-section">
          <label className="section-title"><Users size={16} /> Nombre de personnes</label>
          <div className="slider-container">
            <input
              type="range" min="1" max="10" value={personnes}
              onChange={(e) => setPersonnes(Number(e.target.value))}
            />
            <div className="slider-value">{personnes} personne{personnes > 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="filter-section">
          <label className="section-title"><Wallet size={16} /> Budget par personne</label>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "#717171", fontWeight: "500" }}>{budgetMin}€</span>
            <input
              type="range" min="10" max="150" value={budgetMax}
              onChange={(e) => setBudgetMax(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: "0.85rem", color: "#717171", fontWeight: "500" }}>{budgetMax}€</span>
          </div>
        </div>

        <div className="filter-section">
          <label className="section-title"><UtensilsCrossed size={16} /> Cuisine</label>
          <div className="pills-row">
            {TYPES.map((t) => (
              <button
                key={t}
                className={`pill ${types.includes(t) ? "active" : ""}`}
                onClick={() => toggleList(types, setTypes, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <label className="section-title"><Sparkles size={16} /> Ambiance</label>
          <div className="pills-row">
            {AMBIANCES.map((a) => (
              <button
                key={a}
                className={`pill ${ambiances.includes(a) ? "active" : ""}`}
                onClick={() => toggleList(ambiances, setAmbiances, a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <label className="section-title"><Info size={16} /> Contraintes alimentaires</label>
          <div className="pills-row">
            {ALLERGENES.map((a) => (
              <button
                key={a}
                className={`pill ${allergenes.includes(a) ? "active" : ""}`}
                onClick={() => toggleList(allergenes, setAllergenes, a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-search" onClick={handleSearch}>
          <Search size={18} style={{ marginRight: 8 }} />
          Afficher les résultats
        </button>
      </div>
    </>
  );
}

// =========================================================================
// RESULTS PAGE
// =========================================================================
function ResultsPage({ criteria, onReserve, onBack }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRestaurants(criteria)
      .then((data) => {
        setRestaurants(data.restaurants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="header">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="header-logo" />
      </header>
      <div className="results-page">
        <button className="btn-back" onClick={onBack}>
          <ChevronLeft size={18} /> Retour
        </button>

        <div className="results-header">
          <h2 className="page-title" style={{ marginBottom: 0 }}>Restaurants trouvés</h2>
          {!loading && (
            <span className="results-count">{restaurants.length} résultat{restaurants.length > 1 ? "s" : ""}</span>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loader"></div>
            <p>Recherche des meilleures tables...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="empty-state">
            <Info size={40} color="#cbd5e1" style={{ marginBottom: "1rem" }} />
            <p>Aucun restaurant ne correspond à vos critères.</p>
            <button className="btn-secondary" onClick={onBack} style={{ marginTop: "1rem" }}>Modifier la recherche</button>
          </div>
        ) : (
          <div className="results-grid">
            {restaurants.map((r) => (
              <RestaurantCard key={r.id} r={r} onReserve={onReserve} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// =========================================================================
// RESERVATION PAGE
// =========================================================================
function ReservationPage({ restaurant, onBack }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [personnes, setPersonnes] = useState(2);
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [success, setSuccess] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  const generateSlots = (start, end) => {
    const slots = [];
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    while (h < eh || (h === eh && m <= em)) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += 30;
      if (m >= 60) { h++; m = 0; }
    }
    return slots;
  };

  const horaires = restaurant.horaires || [
    { start: "12:00", end: "14:30" },
    { start: "19:00", end: "22:00" },
  ];

  const handleConfirm = async () => {
    if (!nom || !email || !date || !selectedSlot) return;
    try {
      const res = await createReservation({
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        user_name: nom,
        user_email: email,
        num_persons: personnes,
        date,
        time_slot: selectedSlot,
      });
      setSuccess(res.message || "Réservation confirmée avec succès.");
    } catch {
      setSuccess("Une erreur s'est produite lors de la réservation.");
    }
  };

  return (
    <>
      <header className="header">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="header-logo" />
      </header>
      <div className="reservation-page">
        <button className="btn-back" onClick={onBack}>
          <ChevronLeft size={18} /> Retour
        </button>

        <div className="resto-card" style={{ marginTop: "1rem" }}>
          <div className="resto-card-image-wrapper">
            <img
              src={`/resto${(parseInt(restaurant.id.split("_")[1]) % 5) + 1}.jpg`}
              alt={restaurant.name}
              onError={(e) => { e.target.src = "/localsignal-logo-header.png"; }}
            />
          </div>
          <div className="card-body">
            <h3>{restaurant.name}</h3>
            <div className="card-meta">
              {restaurant.type} · {restaurant.ambiance} · {restaurant.price}€/pers
            </div>
            {restaurant.rating && <Stars rating={restaurant.rating} />}
            <p className="address-text" style={{ fontSize: "0.85rem", color: "#717171", marginTop: "8px" }}>
              <MapPin size={14} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              {restaurant.address}
            </p>
          </div>
        </div>

        {success ? (
          <div className="success-message" style={{ marginTop: "2rem" }}>
            <CheckCircle2 size={32} color="#059669" style={{ marginBottom: "1rem" }} />
            <h3>Demande enregistrée</h3>
            <p>{success}</p>
            <button className="btn-secondary" onClick={onBack} style={{ marginTop: "1.5rem" }}>
              Retour aux résultats
            </button>
          </div>
        ) : (
          <>
            <h2 className="page-title" style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>Finaliser la réservation</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label><User size={14} /> Nom complet</label>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" />
              </div>
              <div className="form-group">
                <label><Mail size={14} /> Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@email.com" />
              </div>
            </div>

            <div className="form-group">
              <label><Users size={14} /> Invités ({personnes})</label>
              <input
                type="range" min="1" max="10" value={personnes}
                onChange={(e) => setPersonnes(Number(e.target.value))}
              />
            </div>

            <div className="form-group" style={{ marginTop: "1.5rem" }}>
              <label><CalendarClock size={14} /> Date de réservation</label>
              <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="schedule-section" style={{ marginTop: "1.5rem" }}>
              <label><CalendarClock size={14} /> Horaire souhaité</label>
              {horaires.map((h, i) => (
                <div className="time-group" key={i} style={{ marginTop: "0.8rem" }}>
                  <div className="time-label">{i === 0 ? "Déjeuner" : "Dîner"}</div>
                  <div className="time-slots">
                    {generateSlots(h.start, h.end).map((slot) => (
                      <button
                        key={slot}
                        className={`time-slot ${selectedSlot === slot ? "active" : ""}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn-confirm"
              onClick={handleConfirm}
              disabled={!nom || !email || !date || !selectedSlot}
              style={{ marginTop: "2rem" }}
            >
              Confirmer
            </button>
          </>
        )}
      </div>
    </>
  );
}

// =========================================================================
// APP (Router)
// =========================================================================
function App() {
  const [page, setPage] = useState("home");
  const [criteria, setCriteria] = useState({});
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  if (page === "home") {
    return (
      <HomePage
        onStart={() => setPage("search")}
        onReserve={(r) => {
          setSelectedRestaurant(r);
          setPage("reservation");
        }}
      />
    );
  }

  if (page === "search") {
    return (
      <SearchPage
        onSearch={(c) => {
          setCriteria(c);
          setPage("results");
        }}
      />
    );
  }

  if (page === "results") {
    return (
      <ResultsPage
        criteria={criteria}
        onBack={() => setPage("search")}
        onReserve={(r) => {
          setSelectedRestaurant(r);
          setPage("reservation");
        }}
      />
    );
  }

  if (page === "reservation" && selectedRestaurant) {
    return (
      <ReservationPage
        restaurant={selectedRestaurant}
        onBack={() => setPage("results")}
      />
    );
  }

  return null;
}

export default App;
