// L'application mobile (Expo), filmée avec le même compte Pass Voyageur :
// trois téléphones en 3D, puis le scan d'une carte en vitrine.
import React from "react";
import { RoundedBox } from "@react-three/drei";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, Callout, FadeUp, TITLE, VerdictPill, WordReveal, useSpring } from "../ui";
import { CameraRig, K, OUT, SMOOTH, ramp, useTex } from "./three";

export const MOBILE_DURATION = 270;
export const SCAN_DURATION = 300;

const SW = 2.78; // écran : 1170 × 2532 px
const SH = SW * (2532 / 1170);

/** Téléphone générique : coque arrondie + écran à couches (fondus). */
function PhoneModel({ layers, position, rotation, children }) {
  const frame = useCurrentFrame();
  const texs = layers.map((l) => useTex(l.src)); // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[SW + 0.22, SH + 0.24, 0.3]} radius={0.3} smoothness={6} position={[0, 0, -0.16]}>
        <meshStandardMaterial color="#17150f" roughness={0.35} metalness={0.4} />
      </RoundedBox>
      {layers.map((l, i) => {
        const o = l.from == null ? 1 : interpolate(frame, [l.from, l.from + (l.fade || 10)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return texs[i] && o > 0 ? (
          <mesh key={l.src + i} position={[0, 0, 0.002 * (i + 1)]} renderOrder={i}>
            <planeGeometry args={[SW, SH]} />
            <meshBasicMaterial map={texs[i]} transparent opacity={o} toneMapped={false} />
          </mesh>
        ) : null;
      })}
      {/* îlot caméra */}
      <mesh position={[0, SH / 2 - 0.2, 0.02]}>
        <planeGeometry args={[0.7, 0.2]} />
        <meshBasicMaterial color="#17150f" />
      </mesh>
      {children}
    </group>
  );
}

function Stage({ children, cam }) {
  return (
    <ThreeCanvas width={1920} height={1080} camera={{ fov: 32, position: [0, 0, 16] }}>
      <color attach="background" args={[K.bg]} />
      <fog attach="fog" args={[K.bg, 14, 34]} />
      <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.3]} />
      <directionalLight position={[4, 8, 10]} intensity={1.6} />
      <directionalLight position={[-6, 2, 4]} intensity={0.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4.2, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={K.ground} roughness={1} />
      </mesh>
      <CameraRig keys={cam} />
      {children}
    </ThreeCanvas>
  );
}

// ---------------------------------------------------------------------------
// Trois écrans de l'app mobile
// ---------------------------------------------------------------------------
function Rising({ delay, x, ry, z = 0, layers }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, delay, delay + 40, OUT);
  const bob = Math.sin((frame + delay * 3) / 45) * 0.08;
  return <PhoneModel layers={layers} position={[x, -9 + 9 * t + bob, z]} rotation={[0, ry + (1 - t) * 0.8, (1 - t) * 0.2]} />;
}

export function Mobile() {
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Stage
        cam={[
          { at: 0, pos: [2.4, 1.2, 19], look: [0, 0.7, 0] },
          { at: 140, pos: [-1.2, 0.9, 16.8], look: [0, 0.6, 0] },
          { at: 270, pos: [0.5, 0.8, 14.2], look: [0.2, 0.55, 0] },
        ]}
      >
        <Rising delay={4} x={-4.1} z={-1.2} ry={0.42} layers={[{ src: "shots/m01-discover.png" }]} />
        <Rising delay={14} x={0} z={0.4} ry={0} layers={[{ src: "shots/m03-detail.png" }, { src: "shots/m04-detail-bas.png", from: 150, fade: 14 }]} />
        <Rising delay={24} x={4.1} z={-1.2} ry={-0.42} layers={[{ src: "shots/m02-list.png" }]} />
      </Stage>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(247,240,227,0.95) 0%, rgba(247,240,227,0.7) 13%, rgba(247,240,227,0) 24%)" }} />
      <div style={{ position: "absolute", left: 110, top: 64, display: "flex", alignItems: "center", gap: 22 }}>
        <WordReveal text="Et dans la poche, *devant la vitrine.*" size={64} align="left" stagger={2} delay={6} />
      </div>
      <PlatformBadges delay={40} />
      <Sequence from={95} durationInFrames={80} layout="none">
        <Callout x={150} y={900}>Même compte, même Pass, sur web et mobile</Callout>
      </Sequence>
      <Sequence from={180} durationInFrames={90} layout="none">
        <Callout x={1770} y={900} anchor="right">« Pourquoi ce restaurant », en phrases simples</Callout>
      </Sequence>
    </AbsoluteFill>
  );
}

