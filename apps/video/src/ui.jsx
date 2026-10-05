// Briques visuelles partagées par toutes les scènes de la vidéo.
// Couleurs et typographies reprises de packages/shared/tokens.js et de
// apps/web/src/index.css : la vidéo doit ressembler à l'application.
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadOutfit } from "@remotion/google-fonts/Outfit";
import { loadFont as loadInstrument } from "@remotion/google-fonts/InstrumentSans";

export const { fontFamily: TITLE } = loadOutfit("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin", "latin-ext"] });
export const { fontFamily: BODY } = loadInstrument("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });

export const C = {
  bg: "#fffbf3",
  surface: "#ffffff",
  sunken: "#f3ece0",
  border: "#e8e0d3",
  text: "#1c1a17",
  muted: "#534e48",
  faint: "#716a60",
  brand: "#c1121f",
  brandDark: "#8d0c17",
  brandSoft: "#fdecec",
  local: "#2d6a4f",
  localBright: "#168a5a",
  localSoft: "#e7f2ec",
  mixed: "#a8760a",
  mixedSoft: "#fdf3e0",
};

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Ressort 0 → 1 démarrant à `delay` images. */
export function useSpring(delay = 0, config = { damping: 200 }, durationInFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config, durationInFrames });
}

/** Interpolation bornée avec easing doux. */
export function useLerp(from, to, range, easing = EASE) {
  const frame = useCurrentFrame();
  return interpolate(frame, range, [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** Fond crème + trame de couverts qui dérive lentement + halo rouge. */
export function Background({ glow = true, dark = false }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: dark ? C.text : C.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile("motif-couverts.svg")})`,
          backgroundSize: "300px 300px",
          backgroundPosition: `${frame * 0.25}px ${frame * 0.15}px`,
          opacity: dark ? 0.06 : 0.5,
          filter: dark ? "invert(1)" : undefined,
        }}
      />
      {glow && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(900px 600px at ${30 + Math.sin(frame / 90) * 8}% ${20 + Math.cos(frame / 110) * 6}%, rgba(193,18,31,${dark ? 0.35 : 0.09}), transparent 70%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

/**
 * Titre révélé mot par mot. Les mots entourés de *étoiles* passent en rouge.
 */
export function WordReveal({ text, delay = 0, stagger = 3, size = 96, color = C.text, weight = 700, align = "center", style, lineHeight = 1.08, accent = C.brand }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  let accentOn = false;
  return (
    <div style={{ fontFamily: TITLE, fontSize: size, fontWeight: weight, color, lineHeight, letterSpacing: "-0.03em", textAlign: align, ...style }}>
      {words.map((w, i) => {
        let word = w;
        if (word.startsWith("*")) { accentOn = true; word = word.slice(1); }
        const isAccent = accentOn;
        if (word.endsWith("*")) { accentOn = false; word = word.slice(0, -1); }
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, stiffness: 140, mass: 0.7 } });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - Math.min(s, 1)) * 110}%)`,
                opacity: Math.min(1, s * 1.5),
                color: isAccent ? accent : undefined,
              }}
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Texte qui apparaît en fondu + montée. */
export function FadeUp({ children, delay = 0, distance = 30, style }) {
  const s = useSpring(delay, { damping: 200 }, 24);
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * distance}px)`, ...style }}>{children}</div>
  );
}

/** Sortie de scène : fondu + léger recul sur les `n` dernières images. */
export function useExit(duration, n = 12) {
  const frame = useCurrentFrame();
  return interpolate(frame, [duration - n, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Pastille de verdict, identique à components/Verdict.jsx. */
export function VerdictPill({ label = "Profil local", score = "8,7/10", scale = 1, kind = "local", style }) {
  const bg = kind === "local" ? C.localSoft : C.mixedSoft;
  const fg = kind === "local" ? C.local : C.mixed;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12 * scale,
        padding: `${10 * scale}px ${22 * scale}px`,
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: TITLE,
        fontWeight: 600,
        fontSize: 30 * scale,
        boxShadow: "0 10px 30px rgba(28,26,23,0.10)",
        ...style,
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 800 }}>{score}</span>
    </div>
  );
}

/** Étiquette d'annotation qui « pop » avec un point pulsant. */
export function Callout({ children, delay = 0, x, y, anchor = "left", dark = false, size = 30 }) {
  const frame = useCurrentFrame();
  const s = useSpring(delay, { damping: 14, stiffness: 160 });
  const pulse = 1 + 0.25 * Math.sin((frame - delay) / 6);
  if (frame < delay) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(${anchor === "right" ? "-100%" : anchor === "center" ? "-50%" : "0"}, -50%) scale(${0.6 + 0.4 * s})`,
        transformOrigin: anchor === "right" ? "right center" : "left center",
        opacity: Math.min(1, s * 1.4),
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 26px",
        background: dark ? C.text : C.surface,
        color: dark ? "#fff" : C.text,
        borderRadius: 18,
        boxShadow: "0 18px 50px rgba(28,26,23,0.22)",
        fontFamily: TITLE,
        fontWeight: 600,
        fontSize: size,
        whiteSpace: "nowrap",
        zIndex: 20,
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 99, background: C.brand, transform: `scale(${pulse})`, boxShadow: `0 0 0 6px ${C.brandSoft}` }} />
      {children}
    </div>
  );
}

