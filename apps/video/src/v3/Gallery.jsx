// Carrousel 3D d'adresses locales du Quartier latin. Chaque carte porte la
// VRAIE photo du restaurant (public/cards, générées par capture/cards.mjs) :
// un restaurant sans photo n'entre pas dans la sélection (featured.json).
import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import featured from "../../public/data/featured.json";
import { BODY, C, FadeUp, WordReveal } from "../ui";
import { CameraRig, K, OUT, ramp, useTex } from "./three";

export const GALLERY_DURATION = 300;

const PICK = featured.slice(0, 18);
const R = 8.6;
const CW = 2.8;
const CH = CW * (1560 / 1200);

function Card({ r, i }) {
  const frame = useCurrentFrame();
  const tex = useTex(`cards/${r.id}.png`);
  const a = (i / PICK.length) * Math.PI * 2;
  const t = ramp(frame, 4 + i * 3, 34 + i * 3, OUT);
  const bob = Math.sin(frame / 35 + i) * 0.12;
  return (
    <group rotation={[0, a, 0]}>
      <group position={[0, bob + (1 - t) * -4, R]} scale={0.6 + 0.4 * t}>
        {tex && (
          <mesh>
            <planeGeometry args={[CW, CH]} />
            <meshBasicMaterial map={tex} transparent toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Ring() {
  const frame = useCurrentFrame();
  return (
    <group rotation={[0, frame * 0.0085 + 0.3, 0]}>
      {PICK.map((r, i) => (
        <Card key={r.id} r={r} i={i} />
      ))}
    </group>
  );
}

export function Gallery() {
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 38, position: [0, 2, 20] }}>
        <color attach="background" args={[K.bg]} />
        <fog attach="fog" args={[K.bg, 16, 34]} />
        <ambientLight intensity={1} />
        <CameraRig
          keys={[
            { at: 0, pos: [0, 3.2, 22], look: [0, -0.9, 0] },
            { at: 300, pos: [0, 1.8, 18.8], look: [0, -0.7, 0] },
          ]}
        />
        <Ring />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(247,240,227,0.96) 0%, rgba(247,240,227,0.6) 16%, rgba(247,240,227,0) 28%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 58, textAlign: "center" }}>
        <WordReveal text="Des adresses de quartier, *enfin visibles.*" size={72} stagger={2} delay={6} />
        <FadeUp delay={40} style={{ fontFamily: BODY, fontSize: 32, color: C.muted, marginTop: 12 }}>
          Toutes classées « Profil local », dans le Quartier latin.
        </FadeUp>
      </div>
    </AbsoluteFill>
  );
}
