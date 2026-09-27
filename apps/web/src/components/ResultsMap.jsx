// apps/web/src/components/ResultsMap.jsx
//
// Carte interactive de Discover (D-066, remplace la vignette Leaflet
// de LS-refonte).
//
// MAPLIBRE + OPENFREEMAP « BRIGHT ». Carte vectorielle (nette à tout zoom,
// fluide), sur les données OpenStreetMap, gratuite sans clé ni quota, usage
// commercial autorisé — là où Google Maps et Mapbox demandent un compte, une
// clé et deviennent payants au-delà d'un palier (comparatif dans D-066).
//
// CE QUE LA CARTE REDIT, ET RIEN DE PLUS. Chaque repère porte le RANG du
// restaurant dans la liste et la couleur de son verdict : la carte montre où
// sont les restaurants que la liste classe, elle n'ajoute pas une seconde
// information à interpréter.
//
// SYNCHRONISÉE AVEC LA LISTE : survoler une carte de résultat grossit son
// repère ; cliquer un repère ouvre une bulle (nom, score, distance, « Voir la
// fiche ») et signale la sélection à Discover, qui fait défiler la liste
// jusqu'au restaurant.

import { useEffect, useRef } from "react";

import { distance, scoreSur10, verdict } from "../lib/display";

const STYLE = "https://tiles.openfreemap.org/styles/bright";

