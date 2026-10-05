// apps/web/src/pages/Detail.jsx
//
// Fiche restaurant : visuel à gauche, informations et explication à droite.
//
// Le score chiffré (verdict + X/10) est visible d'emblée depuis D-050
// (supersède D-009). Ce qui reste replié — et le sera toujours — c'est le
// détail indicateur par indicateur (`DetailCalcul`, LS-16) : la différence
// entre un chiffre qu'on regarde et un tableau de bord qu'on doit
// interpréter, la limite que D-009 posait, tient encore pour ce panneau-là.

import { useEffect, useState } from "react";
import {
  ArrowLeft, Clock, ForkKnife, GlobeSimple, Heart, MapPin, Phone,
} from "@phosphor-icons/react";

import { fetchRestaurant } from "../api";
import AjouterCarte from "../components/AjouterCarte";
import CartePhotos from "../components/CartePhotos";
import PhotoRestaurant from "../components/PhotoRestaurant";
import DetailCalcul from "../components/DetailCalcul";
import Verdict from "../components/Verdict";
import WhyPanel from "../components/WhyPanel";
import { CardSkeleton, ErrorState } from "../components/States";
import { useFavori } from "../lib/hooks";
import { distance, hours } from "../lib/display";

const FACT_ICON = { display: "inline", verticalAlign: "-2px", marginRight: 6 };

export default function Detail({
  restaurant, onBack, onReserve, user, onSeConnecter,
}) {
  const [full, setFull] = useState(restaurant);
  const [error, setError] = useState(null);

  // Favoris ouverts à tout compte voyageur (D-067) ; les comptes pro n'en ont pas.
  const voyageur = Boolean(user) && !["restaurateur", "hotel"].includes(user.role);
  const { favori, toggle: toggleFavori } = useFavori(
    full?.id, full?.favori, voyageur, onSeConnecter,
  );

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
  // Mêmes URL Google expirées que pour la photo principale (voir
  // PhotoRestaurant.jsx) : les afficher donnerait une galerie d'images cassées.
  photosCarte = photosCarte.filter((u) => typeof u === "string" && !/googleusercontent\.com/.test(u));

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
            photoKey={full.photo_key}
            credit={full.photo_credit}
          photoGoogle={full.photo_google}
            nom={full.name}
            size={92}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Verdict localSignal={full.local_signal} confidence={full.confidence} />
            {full.partenaire && (
              <span
                className="card__partenaire card__partenaire--detail"
                title="Restaurant abonné à une offre Local Signal. Son score et son rang n'en dépendent pas."
              >
                Partenaire
              </span>
            )}

            <button
              type="button"
              className={`card__favori card__favori--detail${favori ? " is-favori" : ""}`}
              onClick={toggleFavori}
              aria-pressed={favori}
              aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
              title={
                !user
                  ? "Connectez-vous pour ajouter des favoris"
                  : (favori ? "Retirer des favoris" : "Ajouter aux favoris")
              }
            >
              <Heart size={16} weight={favori ? "fill" : "regular"} />
            </button>
          </div>

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

          {/* LE SEUL GESTE DE CONTRIBUTION : ajouter une carte, celui qui
              construit l'actif du projet (§3). Les avis utilisateurs ont été
              retirés (D-063). */}
          <AjouterCarte
            restaurantId={full.id}
            // Une carte lue change le signal menu : on recharge la fiche
            // plutôt que de laisser un score périmé à l'écran.
            onLue={() => {
              fetchRestaurant(full.id)
                .then((d) => setFull((f) => ({ ...f, ...d })))
                .catch(() => {});
            }}
          />
        </div>
      </div>
    </>
  );
}