/** Petite étiquette de chapitre en haut à gauche. */
export function Chapter({ n, label, delay = 0 }) {
  const s = useSpring(delay);
  return (
    <div style={{ position: "absolute", left: 90, top: 64, display: "flex", alignItems: "center", gap: 16, opacity: s, transform: `translateX(${(1 - s) * -30}px)`, fontFamily: BODY, fontSize: 24, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      <span style={{ color: C.brand, fontFamily: TITLE, fontWeight: 800 }}>{n}</span>
      <span style={{ width: 40, height: 2, background: C.brand }} />
      {label}
    </div>
  );
}

/**
 * Capture d'écran filmée par une « caméra » : `keys` est une liste
 * {at, cx, cy, z} en coordonnées de l'image ; la caméra interpole entre elles.
 */
export function useCamera(keys) {
  const frame = useCurrentFrame();
  const ats = keys.map((k) => k.at);
  const pick = (prop) =>
    keys.length === 1
      ? keys[0][prop]
      : interpolate(frame, ats, keys.map((k) => k[prop]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.65, 0, 0.35, 1) });
  return { cx: pick("cx"), cy: pick("cy"), z: pick("z") };
}

export function CameraShot({ src, iw, ih, w, h, cam, children, opacity = 1 }) {
  const base = w / iw;
  const s = base * cam.z;
  let tx = w / 2 - cam.cx * s;
  let ty = h / 2 - cam.cy * s;
  // Jamais de bord vide : on borne la translation.
  tx = Math.min(0, Math.max(w - iw * s, tx));
  ty = Math.min(0, Math.max(h - ih * s, ty));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: iw, height: ih, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" }}>
        <Img src={staticFile(src)} style={{ width: iw, height: ih, display: "block" }} />
        {children}
      </div>
    </div>
  );
}

/** Fenêtre de navigateur sobre, sans fausse adresse. */
export function BrowserFrame({ w, h, children, style }) {
  return (
    <div style={{ width: w, borderRadius: 22, overflow: "hidden", background: C.surface, boxShadow: "0 40px 120px rgba(28,26,23,0.28), 0 0 0 1px rgba(28,26,23,0.06)", ...style }}>
      <div style={{ height: 48, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", background: "#f6f1e8", borderBottom: `1px solid ${C.border}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />
        ))}
        <div style={{ marginLeft: 24, flex: 1, maxWidth: 520, height: 28, borderRadius: 8, background: "#fff", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", paddingLeft: 14, fontFamily: BODY, fontSize: 16, color: C.faint }}>
          Local Signal — mangez là où mangent les habitants
        </div>
      </div>
      <div style={{ position: "relative", width: w, height: h }}>{children}</div>
    </div>
  );
}

/** Téléphone générique (pas de marque). */
export function Phone({ w = 420, children, style }) {
  const h = w * 2.1;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.14, background: "#111", padding: w * 0.03, boxShadow: "0 50px 120px rgba(28,26,23,0.35)", position: "relative", ...style }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: w * 0.115, overflow: "hidden", background: C.bg }}>
        {children}
        <div style={{ position: "absolute", top: w * 0.03, left: "50%", transform: "translateX(-50%)", width: w * 0.28, height: w * 0.075, borderRadius: 99, background: "#111", zIndex: 30 }} />
      </div>
    </div>
  );
}

/** Pointeur de souris, avec onde au clic. Coordonnées dans le repère parent. */
export function Cursor({ path, clicks = [] }) {
  const frame = useCurrentFrame();
  const ats = path.map((p) => p.at);
  const ease = Easing.bezier(0.65, 0, 0.35, 1);
  const x = interpolate(frame, ats, path.map((p) => p.x), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const y = interpolate(frame, ats, path.map((p) => p.y), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const opacity = interpolate(frame, [ats[0] - 8, ats[0]], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const active = clicks.find((c) => frame >= c && frame < c + 18);
  const t = active !== undefined ? (frame - active) / 18 : 1;
  const press = active !== undefined ? interpolate(frame - active, [0, 4, 10], [1, 0.82, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, zIndex: 40, pointerEvents: "none" }}>
      {active !== undefined && (
        <div style={{ position: "absolute", left: -40 * t, top: -40 * t, width: 80 * t, height: 80 * t, borderRadius: 99, border: `4px solid ${C.brand}`, opacity: 1 - t }} />
      )}
      <svg width="34" height="40" viewBox="0 0 24 28" style={{ transform: `scale(${press})`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>
        <path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.8 L18.5 15.5 Z" fill="#1c1a17" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Mot-symbole officiel « LOCAL signal » (fond transparent, ratio 2:1). */
export function Logo({ width = 600, style }) {
  return <Img src={staticFile("localsignal-logo-header.png")} style={{ width, height: width / 2, objectFit: "contain", mixBlendMode: "multiply", ...style }} />;
}

/** Compteur animé, format français (espace fine insécable pour les milliers). */
export function Count({ to, from = 0, range, decimals = 0, suffix = "" }) {
  const v = useLerp(from, to, range, Easing.bezier(0.16, 1, 0.3, 1));
  const txt = v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/ | /g, " ");
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {txt}
      {suffix}
    </span>
  );
}