/** Lit une couleur de jeton CSS déjà posée sur la page — pas de hex dupliqué ici. */
function couleurJeton(nom) {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/**
 * Contenu de la bulle, construit en nœuds DOM et `textContent` : un nom de
 * restaurant n'est jamais interprété comme du HTML.
 */
function contenuBulle(r, onOpen) {
  const racine = document.createElement("div");
  racine.className = "resultsmap__bulle";

  const nom = document.createElement("strong");
  nom.textContent = r.name;
  racine.appendChild(nom);

  const meta = document.createElement("span");
  const score = scoreSur10(r.local_signal);
  const dist = distance(r.distance_m);
  meta.textContent = [
    verdict(r.local_signal, r.confidence).label + (score ? ` · ${score}/10` : ""),
    dist,
  ].filter(Boolean).join(" · ");
  racine.appendChild(meta);

  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "resultsmap__voir";
  bouton.textContent = "Voir la fiche →";
  bouton.addEventListener("click", () => onOpen?.(r));
  racine.appendChild(bouton);

  return racine;
}

export default function ResultsMap({ restaurants, origine, survol, selection, onSelect, onOpen }) {
  const conteneur = useRef(null);
  const carteRef = useRef(null);
  const libRef = useRef(null);
  // id → { el, marker }, pour mettre à jour la surbrillance sans tout recréer.
  const reperes = useRef(new Map());
  // Dernier cadrage calculé, et si l'utilisateur a bougé la carte depuis :
  // tant qu'il n'y a pas touché, un redimensionnement (colonne qui s'ouvre,
  // fenêtre élargie) recadre sur les résultats au lieu de garder un zoom
  // calculé pour une carte encore cachée.
  const cadrage = useRef(null);
  const bougee = useRef(false);
  // Vrai dès le premier « load » du style. `carte.loaded()` ne convient pas :
  // il repasse à faux à chaque chargement de tuiles, et les repères
  // attendaient alors un évènement déjà passé — carte sans aucun repère.
  const pret = useRef(false);
  // Les rappels changent à chaque rendu de Discover : on garde la dernière
  // version dans une ref plutôt que de recréer les repères pour si peu.
  const rappels = useRef({ onSelect, onOpen });
  useEffect(() => { rappels.current = { onSelect, onOpen }; });

  // --- La carte : créée une fois, détruite au démontage ------------------
  useEffect(() => {
    let annule = false;
    const reps = reperes.current;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (annule || !conteneur.current) return;
      libRef.current = maplibregl;

      const carte = new maplibregl.Map({
        container: conteneur.current,
        style: STYLE,
        center: origine ? [origine.lng, origine.lat] : [2.3469, 48.8496],
        zoom: 14.5,
        attributionControl: { compact: true },
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      carteRef.current = carte;
      const marquerBougee = (e) => { if (e.originalEvent) bougee.current = true; };
      carte.on("dragstart", marquerBougee);
      carte.on("zoomstart", marquerBougee);
      carte.on("resize", () => {
        if (!bougee.current && cadrage.current) {
          carte.fitBounds(cadrage.current, { padding: 60, maxZoom: 16, duration: 0 });
        }
      });
      // Déclenche le placement des repères maintenant que la carte existe.
      carte.once("load", () => {
        pret.current = true;
        // Crédits repliés derrière le « ⓘ » : MapLibre les déplie au
        // chargement. Ils restent obligatoires (ODbL pour OpenStreetMap,
        // CC-BY pour OpenMapTiles) — repliés, jamais supprimés.
        conteneur.current
          ?.querySelector(".maplibregl-ctrl-attrib")
          ?.classList.remove("maplibregl-compact-show");
      });
    })();

    return () => {
      annule = true;
      carteRef.current?.remove();
      carteRef.current = null;
      pret.current = false;
      reps.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Repères : recréés à chaque nouvelle liste --------------------------
  useEffect(() => {
    let annule = false;

    function placer() {
      const carte = carteRef.current;
      const maplibregl = libRef.current;
      if (annule || !carte || !maplibregl) return;

      reperes.current.forEach(({ marker }) => marker.remove());
      reperes.current.clear();

      const couleurs = {
        local: couleurJeton("--color-local"),
        mixed: couleurJeton("--color-mixed"),
        tourist: couleurJeton("--color-tourist"),
        unknown: couleurJeton("--color-text-faint"),
      };
      const bornes = new maplibregl.LngLatBounds();

      if (origine) {
        const moi = document.createElement("div");
        moi.className = "resultsmap__moi";
        moi.setAttribute("aria-hidden", "true");
        const marker = new maplibregl.Marker({ element: moi })
          .setLngLat([origine.lng, origine.lat])
          .addTo(carte);
        reperes.current.set("__origine", { el: moi, marker });
        bornes.extend([origine.lng, origine.lat]);
      }

      restaurants.forEach((r, i) => {
        if (r.lat == null || r.lng == null) return;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "resultsmap__repere";
        el.textContent = String(i + 1);
        el.style.background = couleurs[verdict(r.local_signal, r.confidence).tone] || couleurs.unknown;
        el.setAttribute("aria-label", `${i + 1}. ${r.name}`);

        const bulle = new maplibregl.Popup({ offset: 18, maxWidth: "240px" })
          .setDOMContent(contenuBulle(r, (x) => rappels.current.onOpen?.(x)));
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([r.lng, r.lat])
          .setPopup(bulle)
          .addTo(carte);
        el.addEventListener("click", () => rappels.current.onSelect?.(r.id));

        reperes.current.set(r.id, { el, marker });
        bornes.extend([r.lng, r.lat]);
      });

      if (!bornes.isEmpty()) {
        cadrage.current = bornes;
        bougee.current = false;
        carte.resize();
        carte.fitBounds(bornes, { padding: 60, maxZoom: 16, duration: 0 });
      }
    }

    // La carte peut être encore en cours d'import ou de chargement de style :
    // on attend qu'elle soit prête, sans jamais dépendre d'un évènement qui
    // aurait déjà eu lieu.
    const t = setInterval(() => {
      if (carteRef.current && pret.current) {
        clearInterval(t);
        placer();
      }
    }, 50);
    return () => { annule = true; clearInterval(t); };
  }, [restaurants, origine?.lat, origine?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Surbrillance : survol d'une carte de résultat, ou sélection ---------
  useEffect(() => {
    reperes.current.forEach(({ el }, id) => {
      el.classList.toggle("is-survol", id === survol);
      el.classList.toggle("is-selection", id === selection);
    });
  }, [survol, selection, restaurants]);

  // Une sélection venue de la liste recentre la carte et ouvre la bulle.
  useEffect(() => {
    const carte = carteRef.current;
    const rep = selection && reperes.current.get(selection);
    if (!carte || !rep) return;
    reperes.current.forEach(({ marker }, id) => {
      if (id !== selection && marker.getPopup()?.isOpen()) marker.togglePopup();
    });
    if (!rep.marker.getPopup().isOpen()) rep.marker.togglePopup();
    carte.easeTo({ center: rep.marker.getLngLat(), duration: 400 });
  }, [selection]);

  return <div className="resultsmap" ref={conteneur} />;
}
