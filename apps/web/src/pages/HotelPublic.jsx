// apps/web/src/pages/HotelPublic.jsx
//
// Page publique « Où manger autour de l'hôtel » (D-067), ouverte depuis le QR
// code posé en chambre : /hotel/<slug>.
//
// LE CLASSEMENT EST CELUI DE TOUT LE MONDE. Même appel que la recherche,
// centré sur l'hôtel : l'hôtel prête sa couleur et son mot d'accueil, il ne
// choisit ni n'ordonne les restaurants (règle de neutralité).

import { useEffect, useState } from "react";

import { fetchPageHotel, fetchRestaurants } from "../api";
import RestaurantCard from "../components/RestaurantCard";
import { ErrorState, ResultsSkeleton } from "../components/States";

// Rayon de la page : à pied depuis l'hôtel. Paramètre d'affichage, pas de calibration.
const RAYON_HOTEL_M = 1000;

export default function HotelPublic({ slug, onOpen }) {
  const [hotel, setHotel] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [statut, setStatut] = useState("loading");
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    fetchPageHotel(slug)
      .then((h) => {
        if (annule) return null;
        setHotel(h);
        return fetchRestaurants({ lat: h.lat, lng: h.lng, radius: RAYON_HOTEL_M, limit: 12 });
      })
      .then((data) => {
        if (annule || !data) return;
        setRestaurants(data.restaurants ?? []);
        setStatut("ready");
      })
      .catch((e) => {
        if (annule) return;
        setErreur(e.status === 404 ? "Cette page n'existe pas ou n'est plus active." : e.message);
        setStatut("error");
      });
    return () => { annule = true; };
  }, [slug]);

  if (statut === "error") return <ErrorState message={erreur} />;

  return (
    <>
      <header
        className="hotelpage__entete"
        style={{ "--hotel-couleur": hotel?.couleur || "var(--color-brand)" }}
      >
        <p className="hotelpage__surtitre">Où manger autour de</p>
        <h1 className="hotelpage__nom">{hotel?.nom ?? "…"}</h1>
        {hotel?.message && <p className="hotelpage__message">{hotel.message}</p>}
        <p className="hotelpage__note">
          Classés par Local Signal : les restaurants où mangent les habitants,
          à moins d'un kilomètre à pied. Ni l'hôtel ni les restaurants ne
          paient pour leur place.
        </p>
      </header>

      {statut === "loading" && <ResultsSkeleton />}
      {statut === "ready" && (
        <div className="grid">
          {restaurants.map((r, i) => (
            <RestaurantCard key={r.id} restaurant={r} index={i} onOpen={onOpen} user={null} />
          ))}
        </div>
      )}
    </>
  );
}
