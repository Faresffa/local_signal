// apps/web/src/components/ResultsMap.jsx
//
// Carte de la colonne latérale de Discover (LS-refonte).
//
// Lecture seule, contrairement à la carte de LocationPicker qui pose un point.
// Chaque repère reprend la couleur du verdict (D-009) : la carte redit ce que
// la liste dit déjà, elle n'ajoute pas une information supplémentaire à
// interpréter.

import { useEffect, useRef } from "react";

import { verdict } from "../lib/display";

/** Lit une couleur de jeton CSS déjà posée sur la page — pas de hex dupliqué ici. */
function couleurJeton(nom) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(nom)
    .trim();
}

export default function ResultsMap({ restaurants, origine }) {
  const conteneur = useRef(null);

  useEffect(() => {
    if (!conteneur.current || !origine) return undefined;

    let carte;
    let annule = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (annule || !conteneur.current) return;

      carte = L.map(conteneur.current, {
        attributionControl: true,
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([origine.lat, origine.lng], 14);

      // CARTO Voyager, essayé pour un rendu plus doux, exige maintenant une
      // clé sur ce sous-domaine (tuiles marquées "APIKEY REQUIRED" en
      // production — repéré par l'utilisateur). Retour aux tuiles OSM
      // officielles : moins raffinées, mais garanties sans clé, sans quota.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(carte);

      const couleurs = {
        local: couleurJeton("--color-local"),
        mixed: couleurJeton("--color-mixed"),
        tourist: couleurJeton("--color-tourist"),
        unknown: couleurJeton("--color-text-faint"),
      };

      const points = [[origine.lat, origine.lng]];

      restaurants
        .filter((r) => r.lat != null && r.lng != null)
        .forEach((r) => {
          const v = verdict(r.local_signal, r.confidence);
          const marqueur = L.circleMarker([r.lat, r.lng], {
            radius: 6,
            color: "#fff",
            weight: 1.5,
            fillColor: couleurs[v.tone] || couleurs.unknown,
            fillOpacity: 0.95,
          }).addTo(carte);
          // Le nom seul dans une infobulle : pas de HTML libre, on ne veut
          // pas qu'un nom de restaurant contenant des caractères spéciaux
          // puisse casser la mise en page ou injecter du balisage.
          marqueur.bindTooltip(r.name, { direction: "top", offset: [0, -6] });
          points.push([r.lat, r.lng]);
        });

      if (points.length > 1) {
        carte.fitBounds(points, { padding: [24, 24], maxZoom: 15 });
      }

      setTimeout(() => carte.invalidateSize(), 60);
    })();

    return () => {
      annule = true;
      if (carte) carte.remove();
    };
    // Recréée à chaque nouvelle recherche plutôt que mise à jour incrémentale :
    // la liste change en bloc (nouveau lieu, nouveau rayon), jamais restaurant
    // par restaurant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origine?.lat, origine?.lng, restaurants]);

  return <div className="discover__mapbox" ref={conteneur} aria-hidden="true" />;
}
