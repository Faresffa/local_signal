// Un restaurant, de près : la photo réelle des Crêpes de Louis-Marie sort de
// la ville en 3D, et les quatre indicateurs se remplissent autour. Valeurs
// lues dans local_signal.db (signals_json), identiques à la fiche de l'app.
import React, { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, Count, FadeUp, TITLE, VerdictPill, WordReveal, useSpring } from "../ui";
import { CameraRig, K, OUT, ramp, useTex } from "./three";

export const FOCUS_DURATION = 300;

const RINGS = [
  { label: "Carte du restaurant", detail: "24 plats, une seule cuisine", value: 88 },
  { label: "Langue des avis", detail: "surtout en français", value: 75 },
  { label: "Prix face au quartier", detail: "19 % sous la médiane", value: 100 },
  { label: "Hors zone touristique", detail: "loin des monuments", value: 93 },
];

/** Carte photo en 3D : une dalle fine, la photo en façade. */
function PhotoSlab() {
  const frame = useCurrentFrame();
  const tex = useTex("photos/osm_n6226490387.jpg");
  const t = ramp(frame, 0, 45, OUT);
  const w = 5.2;
  const h = w * (500 / 667);
  const y = Math.sin(frame / 40) * 0.08;
  return (
    <group position={[-2.3, 0.15 + y, -8 + 8 * t]} rotation={[0.04, 0.55 - 0.3 * t + Math.sin(frame / 70) * 0.04, -0.03]}>
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      {tex && (
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Petits cubes qui flottent en arrière-plan, rappel de la ville. */
function Drift() {
  const frame = useCurrentFrame();
  const cubes = useMemo(() => {
    const rnd = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
    return Array.from({ length: 70 }, (_, i) => ({
      x: (Math.abs(rnd(i)) - 0.5) * 22,
      y: (Math.abs(rnd(i + 99)) - 0.5) * 12,
      z: -6 - Math.abs(rnd(i + 7)) * 10,
      s: 0.08 + Math.abs(rnd(i + 3)) * 0.22,
      g: Math.abs(rnd(i + 5)),
    }));
  }, []);
  return cubes.map((c, i) => (
    <mesh key={i} position={[c.x, c.y + Math.sin(frame / 50 + i) * 0.2, c.z]} rotation={[frame / 90 + i, frame / 120 + i, 0]}>
      <boxGeometry args={[c.s, c.s * 2.2, c.s]} />
      <meshStandardMaterial color={c.g > 0.35 ? K.local : K.mixed} roughness={0.7} />
    </mesh>
  ));
}

function Ring({ r, i }) {
  const frame = useCurrentFrame();
  const delay = 55 + i * 26;
  const s = useSpring(delay);
  const v = interpolate(frame, [delay + 6, delay + 46], [0, r.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: OUT });
  const R = 62;
  const L = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={R} fill="none" stroke={C.sunken} strokeWidth={14} />
        <circle cx={80} cy={80} r={R} fill="none" stroke={C.localBright} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${(v / 100) * L} ${L}`} transform="rotate(-90 80 80)" />
        <text x={80} y={92} textAnchor="middle" fontFamily={TITLE} fontWeight={800} fontSize={38} fill={C.local}>{Math.round(v)}</text>
      </svg>
      <div>
        <div style={{ fontFamily: TITLE, fontWeight: 700, fontSize: 34, color: C.text }}>{r.label}</div>
        <div style={{ fontFamily: BODY, fontSize: 24, color: C.muted, marginTop: 4 }}>{r.detail}</div>
      </div>
    </div>
  );
}

export function Focus() {
  const frame = useCurrentFrame();
  const total = useSpring(172, { damping: 16 });
  const pill = useSpring(212, { damping: 11, stiffness: 160 });
  const ringsDim = interpolate(frame, [166, 186], [1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 32, position: [0, 0, 12] }}>
        <color attach="background" args={[K.bg]} />
        <fog attach="fog" args={[K.bg, 10, 26]} />
        <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.2]} />
        <directionalLight position={[5, 8, 10]} intensity={1.4} />
        <CameraRig keys={[{ at: 0, pos: [0.6, 0.3, 12.5], look: [0, 0, 0] }, { at: 300, pos: [-0.4, 0.1, 11.2], look: [-0.2, 0, 0] }]} />
        <Drift />
        <PhotoSlab />
      </ThreeCanvas>

      <div style={{ position: "absolute", left: 120, top: 70 }}>
        <WordReveal text="Un score d'authenticité, *sans la popularité.*" size={70} align="left" stagger={2} delay={8} />
      </div>

      <div style={{ position: "absolute", left: 250, top: 820, opacity: useSpring(30) }}>
        <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 48, color: C.text }}>Les Crêpes de Louis-Marie</div>
        <div style={{ fontFamily: BODY, fontSize: 28, color: C.muted, marginTop: 4 }}>Crêperie · Quartier latin</div>
      </div>
      <div style={{ position: "absolute", left: 250, top: 250, transform: `scale(${pill})`, transformOrigin: "left top" }}>
        <VerdictPill scale={1.5} />
      </div>

      <div style={{ position: "absolute", left: 1080, top: 250, display: "flex", flexDirection: "column", gap: 26, opacity: ringsDim }}>
        {RINGS.map((r, i) => (
          <Ring key={r.label} r={r} i={i} />
        ))}
      </div>

      <div style={{ position: "absolute", left: 1150, top: 420, opacity: total, transform: `scale(${0.7 + 0.3 * total})` }}>
        <div style={{ background: C.text, color: "#fff", borderRadius: 34, padding: "34px 70px", boxShadow: "0 40px 90px rgba(28,26,23,0.35)", textAlign: "center" }}>
          <div style={{ fontFamily: BODY, fontSize: 28, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d5c9b6" }}>Local Signal</div>
          <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 150, lineHeight: 1, marginTop: 8 }}>
            <Count to={87} range={[176, 214]} />
            <span style={{ fontSize: 60, color: "#d5c9b6" }}> / 100</span>
          </div>
        </div>
      </div>

      <Sequence from={235} layout="none">
        <FadeUp style={{ position: "absolute", left: 1150, top: 800, fontFamily: BODY, fontSize: 30, color: C.muted }}>
          Note Google et nombre d'avis : <b style={{ color: C.brand }}>exclus du calcul.</b>
        </FadeUp>
      </Sequence>
    </AbsoluteFill>
  );
}
