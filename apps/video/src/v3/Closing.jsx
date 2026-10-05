// Fin : la preuve (chiffres de la vérité terrain), le Pass Voyageur et les
// restaurateurs, puis le logo.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import paris from "../../public/data/paris.json";
import { BODY, C, Count, FadeUp, TITLE, WordReveal, useSpring } from "../ui";
import { CameraRig, K, OUT, clamp01, ramp } from "./three";

export const PROOF_DURATION = 250;
export const PASS_DURATION = 250;
export const OUTRO_DURATION = 180;

// ---------------------------------------------------------------------------
// Le Quartier latin en 3D, qui tourne doucement derrière les chiffres
// ---------------------------------------------------------------------------
const QL = { x: -0.38, z: 0.84 };
const QL_PTS = paris.filter(([x, z]) => Math.hypot(x - QL.x, z - QL.z) < 1.1);

function MiniCity() {
  const frame = useCurrentFrame();
  const ref = useRef();
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const mixed = new THREE.Color(K.mixed);
    const local = new THREE.Color(K.local);
    QL_PTS.forEach(([x, z, ls], i) => {
      const t = ls == null ? 0 : clamp01((ls - 45) / 45);
      const grow = ramp(frame, 0 + (i % 40), 50 + (i % 40), OUT);
      const h = (0.03 + 0.5 * Math.pow(t, 1.6)) * grow;
      m.makeScale(0.045, Math.max(0.001, h), 0.045);
      m.setPosition(x - QL.x, 0, z - QL.z);
      ref.current.setMatrixAt(i, m);
      c.copy(mixed).lerp(local, t);
      if (ls == null) c.set("#cfc5b5");
      ref.current.setColorAt(i, c);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [frame]);
  return (
    <group rotation={[0, frame * 0.006, 0]}>
      <instancedMesh ref={ref} args={[geo, undefined, QL_PTS.length]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

function Stat({ to, label, delay }) {
  const s = useSpring(delay);
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 50}px)` }}>
      <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 104, color: C.brand, letterSpacing: "-0.04em", lineHeight: 1 }}>
        <Count to={to} range={[delay, delay + 40]} />
      </div>
      <div style={{ fontFamily: BODY, fontSize: 28, color: C.muted, marginTop: 8, maxWidth: 330, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function Bar({ label, value, color, delay }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [delay, delay + 36], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: OUT });
  const s = useSpring(delay - 6);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 20, opacity: s }}>
      <div style={{ width: 240, fontFamily: TITLE, fontWeight: 700, fontSize: 34, color: C.text }}>{label}</div>
      <div style={{ width: 520, height: 48, background: C.sunken, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ width: `${(w / 0.4) * 100}%`, height: "100%", background: color, borderRadius: 12 }} />
      </div>
      <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 42, color, fontVariantNumeric: "tabular-nums" }}>{w.toFixed(2).replace(".", ",")}</div>
    </div>
  );
}

export function Proof() {
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 30, position: [3.2, 2.2, 3.2] }}>
        <color attach="background" args={[K.bg]} />
        <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.2]} />
        <directionalLight position={[4, 8, 5]} intensity={1.5} />
        <CameraRig keys={[{ at: 0, pos: [3.4, 2.1, 3.4], look: [-1.45, -0.1, 0.9] }]} />
        <group position={[0, -0.35, 0]}>
          <MiniCity />
        </group>
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(247,240,227,0.98) 0%, rgba(247,240,227,0.92) 45%, rgba(247,240,227,0) 70%)" }} />
      <div style={{ position: "absolute", left: 110, top: 80 }}>
        <WordReveal text="Mesuré, *pas décrété.*" size={84} align="left" delay={4} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 250, display: "flex", gap: 60 }}>
        <Stat to={10644} label="restaurants parisiens analysés" delay={14} />
        <Stat to={467} label="restaurants du Quartier latin départagés par un panel" delay={28} />
        <Stat to={4528} label="comparaisons deux à deux" delay={42} />
      </div>
      <Sequence from={110} layout="none">
        <div style={{ position: "absolute", left: 110, top: 620 }}>
          <FadeUp style={{ fontFamily: TITLE, fontWeight: 700, fontSize: 40, color: C.text }}>
            Adresses <span style={{ color: C.brand }}>peu connues</span> (moins de 300 avis) : qui colle au terrain ?
          </FadeUp>
          <Bar label="Local Signal" value={0.33} color={C.local} delay={16} />
          <Bar label="Note Google" value={0.18} color="#9b9186" delay={28} />
          <FadeUp delay={60} style={{ fontFamily: BODY, fontSize: 22, color: C.faint, marginTop: 20 }}>
            Corrélation de rang avec le classement de terrain, 85 restaurants. Écart indicatif, en cours de consolidation.
          </FadeUp>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Pass Voyageur + restaurateurs (tarifs D-063, apps/web/src/pages/Pricing.jsx)
// ---------------------------------------------------------------------------
const PASS = [
  { nom: "Week-end", duree: "3 jours", prix: "2,99" },
  { nom: "Semaine", duree: "7 jours", prix: "4,99", vedette: true },
  { nom: "Annuel", duree: "12 mois", prix: "14,99" },
];

function PassCard({ p, i }) {
  const frame = useCurrentFrame();
  const s = useSpring(20 + i * 10, { damping: 14, stiffness: 120 });
  const tilt = Math.sin(frame / 40 + i) * 4;
  return (
    <div style={{ perspective: 1400 }}>
      <div
        style={{
          width: 330, padding: "34px 34px 38px", borderRadius: 30, background: p.vedette ? C.text : C.surface, color: p.vedette ? "#fff" : C.text,
          boxShadow: "0 30px 80px rgba(28,26,23,0.18)", transform: `rotateY(${(1 - s) * 90 + tilt}deg) translateY(${p.vedette ? -24 : 0}px)`, opacity: Math.min(1, s * 1.5),
        }}
      >
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: p.vedette ? "#d5c9b6" : C.faint }}>Pass {p.nom}</div>
        <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 84, marginTop: 10, letterSpacing: "-0.03em" }}>
          {p.prix}&nbsp;€
        </div>
        <div style={{ fontFamily: BODY, fontSize: 28, marginTop: 4, color: p.vedette ? "#e8e0d3" : C.muted }}>{p.duree} · paiement unique</div>
      </div>
    </div>
  );
}

export function PassResto() {
  const frame = useCurrentFrame();
  const swap = interpolate(frame, [138, 150], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile("motif-couverts.svg")})`, backgroundSize: "300px 300px", opacity: 0.45, backgroundPosition: `${frame * 0.3}px 0px` }} />
      <div style={{ opacity: swap }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 110, textAlign: "center" }}>
          <WordReveal text="Le *Pass Voyageur* : le temps du séjour." size={76} stagger={2} delay={4} />
          <FadeUp delay={30} style={{ fontFamily: BODY, fontSize: 32, color: C.muted, marginTop: 14 }}>
            Tous les résultats, la fourchette de score, les scans illimités. Sans abonnement.
          </FadeUp>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 440, display: "flex", justifyContent: "center", gap: 40 }}>
          {PASS.map((p, i) => (
            <PassCard key={p.nom} p={p} i={i} />
          ))}
        </div>
      </div>
      <Sequence from={146} layout="none">
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <FadeUp style={{ fontFamily: BODY, fontSize: 30, color: C.brand, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Pour les restaurateurs</FadeUp>
          <WordReveal text="0 €. Et *aucun classement à vendre.*" size={92} delay={8} style={{ marginTop: 18 }} />
          <FadeUp delay={34} style={{ fontFamily: BODY, fontSize: 34, color: C.muted, marginTop: 24, maxWidth: 1200 }}>
            Revendiquer sa fiche, déposer sa devanture, suivre ses visites. Le score, lui, se calcule sans eux.
          </FadeUp>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Logo animé officiel (images extraites de localsignal-logo-animated.mp4)
// ---------------------------------------------------------------------------
export function Outro() {
  const frame = useCurrentFrame();
  const i = Math.min(149, Math.max(0, frame));
  const black = interpolate(frame, [OUTRO_DURATION - 22, OUTRO_DURATION], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#fdf9ee" }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img src={staticFile(`logo-frames/${String(i).padStart(3, "0")}.jpg`)} style={{ width: 1000, height: 1000, marginTop: -120 }} />
      </AbsoluteFill>
      <Sequence from={50} layout="none">
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 200 }}>
          <WordReveal text="Mangez là où mangent *les habitants.*" size={62} weight={700} />
        </div>
      </Sequence>
      <Sequence from={85} layout="none">
        <FadeUp style={{ position: "absolute", left: 0, right: 0, bottom: 130, textAlign: "center", fontFamily: BODY, fontSize: 28, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
          Web · iOS · Android
        </FadeUp>
      </Sequence>
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </AbsoluteFill>
  );
}
