// Ouverture : Paris en 3D, un volume par restaurant réel de la base
// (public/data/paris.json, exporté de local_signal.db).
//   1. la ville apparaît, point par point ;
//   2. hauteur = nombre d'avis : quelques géants écrasent tout ;
//   3. les tours s'effondrent et repoussent selon le Local Signal ;
//   4. plongée sur le Quartier latin, jusqu'aux Crêpes de Louis-Marie.
import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import featured from "../../public/data/featured.json";
import { BODY, C, FadeUp, TITLE, WordReveal, useSpring } from "../ui";
import { CameraRig, K, OUT, ramp } from "./three";
import { Towers } from "./towers";

export const CITY_DURATION = 660;

const CREPES = featured.find((f) => f.name.includes("Louis-Marie"));
/** Faisceau et onde au sol sur Les Crêpes de Louis-Marie. */
function Beacon() {
  const frame = useCurrentFrame();
  const t = ramp(frame, 540, 600, OUT);
  if (t <= 0) return null;
  const pulse = ((frame - 540) % 40) / 40;
  return (
    <group position={[CREPES.x, 0, CREPES.z]}>
      <mesh position={[0, 0.9 * t, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 1.8 * t, 16]} />
        <meshBasicMaterial color={K.brand} />
      </mesh>
      <mesh position={[0, 1.8 * t + 0.06, 0]}>
        <sphereGeometry args={[0.07 * t, 24, 24]} />
        <meshBasicMaterial color={K.brand} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.1 + pulse * 0.5, 0.13 + pulse * 0.5, 64]} />
        <meshBasicMaterial color={K.brand} transparent opacity={(1 - pulse) * 0.8 * t} />
      </mesh>
    </group>
  );
}

const CAM = [
  { at: 0, pos: [0.6, 21, 2.5], look: [0, 0, 0], fov: 34 },
  { at: 110, pos: [0.4, 16, 5.5], look: [0, 0, 0] },
  { at: 230, pos: [11, 7.5, 13], look: [0, 0.6, 0] },
  { at: 330, pos: [-7, 6.5, 13], look: [0, 0.4, 0] },
  { at: 450, pos: [2.5, 6, 11], look: [-0.3, 0.2, 0.8] },
  { at: 560, pos: [CREPES.x + 3.0, 2.6, CREPES.z + 4.2], look: [CREPES.x - 0.6, 0.3, CREPES.z] },
  { at: 660, pos: [CREPES.x + 2.2, 1.7, CREPES.z + 3.0], look: [CREPES.x - 0.5, 0.45, CREPES.z] },
];

function Caption({ from, to, children }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const o = interpolate(frame, [to - 12, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <div style={{ position: "absolute", left: 120, top: 110, width: 1100, opacity: o }}>{children}</div>
    </Sequence>
  );
}

function Legend({ from, to, dot, label }) {
  const frame = useCurrentFrame();
  const s = useSpring(from);
  const o = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < from || frame >= to) return null;
  return (
    <div style={{ position: "absolute", left: 120, bottom: 90, opacity: s * o, display: "flex", alignItems: "center", gap: 14, fontFamily: BODY, fontSize: 26, color: C.muted, fontWeight: 600 }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: dot }} />
      {label}
    </div>
  );
}

function BrandMark() {
  const frame = useCurrentFrame();
  const s = useSpring(300, { damping: 16, stiffness: 110 });
  const o = interpolate(frame, [438, 452], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < 300 || frame > 452) return null;
  return (
    <div style={{ position: "absolute", right: 110, top: 70, opacity: s * o, transform: `scale(${0.8 + 0.2 * s})`, transformOrigin: "right top", clipPath: `inset(0 ${(1 - s) * 100}% 0 0)` }}>
      <Img src={staticFile("logo-alpha.png")} style={{ width: 520, height: 260, objectFit: "contain" }} />
    </div>
  );
}

export function City() {
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 34, near: 0.05, far: 200, position: [0, 30, 3] }} gl={{ antialias: true }}>
        <color attach="background" args={[K.bg]} />
        <fog attach="fog" args={[K.bg, 18, 48]} />
        <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.1]} />
        <directionalLight position={[8, 14, 6]} intensity={1.6} />
        <directionalLight position={[-10, 6, -8]} intensity={0.35} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color={K.ground} roughness={1} />
        </mesh>
        <CameraRig keys={CAM} />
        <Towers appear={4} pop={[125, 215]} fall={[300, 335]} flip={340} grow={[345, 440]} green={[340, 380]} fade={[455, 540]} />
        <Beacon />
      </ThreeCanvas>

      {/* Vignette douce pour détacher le texte */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 70% 60%, transparent 55%, rgba(247,240,227,0.85) 100%)" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(247,240,227,0.95) 0%, rgba(247,240,227,0.75) 26%, rgba(247,240,227,0) 46%)" }} />

      <Caption from={8} to={118}>
        <WordReveal text="Paris." size={150} align="left" />
        <FadeUp delay={24} style={{ fontFamily: TITLE, fontWeight: 600, fontSize: 52, color: C.muted, marginTop: 8 }}>
          Plus de 10 000 restaurants.
        </FadeUp>
      </Caption>
      <Caption from={125} to={298}>
        <WordReveal text="Les applis les classent par *popularité.*" size={78} align="left" />
        <FadeUp delay={55} style={{ fontFamily: TITLE, fontWeight: 600, fontSize: 46, color: C.muted, marginTop: 18 }}>
          Quelques géants écrasent tout le reste.
        </FadeUp>
      </Caption>
      <Caption from={305} to={450}>
        <WordReveal text="Local Signal mesure autre chose : *l'ancrage local.*" size={74} align="left" stagger={2} />
        <FadeUp delay={50} style={{ fontFamily: BODY, fontSize: 34, color: C.muted, marginTop: 22, lineHeight: 1.4, maxWidth: 900 }}>
          La carte, la langue des avis, les prix du quartier, la distance aux monuments. <b style={{ color: C.text }}>Jamais le nombre d'avis.</b>
        </FadeUp>
      </Caption>
      <Caption from={458} to={660}>
        <WordReveal text="Cap sur le *Quartier latin.*" size={84} align="left" />
        <FadeUp delay={40} style={{ fontFamily: BODY, fontSize: 34, color: C.muted, marginTop: 18, lineHeight: 1.4, maxWidth: 820 }}>
          Notre zone témoin : 467 restaurants, départagés deux à deux par un panel.
        </FadeUp>
      </Caption>
      <BrandMark />

      <Legend from={20} to={120} dot="#8f8374" label="1 volume = 1 restaurant réel (OpenStreetMap)" />
      <Legend from={140} to={298} dot={K.gold} label="Hauteur = nombre d'avis Google" />
      <Legend from={350} to={455} dot={K.local} label="Hauteur = Local Signal" />
    </AbsoluteFill>
  );
}
