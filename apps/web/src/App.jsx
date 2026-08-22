import { useState, useEffect } from "react";
import "./App.css";
import { fetchRestaurants, createReservation, photoUrl } from "./api";
import { copy, demoPlaces, fallbackLocation } from "../../../packages/shared/content.js";
import {
  Search, MapPin, Users, UtensilsCrossed, Sparkles,
  Wallet, ChevronLeft, CalendarClock, User, Mail,
  CheckCircle2, Info, Navigation, Clock, MessageSquare,
  Star, Eye
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

/**
 * Position de repli, utilisée quand la géolocalisation est refusée, indisponible,
 * ou qu'elle pointe hors des zones relevées.
 *
 * Définie dans packages/shared/content.js et partagée avec le mobile (D-026) :
 * les deux interfaces doivent retomber au même endroit, sinon la démonstration
 * ne montre pas la même chose selon l'écran.
 *
 * Les coordonnées précédentes (48.8520, 2.4222) étaient commentées « Paris »
 * mais désignaient Montreuil — à 6 km, soit hors du rayon de recherche.
 */
const FALLBACK_LOCATION = fallbackLocation;

/** Au-delà, on cesse d'attendre la géolocalisation et on affiche la zone de repli. */
const GEOLOCATION_TIMEOUT_MS = 7000;

const TYPES = ["Française", "Italienne", "Indonésienne", "Thaïlandaise", "Brasserie", "Bistrot", "Street Food"];
const AMBIANCES = ["Exotique", "Chic", "Convivial", "Familial", "Écologique", "Décontracté", "Populaire", "Moderne", "Champêtre", "Rustique"];
const ALLERGENES = ["Sans gluten", "Vegan", "Végétarien", "Halal"];

// ===== Images =====
// Les visuels de démonstration sont servis depuis public/ — pas depuis l'API.
// (L'ancienne URL pointait vers /static/ sur le backend, qui ne monte aucun
// StaticFiles : toutes les images étaient cassées.)
function getImageUrl(imagePath) {
  return `/${imagePath}`;
}

// =========================================================================
// EXPLICATION — « pourquoi ce restaurant ? »  (D-009)
//
// Le score n'est pas affiché par défaut. L'utilisateur voit des raisons en
// langage naturel ; le détail chiffré est replié, pour les curieux.
// =========================================================================
function WhySection({ scoring }) {
  const [open, setOpen] = useState(false);
  const reasons = scoring.reasons ?? [];
  const signals = scoring.signals ?? {};

  return (
    <div className="detail-section">
      <h3 className="detail-section-title">{copy.whyTitle}</h3>

      <ul className="why-list">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      <button className="why-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? copy.whyToggleClose : copy.whyToggleOpen}
      </button>

      {open && (
        <div className="why-detail">
          <div className="why-row">
            <span>Local Signal</span>
            <strong>{(scoring.local_signal ?? 0).toFixed(0)} / 100</strong>
          </div>
          {Object.entries(signals).map(([name, s]) => (
            <div className="why-row" key={name}>
              <span>{SIGNAL_LABELS[name] ?? name}</span>
              <strong>
                {s.value == null
                  ? "non disponible"
                  : `${(s.value * 100).toFixed(0)} %`}
              </strong>
            </div>
          ))}
          <p className="why-note">
            Confiance : {((scoring.confidence ?? 0) * 100).toFixed(0)} %. Les
            pondérations sont provisoires — elles seront dérivées d'un jeu de
            données labellisé, pas choisies à la main.
          </p>
        </div>
      )}
    </div>
  );
}

const SIGNAL_LABELS = {
  menu: "Carte du restaurant",
  language: "Langue des avis",
  price: "Prix vs quartier",
  tourist_zone: "Hors zone touristique",
};

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

/**
 * Ligne d'information sous le nom : cuisine, ambiance, prix.
 *
 * Ne conserve que les champs renseignés. Les restaurants viennent
 * d'OpenStreetMap, qui porte la cuisine mais presque jamais le prix, et jamais
 * l'ambiance. Rendre les trois inconditionnellement produisait « · · €/pers ».
 */
function cuisineOf(r) {
  // OSM sépare les cuisines multiples par « ; » — on garde la principale.
  const raw = (r.cuisine || r.type || "").split(";")[0].trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

function metaLine(r) {
  return [
    cuisineOf(r),
    r.ambiance,
    r.price != null && `${r.price}€/pers`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// =========================================================================
// RESTAURANT CARD
// =========================================================================
function RestaurantCard({ r, onReserve, onDetail, compact = false, showScores = true }) {
  return (
    <div className={`resto-card ${compact ? 'compact' : ''}`}>
      <div className="resto-card-image-wrapper">
        {/* Photo Google Places quand elle existe (D-025), sinon le visuel de
            repli. L'endpoint répond 404 en l'absence de photo : `onError`
            traite ce cas, ce qui évite une requête de vérification préalable.
            Le garde `data-fallback` empêche la boucle si le repli lui-même
            échoue à charger. */}
        <img
          src={r.image ? getImageUrl(r.image) : photoUrl(r.id)}
          alt={r.name}
          loading="lazy"
          onError={(e) => {
            if (e.target.dataset.fallback) return;
            e.target.dataset.fallback = "1";
            e.target.src = "/localsignal-logo-header.png";
          }}
        />
        {r.reservation && (
          <span className="badge-reservation">
            <CheckCircle2 size={12} style={{ marginRight: 4 }} />
            Réservation dispo
          </span>
        )}
        {/* Le score chiffré n'est plus affiché sur la carte (D-009) : l'utilisateur
            veut une liste de restaurants, pas un tableau de bord. Le détail est
            accessible sur la fiche, derrière « pourquoi ? ». */}
        {showScores && r.scoring?.confidence < 0.4 && (
          <span className="score-badge score-badge--provisional">
            {copy.provisional}
          </span>
        )}
      </div>
      <div className="card-body">
        <h3>{r.name}</h3>
        {/* On n'affiche que les champs réellement renseignés. OpenStreetMap ne
            porte ni prix ni ambiance de façon fiable : afficher « · · €/pers »
            avec des valeurs vides donne l'impression d'une application cassée
            alors que la donnée n'existe simplement pas (D-012, appliqué à l'UI). */}
        {metaLine(r) && <div className="card-meta">{metaLine(r)}</div>}
        {showScores && r.rating && <Stars rating={r.rating} />}

        <p className="card-address">
          <MapPin size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
          {r.address}
        </p>

        {r.horaires && r.horaires.length > 0 && (
          <div className="card-horaires">
            <Clock size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            {r.horaires.map((h, i) => (
              <span key={i} className="horaire-slot">
                {h.start || h[0]} - {h.end || h[1]}{i < r.horaires.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        )}

        {r.dietary_options && r.dietary_options.length > 0 && (
          <div className="dietary-tags">
            {r.dietary_options.map(tag => (
              <span key={tag} className="diet-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Première raison en langage naturel, à la place des sous-scores bruts
            que personne ne sait interpréter (D-009). */}
        {!compact && showScores && r.scoring?.reasons?.[0] && (
          <div className="card-reason">{r.scoring.reasons[0]}</div>
        )}
      </div>
      <div className="card-actions">
        {onDetail && (
          <button className="btn-detail" onClick={() => onDetail(r)}>
            <Eye size={14} style={{ marginRight: 4 }} /> Voir les détails
          </button>
        )}
        {r.reservation && (
          <button className="btn-reserve" onClick={() => onReserve(r)}>
            Réserver une table
          </button>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// HOME PAGE
// =========================================================================
function HomePage({ onStart, onReserve, onDetail }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState(false);
  const [usedPosition, setUsedPosition] = useState(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError(true);
      fetchRecs(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng);
      return;
    }

    // `getCurrentPosition` n'appelle NI le succès NI l'erreur tant que
    // l'utilisateur laisse la demande d'autorisation en suspens — et certains
    // environnements ne la présentent jamais. Sans garde-fou, l'écran reste
    // indéfiniment en chargement, ce qui se lit comme une application plantée.
    let settled = false;
    const resolveOnce = (lat, lng, failed) => {
      if (settled) return;
      settled = true;
      if (failed) setGeoError(true);
      fetchRecs(lat, lng);
    };

    const timer = setTimeout(
      () => resolveOnce(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng, true),
      GEOLOCATION_TIMEOUT_MS + 1000
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolveOnce(pos.coords.latitude, pos.coords.longitude, false);
      },
      () => {
        clearTimeout(timer);
        resolveOnce(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng, true);
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60000 }
    );

    return () => clearTimeout(timer);
  }, []);

  // Déclarée en `function` (et non en `const`) pour être hoistée : l'effet
  // ci-dessus l'appelle avant sa position dans le fichier.
  async function fetchRecs(lat, lng) {
    setUsedPosition({ lat, lng });
    try {
      let data = await fetchRestaurants({ lat, lng });

      // La géolocalisation peut parfaitement fonctionner et ne rien remonter :
      // la base ne couvre que la zone d'évaluation. Zéro résultat n'est pas une
      // panne, c'est une absence de données — on le dit et on bascule sur la
      // zone de démonstration, plutôt que d'afficher une page vide.
      if (!data.restaurants?.length) {
        data = await fetchRestaurants(FALLBACK_LOCATION);
        setUsedPosition({ lat: FALLBACK_LOCATION.lat, lng: FALLBACK_LOCATION.lng });
        setGeoError(true);
      }

      setRestaurants(data.restaurants?.slice(0, 4) || []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="home-page">
      <div className="hero-section">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="hero-logo" />
        <h1 className="hero-title">{copy.heroTitle}</h1>
        <p className="hero-subtitle">{copy.heroSubtitle}</p>
        <button className="btn-start" onClick={onStart}>
          <Search size={18} style={{ marginRight: 8, display: "inline-block", verticalAlign: "text-bottom" }} />
          {copy.heroCta}
        </button>
      </div>

      <div className="recommendations-section">
        <div className="recommendations-header">
          <h2 className="section-title" style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "0.2rem", color: "var(--text)" }}>
            {copy.recommendationsTitle}
          </h2>
          <p className="location-hint" style={{ marginTop: 0, marginBottom: 4 }}>
            {copy.recommendationsHint}
          </p>
          {/* La position réellement utilisée est affichée, coordonnées comprises.
              Sans cela, impossible de distinguer « la géolocalisation a marché »
              de « on est retombé sur le repli » — or les deux ne donnent pas les
              mêmes résultats du tout. */}
          <p
            className={geoError ? "error-text hint-text" : "location-hint"}
            style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: 0 }}
          >
            <MapPin size={12} />
            {geoError
              ? `Aucun résultat près de vous — affichage de ${FALLBACK_LOCATION.label}`
              : "Votre position actuelle"}
            {usedPosition && (
              <span style={{ opacity: 0.65 }}>
                ({usedPosition.lat.toFixed(4)}, {usedPosition.lng.toFixed(4)})
              </span>
            )}
          </p>
        </div>

        {loading ? (
          <div className="loader" style={{ marginTop: "3rem" }}></div>
        ) : (
          <div className="recs-grid">
            {restaurants.map(r => <RestaurantCard key={r.id} r={r} onReserve={onReserve} onDetail={onDetail} showScores={false} />)}
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
  const [mapPosition, setMapPosition] = useState([FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng]);
  const [geoError, setGeoError] = useState("");
  const [picked, setPicked] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  /** Remonte la position au parent ET l'affiche — les deux, jamais l'un sans l'autre. */
  const select = (lat, lng, label) => {
    setPicked({ lat, lng, label });
    onLocationSelect({ lat, lng });
  };

  const handleAutoLocation = () => {
    setGeoError("");
    setMode("auto");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => select(pos.coords.latitude, pos.coords.longitude, "Votre position actuelle"),
        () => setGeoError("Impossible d'obtenir la position. Veuillez utiliser une adresse."),
      );
    } else {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur.");
    }
  };

  /**
   * Interroge Nominatim, en privilégiant le Quartier latin.
   *
   * `viewbox` sans `bounded=1` : les résultats de la zone remontent en tête,
   * mais une adresse ailleurs reste trouvable. Restreindre durement
   * empêcherait de chercher hors zone — or l'application doit pouvoir
   * fonctionner ailleurs dès que d'autres zones seront relevées.
   */
  const queryNominatim = async (text, limit) => {
    const viewbox = "2.3380,48.8535,2.3560,48.8400"; // Quartier latin
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}` +
      `&viewbox=${viewbox}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    return res.json();
  };

  const shortLabel = (item) =>
    item.display_name?.split(",").slice(0, 3).join(",").trim() || address;

  const geocodeAddress = async () => {
    if (!address) return;
    try {
      const data = await queryNominatim(address, 1);
      if (data && data.length > 0) {
        setSuggestions([]);
        select(parseFloat(data[0].lat), parseFloat(data[0].lon), shortLabel(data[0]));
        setGeoError("");
      } else {
        setGeoError("Adresse introuvable.");
      }
    } catch {
      setGeoError("Erreur lors de la recherche.");
    }
  };

  // Suggestions au fil de la frappe. Nominatim est un service communautaire :
  // 400 ms de pause avant d'interroger, et jamais en dessous de 3 caractères.
  useEffect(() => {
    if (mode !== "address" || address.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await queryNominatim(address, 5);
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, mode]);

  // Composant pour capter les clics sur la carte Leaflet
  function MapEvents() {
    useMapEvents({
      click(e) {
        setMapPosition([e.latlng.lat, e.latlng.lng]);
        select(e.latlng.lat, e.latlng.lng, "Point choisi sur la carte");
      },
    });
    return null;
  }

  return (
    <div className="location-picker">
      {/* Confirmation explicite de la position retenue. Sans elle, aucun des
          trois modes ne donne le moindre retour : on clique, il ne se passe
          rien de visible, et on ne sait pas si la position a été prise en
          compte — ni laquelle sert réellement à la recherche. */}
      {picked && (
        <p className="location-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <CheckCircle2 size={14} color="var(--color-local, #2d6a4f)" />
          <span>
            Position retenue : <strong>{picked.label}</strong>{" "}
            <span style={{ opacity: 0.65 }}>
              ({picked.lat.toFixed(4)}, {picked.lng.toFixed(4)})
            </span>
          </span>
        </p>
      )}

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
          <p className="location-hint">{copy.locationAutoHint}</p>
          {geoError && <p className="error-text">{geoError}</p>}
        </div>
      )}

      {mode === "address" && (
        <div className="location-content">
          <div className="flex-row">
            <input
              type="text"
              placeholder="Ex : 15 rue de la Huchette, Paris"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && geocodeAddress()}
              className="input-address"
            />
            <button className="btn-secondary" onClick={geocodeAddress}>Chercher</button>
          </div>

          {suggestions.length > 0 && (
            <ul className="address-suggestions">
              {suggestions.map((s) => (
                <li key={s.place_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAddress(shortLabel(s));
                      setSuggestions([]);
                      setGeoError("");
                      select(parseFloat(s.lat), parseFloat(s.lon), shortLabel(s));
                    }}
                  >
                    <MapPin size={13} /> {shortLabel(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {geoError && <p className="error-text hint-text">{geoError}</p>}
        </div>
      )}

      {/* Accès direct aux lieux du Quartier latin.
          Saisir une adresse suppose de savoir laquelle est couverte : la base
          ne contient qu'une zone, et une adresse prise au hasard renvoie une
          liste vide. Ces raccourcis retirent cette devinette — utile pour la
          démonstration, utile aussi pour un visiteur qui ne connaît pas Paris. */}
      <div className="location-content" style={{ paddingTop: 4 }}>
        <p className="location-hint" style={{ marginBottom: 6 }}>
          <strong>{copy.locationDemoLabel}</strong> — {copy.locationDemoHint}
        </p>
        <div className="pills-row" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {demoPlaces.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`pill ${picked?.label === p.label ? "active" : ""}`}
              onClick={() => select(p.lat, p.lng, p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

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
        <h2 className="page-title">{copy.searchTitle}</h2>
        <p className="page-subtitle">{copy.searchSubtitle}</p>

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
          {copy.searchCta}
        </button>
      </div>
    </>
  );
}

// =========================================================================
// RESULTS PAGE
// =========================================================================
function ResultsPage({ criteria, onReserve, onDetail, onBack }) {
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
          <h2 className="page-title" style={{ marginBottom: 0 }}>{copy.resultsTitle}</h2>
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
              <RestaurantCard key={r.id} r={r} onReserve={onReserve} onDetail={onDetail} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// =========================================================================
// DETAIL PAGE
// =========================================================================
function DetailPage({ restaurant, onBack, onReserve }) {
  const horaires = restaurant.horaires || [];
  const reviews = restaurant.reviews || [];

  return (
    <>
      <header className="header">
        <img src="/localsignal-logo-header.png" alt="Local Signal" className="header-logo" />
      </header>
      <div className="detail-page">
        <button className="btn-back" onClick={onBack}>
          <ChevronLeft size={18} /> Retour
        </button>

        {/* La photo réelle du restaurant (D-025), et non plus un visuel tiré au
            hasard parmi cinq selon l'identifiant : montrer l'image d'un autre
            établissement est indéfendable dans un projet dont le sujet est
            l'authenticité. Faute de photo, le visuel de repli — neutre et
            assumé — vaut mieux qu'une illustration trompeuse. */}
        <div className="detail-hero">
          <img
            src={photoUrl(restaurant.id)}
            alt={restaurant.name}
            className="detail-hero-img"
            onError={(e) => {
              if (e.target.dataset.fallback) return;
              e.target.dataset.fallback = "1";
              e.target.src = "/localsignal-logo-header.png";
            }}
          />
          <div className="detail-hero-overlay">
            <h1 className="detail-name">{restaurant.name}</h1>
            {cuisineOf(restaurant) && (
              <div className="detail-type-badge">{cuisineOf(restaurant)}</div>
            )}
          </div>
        </div>

        <div className="detail-content">
          {/* Chaque encadré n'est rendu que si sa donnée existe. Les faits
              viennent d'OpenStreetMap : la cuisine et l'adresse y sont souvent
              présentes, la note et l'ambiance jamais, le prix presque jamais.
              Quatre cadres vides donnaient l'impression d'une fiche cassée. */}
          <div className="detail-info-grid">
            {restaurant.rating != null && (
              <div className="detail-info-card">
                <div className="detail-info-label"><Star size={14} /> Note</div>
                <div className="detail-info-value"><Stars rating={restaurant.rating} /></div>
              </div>
            )}
            {restaurant.price != null && (
              <div className="detail-info-card">
                <div className="detail-info-label"><Wallet size={14} /> Prix moyen</div>
                <div className="detail-info-value">{restaurant.price}€ / pers</div>
              </div>
            )}
            {cuisineOf(restaurant) && (
              <div className="detail-info-card">
                <div className="detail-info-label"><UtensilsCrossed size={14} /> Cuisine</div>
                <div className="detail-info-value">{cuisineOf(restaurant)}</div>
              </div>
            )}
            {restaurant.ambiance && (
              <div className="detail-info-card">
                <div className="detail-info-label"><Sparkles size={14} /> Ambiance</div>
                <div className="detail-info-value">{restaurant.ambiance}</div>
              </div>
            )}
            {restaurant.address && (
              <div className="detail-info-card">
                <div className="detail-info-label"><MapPin size={14} /> Adresse</div>
                <div className="detail-info-value" style={{ fontSize: "0.85rem" }}>{restaurant.address}</div>
              </div>
            )}
            {restaurant.opening_hours && (
              <div className="detail-info-card">
                <div className="detail-info-label"><Clock size={14} /> Horaires</div>
                <div className="detail-info-value" style={{ fontSize: "0.85rem" }}>{restaurant.opening_hours}</div>
              </div>
            )}
            {restaurant.scoring?.relevance?.distance_m != null && (
              <div className="detail-info-card">
                <div className="detail-info-label"><Navigation size={14} /> Distance</div>
                <div className="detail-info-value">
                  {restaurant.scoring.relevance.distance_m < 1000
                    ? `${restaurant.scoring.relevance.distance_m} m`
                    : `${(restaurant.scoring.relevance.distance_m / 1000).toFixed(1)} km`}
                </div>
              </div>
            )}
            {restaurant.phone && (
              <div className="detail-info-card">
                <div className="detail-info-label"><MessageSquare size={14} /> Téléphone</div>
                <div className="detail-info-value" style={{ fontSize: "0.85rem" }}>{restaurant.phone}</div>
              </div>
            )}
          </div>

          {restaurant.scoring && (
            <WhySection scoring={restaurant.scoring} />
          )}

          {horaires.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-section-title"><Clock size={16} /> Horaires d'ouverture</h3>
              <div className="detail-horaires">
                {horaires.map((h, i) => (
                  <div key={i} className="detail-horaire-slot">
                    <span className="horaire-label">{i === 0 ? "Service 1" : `Service ${i + 1}`}</span>
                    <span className="horaire-time">{h.start || h[0]} — {h.end || h[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {restaurant.dietary_options && restaurant.dietary_options.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-section-title"><Info size={16} /> Options alimentaires</h3>
              <div className="dietary-tags">
                {restaurant.dietary_options.map(tag => (
                  <span key={tag} className="diet-tag">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {reviews.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-section-title"><MessageSquare size={16} /> Avis clients ({reviews.length})</h3>
              <div className="detail-reviews">
                {reviews.map((rev, i) => (
                  <div key={i} className="review-card">
                    <div className="review-header">
                      <span className="review-stars">{"★".repeat(rev.stars)}{"☆".repeat(5 - rev.stars)}</span>
                      <span className="review-lang">{rev.lang?.toUpperCase()}</span>
                    </div>
                    <p className="review-text">"{rev.text}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {restaurant.reservation && (
            <button className="btn-confirm" onClick={() => onReserve(restaurant)} style={{ marginTop: "1.5rem", width: "100%" }}>
              <CalendarClock size={16} style={{ marginRight: 8 }} /> Réserver une table
            </button>
          )}
        </div>
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
  const [previousPage, setPreviousPage] = useState("results");

  const goToDetail = (r, from) => {
    setSelectedRestaurant(r);
    setPreviousPage(from || "results");
    setPage("detail");
  };

  if (page === "home") {
    return (
      <HomePage
        onStart={() => setPage("search")}
        onReserve={(r) => {
          setSelectedRestaurant(r);
          setPage("reservation");
        }}
        onDetail={(r) => goToDetail(r, "home")}
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
        onDetail={(r) => goToDetail(r, "results")}
      />
    );
  }

  if (page === "detail" && selectedRestaurant) {
    return (
      <DetailPage
        restaurant={selectedRestaurant}
        onBack={() => setPage(previousPage)}
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
        onBack={() => setPage(previousPage)}
      />
    );
  }

  return null;
}

export default App;
