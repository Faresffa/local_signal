// apps/web/src/pages/Detail.jsx
//
// Fiche restaurant : visuel à gauche, informations et explication à droite.
//
// C'est le seul endroit où le détail du calcul est accessible, et encore, il
// est replié (D-009).

import { useEffect, useState } from "react";
import {
  ArrowLeft, Clock, ForkKnife, GlobeSimple, MapPin, Phone,
} from "@phosphor-icons/react";

import { fetchRestaurant } from "../api";
import CartePhotos from "../components/CartePhotos";
import PhotoRestaurant from "../components/PhotoRestaurant";
import DetailCalcul from "../components/DetailCalcul";
import WhyPanel from "../components/WhyPanel";
import { CardSkeleton, ErrorState } from "../components/States";
import { distance, hours, verdict } from "../lib/display";

const FACT_ICON = { display: "inline", verticalAlign: "-2px", marginRight: 6 };

export default function Detail({ restaurant, onBack, onReserve }) {
  const [full, setFull] = useState(restaurant);
  const [error, setError] = useState(null);

  // La liste ne porte pas tout : la fiche recharge les champs complets,
  // en gardant l'objet de la liste comme affichage immédiat.
  useEffect(() => {
    let cancelled = false;
    fetchRestaurant(restaurant.id)
      .then((data) => { if (!cancelled) setFull({ ...restaurant, ...data }); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [restaurant]);

  if (error) return <ErrorState message={error} onRetry={onBack} />;
  if (!full) return <CardSkeleton />;

  const v = verdict(full.local_signal, full.confidence);
  const openingHours = hours(full.opening_hours);
  const dist = distance(full.distance_m);

  // On stocke des éléments, pas des types de composants : une balise JSX dont
  // le type est calculé pendant le rendu casse la réconciliation de React.
  const puce = { size: 14, weight: "light", style: FACT_ICON };

  // Les URL de carte arrivent en JSON depuis la base : une chaine, pas un
  // tableau. On tolere les deux, l'API ayant deja change de forme une fois.
  let photosCarte = [];
  try {
    const brut = full.menu_photo_urls;
    photosCarte = Array.isArray(brut) ? brut : JSON.parse(brut || "[]");
  } catch {
    photosCarte = [];
  }

  const facts = [
    full.address && { icon: <MapPin {...puce} />, label: "Adresse", value: full.address },
    openingHours && { icon: <Clock {...puce} />, label: "Horaires", value: openingHours },
    full.phone && { icon: <Phone {...puce} />, label: "Téléphone", value: full.phone },
    full.website && { icon: <GlobeSimple {...puce} />, label: "Site", value: full.website },
  ].filter(Boolean);

  return (
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour aux résultats
      </button>

      <div className="detail">
        <div className="detail__media">
          <PhotoRestaurant
            id={full.id}
            cuisine={full.cuisine}
            photoUrl={full.photo_url}
            nom={full.name}
            size={92}
          />
        </div>

        <div>
          <span className={`verdict verdict--${v.tone}`}>{v.label}</span>

          <h1 className="detail__title" style={{ marginTop: 12 }}>{full.name}</h1>

          <p className="detail__meta">
            <ForkKnife
              size={15}
              weight="light"
              style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
            />
            {full.cuisine_label || "Restaurant"}
            {dist && ` · à ${dist}`}
          </p>

          {facts.length > 0 && (
            <div className="factlist">
              {facts.map(({ icon, label, value }) => (
                <div className="fact" key={label}>
                  <span className="fact__label">
                    {icon}
                    {label}
                  </span>
                  <span className="fact__value">
                    {label === "Site" ? (
                      <a href={value} target="_blank" rel="noreferrer noopener">
                        {value.replace(/^https?:\/\//, "")}
                      </a>
                    ) : value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <WhyPanel scoring={full} />

          <CartePhotos urls={photosCarte} motif={full.photos_motif} />

          <DetailCalcul detail={full.detail_calcul} />

          <button
            className="btn btn--primary btn--lg btn--block"
            style={{ marginTop: 24 }}
            onClick={() => onReserve(full)}
          >
            Réserver une table
          </button>
        </div>
      </div>
    </>
  );
}
