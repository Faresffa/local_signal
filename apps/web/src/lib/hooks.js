// apps/web/src/lib/hooks.js

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Révèle un élément quand il entre dans le viewport.
 *
 * IntersectionObserver et non un écouteur de scroll : un écouteur se déclenche
 * à chaque image et fait retomber le rendu à chaque frame.
 *
 * Se désactive si l'utilisateur a demandé un mouvement réduit : dans ce cas
 * l'élément est visible immédiatement plutôt qu'animé.
 */
export function useReveal(delay = 0) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("is-visible");
      return;
    }

    el.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return ref;
}

/**
 * Thème clair ou sombre.
 *
 * Trois états : `system` suit la préférence du navigateur, `light` et `dark`
 * la forcent. Le choix est mémorisé, le défaut suit le système.
 */
export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("ls-theme") || "system",
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
      localStorage.removeItem("ls-theme");
    } else {
      root.setAttribute("data-theme", theme);
      localStorage.setItem("ls-theme", theme);
    }
  }, [theme]);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggle = useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark]);

  return { theme, isDark, toggle };
}

/**
 * Position de l'utilisateur.
 *
 * `lat` et `lng` sont obligatoires côté API : pas de coordonnées par défaut,
 * le projet doit fonctionner dans n'importe quelle ville. Tant que la
 * géolocalisation n'a pas répondu, on retourne `null` et l'appelant attend.
 *
 * En cas de refus, on se rabat sur la zone d'évaluation plutôt que de bloquer
 * l'écran sur un message d'erreur.
 */
const ZONE_PAR_DEFAUT = { lat: 48.8462, lng: 2.3456, fallback: true };

export function useGeolocation() {
  // Navigateur sans géolocalisation : on part directement sur la zone par
  // défaut plutôt que de poser cet état depuis l'effet, ce qui déclencherait
  // un rendu supplémentaire dès le montage.
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const [position, setPosition] = useState(supported ? null : ZONE_PAR_DEFAUT);
  const [denied, setDenied] = useState(!supported);

  useEffect(() => {
    if (!supported) return undefined;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        if (cancelled) return;
        setPosition(ZONE_PAR_DEFAUT);
        setDenied(true);
      },
      { timeout: 8000, maximumAge: 300000 },
    );

    return () => { cancelled = true; };
  }, [supported]);

  return { position, denied };
}
