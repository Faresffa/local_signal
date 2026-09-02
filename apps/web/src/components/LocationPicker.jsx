// apps/web/src/components/LocationPicker.jsx
//
// Choix du point de départ. Trois voies, parce qu'aucune ne suffit seule :
//   1. la position du navigateur — inutile si l'utilisateur prépare un voyage,
//   2. une adresse ou un quartier saisi — inutile s'il ne sait pas nommer
//      l'endroit qu'il vise,
//   3. un point posé sur la carte — la seule voie qui ne demande ni permission
//      ni vocabulaire.
//
// PORTÉE DE VALIDATION ≠ PORTÉE D'USAGE. Le mémoire évalue le calcul sur un
// arrondissement, avec une vérité terrain. Le produit, lui, doit accepter
// n'importe quel point du globe. C'est pourquoi le géocodage n'est pas borné
// à une zone : la couverture des données est une limite de la BASE, pas de
// l'interface, et c'est aux résultats de le dire — pas au champ de recherche
// de l'interdire.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, MapPin, MapTrifold, X } from "@phosphor-icons/react";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const REVERSE = "https://nominatim.openstreetmap.org/reverse";

/** Trois premiers segments d'une adresse Nominatim ; le reste est du bruit. */
function libelleCourt(item) {
  return (item.display_name || "").split(",").slice(0, 3).join(",").trim();
}

/**
 * Carte de sélection, montée à la demande.
 *
 * Leaflet est manipulé directement plutôt que via un adaptateur React : la
 * carte est un objet impératif à cycle de vie propre, et l'envelopper
 * n'apporterait qu'une couche de plus à synchroniser.
 */
function CarteSelection({ centre, onValider, onFermer }) {
  const conteneur = useRef(null);
  const [point, setPoint] = useState(centre);

  useEffect(() => {
    let carte;
    let annule = false;

    // Import différé : Leaflet et sa feuille de style ne pèsent sur le
    // chargement initial que si l'utilisateur ouvre réellement la carte.
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (annule || !conteneur.current) return;

      carte = L.map(conteneur.current, { attributionControl: true })
        .setView([centre.lat, centre.lng], 14);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(carte);

      // Marqueur dessiné en CSS plutôt qu'en image : les icônes par défaut de
      // Leaflet sont servies par des URL relatives que le bundler casse.
      const icone = L.divIcon({
        className: "map__pin",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marqueur = L.marker([centre.lat, centre.lng], {
        icon: icone,
        draggable: true,
      }).addTo(carte);

      const poser = ({ lat, lng }) => {
        marqueur.setLatLng([lat, lng]);
        setPoint({ lat, lng });
      };

      carte.on("click", (e) => poser(e.latlng));
      marqueur.on("dragend", () => poser(marqueur.getLatLng()));

      // Leaflet mesure son conteneur au montage ; dans un dialogue qui vient
      // d'apparaître, cette mesure est fausse d'une frame.
      setTimeout(() => carte.invalidateSize(), 60);
    })();

    return () => { annule = true; if (carte) carte.remove(); };
  }, [centre]);

  async function valider() {
    // Nom lisible du point posé. S'il est introuvable, on garde les
    // coordonnées : un point sans nom reste un point valide.
    let label = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    try {
      const res = await fetch(
        `${REVERSE}?format=json&zoom=14&lat=${point.lat}&lon=${point.lng}`,
      );
      const data = await res.json();
      if (data?.display_name) label = libelleCourt(data);
    } catch {
      // Géocodage inverse indisponible : les coordonnées font l'affaire.
    }
    onValider({ ...point, label });
  }

  // Rendu dans <body> plutôt qu'en place. `position: fixed` se cale sur le
  // premier ancêtre transformé, pas sur la fenêtre — et l'animation d'entrée
  // laisse un `transform` permanent sur la barre de recherche. Sans portail,
  // le dialogue s'ancre dans la barre : décalé, et rogné par elle.
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label="Choisir un point sur la carte">
      <div className="modal__panel">
        <div className="modal__head">
          <h2 className="modal__title">Choisissez un point</h2>
          <button className="modal__close" onClick={onFermer} aria-label="Fermer la carte">
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="modal__hint">
          Cliquez n'importe où, ou déplacez le repère.
        </p>

        <div className="map" ref={conteneur} />

        <div className="modal__foot">
          <span className="modal__coords">
            {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
          </span>
          <button className="btn btn--primary" onClick={valider}>
            Chercher ici
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function LocationPicker({ value, onChange, onUseGps }) {
  const [saisie, setSaisie] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);

  // Suggestions au fil de la frappe, avec pause : Nominatim est un service
  // communautaire, on ne l'interroge pas à chaque caractère.
  const requete = saisie.trim();
  const cherche = requete.length >= 3;

  useEffect(() => {
    if (!cherche) return undefined;

    let annule = false;
    const minuteur = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}?format=json&limit=6&q=${encodeURIComponent(requete)}`,
        );
        const data = await res.json();
        if (!annule) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!annule) setSuggestions([]);
      }
    }, 400);

    return () => { annule = true; clearTimeout(minuteur); };
  }, [requete, cherche]);

  // Les suggestions périmées sont écartées au rendu plutôt qu'effacées depuis
  // l'effet : poser un état de façon synchrone dans un effet déclenche une
  // cascade de rendus.
  const visibles = cherche ? suggestions : [];

  function choisir(lieu) {
    onChange(lieu);
    setSaisie("");
    setSuggestions([]);
    setOuvert(false);
  }

  return (
    <div className="picker">
      <label className="field__label" htmlFor="lieu">Où</label>

      <input
        id="lieu"
        className="field__control"
        placeholder="Une ville, un quartier, une adresse"
        value={ouvert ? saisie : value?.label ?? ""}
        onChange={(e) => setSaisie(e.target.value)}
        onFocus={() => { setOuvert(true); setSaisie(""); }}
        onBlur={() => setTimeout(() => setOuvert(false), 160)}
        autoComplete="off"
        aria-expanded={visibles.length > 0}
      />

      {ouvert && (
        <div className="picker__menu">
          <button className="picker__action" onMouseDown={(e) => e.preventDefault()} onClick={onUseGps}>
            <Crosshair size={16} weight="bold" />
            Autour de moi
          </button>
          <button
            className="picker__action"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setCarteOuverte(true); setOuvert(false); }}
          >
            <MapTrifold size={16} weight="bold" />
            Choisir sur la carte
          </button>

          {visibles.map((sug) => (
            <button
              key={sug.place_id}
              className="picker__option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                choisir({
                  lat: parseFloat(sug.lat),
                  lng: parseFloat(sug.lon),
                  label: libelleCourt(sug),
                })
              }
            >
              <MapPin size={15} />
              <span>{libelleCourt(sug)}</span>
            </button>
          ))}

          {cherche && visibles.length === 0 && (
            <p className="picker__empty">Aucun lieu de ce nom.</p>
          )}
        </div>
      )}

      {carteOuverte && (
        <CarteSelection
          centre={value ?? { lat: 48.8462, lng: 2.3456 }}
          onValider={(lieu) => { choisir(lieu); setCarteOuverte(false); }}
          onFermer={() => setCarteOuverte(false)}
        />
      )}
    </div>
  );
}