function PlatformBadges({ delay }) {
  const s = useSpring(delay, { damping: 13 });
  return (
    <div style={{ position: "absolute", right: 110, top: 72, display: "flex", gap: 14, transform: `scale(${s})`, transformOrigin: "right center" }}>
      {["iOS", "Android", "Web"].map((t) => (
        <span key={t} style={{ padding: "10px 24px", borderRadius: 99, background: C.text, color: "#fff", fontFamily: TITLE, fontWeight: 700, fontSize: 26 }}>{t}</span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan : la vitrine, la photo, la lecture de la carte
// ---------------------------------------------------------------------------
const ROWS = [17.8, 21.6, 25.3, 29.6, 35.2, 40.9, 45.6, 51.4, 57.1, 62.8, 70.0, 88.8];
const MENU_H = SW * (1656 / 1242); // la photo de carte, pleine largeur d'écran

function ScanOverlay() {
  const frame = useCurrentFrame();
  const sweep = ramp(frame, 104, 190, SMOOTH);
  const on = frame >= 100 && frame < 196;
  const top = MENU_H / 2;
  const y = top - sweep * MENU_H;
  return (
    <group position={[0, 0, 0.02]}>
      {ROWS.map((r, i) => {
        const ry = top - (r / 100) * MENU_H;
        const visible = frame >= 100 && (y <= ry - 0.02 || frame >= 196);
        return visible ? (
          <mesh key={i} position={[0.05, ry, 0.001]}>
            <planeGeometry args={[SW * 0.86, 0.13]} />
            <meshBasicMaterial color={K.local} transparent opacity={0.22} />
          </mesh>
        ) : null;
      })}
      {on && (
        <>
          <mesh position={[0, y, 0.004]}>
            <planeGeometry args={[SW + 0.3, 0.05]} />
            <meshBasicMaterial color={K.local} toneMapped={false} />
          </mesh>
          <mesh position={[0, y, 0.003]}>
            <planeGeometry args={[SW + 0.6, 0.35]} />
            <meshBasicMaterial color={K.local} transparent opacity={0.18} />
          </mesh>
        </>
      )}
    </group>
  );
}

const CHIPS = ["24 plats", "Une seule cuisine", "Une seule langue", "Pas de « menu touriste »", "Prix 19 % sous le quartier"];

function Chip({ text, delay, y }) {
  const s = useSpring(delay, { damping: 13, stiffness: 170 });
  return (
    <div style={{ position: "absolute", left: 0, top: y, transform: `translateX(${(1 - s) * 140}px) scale(${0.7 + 0.3 * s})`, transformOrigin: "left center", opacity: Math.min(1, s * 1.4), display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderRadius: 18, background: C.surface, boxShadow: "0 16px 40px rgba(28,26,23,0.16)", fontFamily: TITLE, fontWeight: 600, fontSize: 30, color: C.text, whiteSpace: "nowrap" }}>
      <span style={{ width: 32, height: 32, borderRadius: 99, background: C.localSoft, color: C.local, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>✓</span>
      {text}
    </div>
  );
}

export function Scan() {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [78, 82, 98], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const verdict = useSpring(262, { damping: 11, stiffness: 150 });
  const layers = [
    { src: "shots/m05-scan.png" },
    { src: "photos/osm_n6226490387.jpg", from: 34, fade: 12 },
  ];
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Stage
        cam={[
          { at: 0, pos: [0.4, 0.5, 17], look: [0.4, 0.2, 0] },
          { at: 90, pos: [0.6, 0.3, 15.2], look: [0.5, 0.2, 0] },
          { at: 300, pos: [0.3, 0.2, 14.4], look: [0.4, 0.2, 0] },
        ]}
      >
        <ScanPhone layers={layers} />
      </Stage>

      <div style={{ position: "absolute", left: 110, top: 150, width: 1000 }}>
        <WordReveal text="Pas d'avis ? *Pas grave.*" size={92} align="left" delay={6} />
        <FadeUp delay={34} style={{ fontFamily: TITLE, fontWeight: 600, fontSize: 48, color: C.text, marginTop: 26, lineHeight: 1.15 }}>
          Une photo de la carte en vitrine suffit.
        </FadeUp>
        <FadeUp delay={60} style={{ fontFamily: BODY, fontSize: 32, color: C.muted, marginTop: 24, lineHeight: 1.4 }}>
          L'IA <b style={{ color: C.text }}>observe</b> la carte sans jamais la juger. Un calcul transparent donne le score.
        </FadeUp>
      </div>
      <div style={{ position: "absolute", left: 110, top: 600 }}>
        {CHIPS.map((t, i) => (
          <Chip key={t} text={t} delay={196 + i * 12} y={i * 78} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 1330, top: 960, transform: `scale(${verdict})`, transformOrigin: "center" }}>
        <VerdictPill scale={1.3} />
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

function ScanPhone({ layers }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, 0, 40, OUT);
  const menu = useTex("shots/menu-hd-3.jpg");
  const showMenu = frame >= 82;
  return (
    <PhoneModel layers={layers} position={[3.4, -7 + 7 * t, 0]} rotation={[0.05, -0.28 + Math.sin(frame / 80) * 0.05, 0.02]}>
      {showMenu && menu && (
        <group position={[0, 0, 0.012]}>
          <mesh>
            <planeGeometry args={[SW, SH]} />
            <meshBasicMaterial color="#141210" />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[SW, MENU_H]} />
            <meshBasicMaterial map={menu} toneMapped={false} />
          </mesh>
          <ScanOverlay />
        </group>
      )}
    </PhoneModel>
  );
}
