// L'application web, filmée avec le compte abonné depuis le Quartier latin :
// les captures deviennent des panneaux dans l'espace, la caméra voyage de
// l'un à l'autre et s'approche des éléments qui comptent.
import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, Callout, TITLE, WordReveal, useSpring } from "../ui";
import { CameraRig, K, OUT, ramp, useTex } from "./three";

export const WEB_DURATION = 560;

const PX = 16 / 1920; // 1 pixel de capture = PX unité 3D

// Panneaux : position du centre, rotation Y, taille de l'image.
const P = {
  search: { pos: [0, 0, 0], ry: 0, w: 1920, h: 1080 },
  detail: { pos: [21, 0.4, -5], ry: -0.32, w: 1920, h: 1970 },
};

/** Point 3D d'un pixel (x, y) d'un panneau, décalé de `d` selon sa normale. */
function at(panel, x, y, d = 0) {
  const lx = (x - panel.w / 2) * PX;
  const ly = (panel.h / 2 - y) * PX;
  const c = Math.cos(panel.ry);
  const s = Math.sin(panel.ry);
  return [panel.pos[0] + lx * c + d * s, panel.pos[1] + ly, panel.pos[2] - lx * s + d * c];
}

function Panel({ panel, layers }) {
  const frame = useCurrentFrame();
  const texs = layers.map((l) => useTex(l.src)); // eslint-disable-line react-hooks/rules-of-hooks
  const W = panel.w * PX;
  const H = panel.h * PX;
  return (
    <group position={panel.pos} rotation={[0, panel.ry, 0]}>
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[W + 0.3, H + 0.3, 0.12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      {layers.map((l, i) => {
        const o = l.from == null ? 1 : interpolate(frame, [l.from, l.from + (l.fade || 8)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return texs[i] && o > 0 ? (
          <mesh key={l.src} position={[0, 0, 0.002 * (i + 1)]} renderOrder={i}>
            <planeGeometry args={[W, H]} />
            <meshBasicMaterial map={texs[i]} transparent opacity={o} toneMapped={false} />
          </mesh>
        ) : null;
      })}
    </group>
  );
}

/** Cadre rouge qui se dessine autour d'une zone d'un panneau. */
function Highlight({ panel, x, y, w, h, from, to }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, from + 14, OUT);
  const o = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < from || frame > to) return null;
  const [cx, cy, cz] = at(panel, x + w / 2, y + h / 2, 0.03);
  const W = w * PX * (0.9 + 0.1 * t);
  const H = h * PX * (0.9 + 0.1 * t);
  const e = 0.045;
  const edges = [
    [0, H / 2, W + e, e],
    [0, -H / 2, W + e, e],
    [-W / 2, 0, e, H],
    [W / 2, 0, e, H],
  ];
  return (
    <group position={[cx, cy, cz]} rotation={[0, panel.ry, 0]}>
      {edges.map(([x0, y0, ww, hh], i) => (
        <mesh key={i} position={[x0, y0, 0]}>
          <planeGeometry args={[ww, hh]} />
          <meshBasicMaterial color={K.brand} transparent opacity={t * o} />
        </mesh>
      ))}
    </group>
  );
}

function cam(panel, x, y, dist, at_, offset = [0, 0]) {
  const look = at(panel, x, y);
  const pos = at(panel, x + offset[0] / PX, y - offset[1] / PX, dist);
  return { at: at_, pos, look };
}

const S = P.search;
const D = P.detail;
const KEYS = [
  { at: 0, pos: [-9, 4.5, 17], look: [2, 1.4, -1] },
  cam(S, 960, 540, 13.5, 40),
  cam(S, 960, 330, 8.4, 95, [0.6, 0.2]),
  cam(S, 960, 330, 8.2, 118),
  cam(S, 520, 760, 8.4, 160, [0.8, 0.2]),
  cam(S, 520, 760, 8.2, 250),
  cam(S, 900, 640, 9.5, 290, [0.5, 0]),
  cam(S, 1130, 900, 7.2, 325),
  cam(S, 1400, 700, 7.0, 360, [-0.3, 0]),
  { at: 395, pos: [14, 3, 8], look: [21, 0.5, -5] },
  cam(D, 1120, 230, 7.5, 425),
  cam(D, 1330, 860, 8.0, 470, [0.5, 0]),
  cam(D, 1330, 860, 7.8, 500),
  cam(D, 1330, 1210, 7.6, 540, [0.4, 0]),
  cam(D, 1330, 1210, 7.4, 560),
];

function Head({ from, to, text, children }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const o = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <div style={{ position: "absolute", left: 110, top: 64, opacity: o, display: "flex", alignItems: "center", gap: 24 }}>
        <WordReveal text={text} size={64} align="left" stagger={2} />
        {children}
      </div>
    </Sequence>
  );
}

function Badge({ children, delay = 18, tone = "local" }) {
  const s = useSpring(delay, { damping: 12, stiffness: 160 });
  return (
    <div style={{ transform: `scale(${s})`, padding: "10px 24px", borderRadius: 99, background: tone === "local" ? C.localSoft : C.text, color: tone === "local" ? C.local : "#fff", fontFamily: TITLE, fontWeight: 700, fontSize: 28 }}>
      {children}
    </div>
  );
}

export function WebApp() {
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 36, position: [-9, 3.5, 17] }}>
        <color attach="background" args={[K.bg]} />
        <fog attach="fog" args={[K.bg, 16, 42]} />
        <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.3]} />
        <directionalLight position={[6, 10, 12]} intensity={1.2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6.5, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color={K.ground} roughness={1} />
        </mesh>
        <CameraRig keys={KEYS} />
        <Panel
          panel={S}
          layers={[
            { src: "shots/w01-home.png" },
            { src: "shots/w02-filter-open.png", from: 168 },
            { src: "shots/w03-filter-set.png", from: 205, fade: 5 },
            { src: "shots/w04-filtered.png", from: 262, fade: 12 },
          ]}
        />
        <Panel panel={D} layers={[{ src: "shots/w07-carte.png" }]} />
        <Highlight panel={S} x={1105} y={210} w={320} h={70} from={80} to={125} />
        <Highlight panel={S} x={283} y={680} w={260} h={300} from={185} to={255} />
        <Highlight panel={S} x={1050} y={880} w={162} h={44} from={318} to={362} />
        <Highlight panel={D} x={1030} y={728} w={590} h={170} from={462} to={512} />
        <Highlight panel={D} x={1030} y={1040} w={590} h={255} from={528} to={560} />
      </ThreeCanvas>

      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(247,240,227,0.97) 0%, rgba(247,240,227,0.9) 14%, rgba(247,240,227,0) 26%)" }} />
      <Head from={0} to={130} text="Cherchez *autour de vous.*">
        <Badge delay={30} tone="dark">Web</Badge>
      </Head>
      <Head from={130} to={292} text="Filtrez par *score local.*">
        <Badge delay={20}>Pass Voyageur</Badge>
      </Head>
      <Head from={292} to={400} text="Les adresses locales *remontent.*" />
      <Head from={400} to={505} text="Chaque score *s'explique.*" />
      <Head from={505} to={560} text="La carte, *lue par l'IA.*" />

      <Sequence from={85} durationInFrames={45} layout="none">
        <Callout x={1180} y={760} anchor="center">5 min à pied · Quartier latin</Callout>
      </Sequence>
      <Sequence from={200} durationInFrames={85} layout="none">
        <Callout x={1180} y={540}>Seulement 7,5/10 et plus</Callout>
      </Sequence>
      <Sequence from={330} durationInFrames={62} layout="none">
        <Callout x={1010} y={820} anchor="center">Profil local · 8,7/10 · à 30 m</Callout>
      </Sequence>
      <Sequence from={470} durationInFrames={36} layout="none">
        <Callout x={140} y={880}>4 indicateurs, en clair</Callout>
      </Sequence>
      <Sequence from={530} durationInFrames={30} layout="none">
        <Callout x={140} y={880}>3 pages de carte analysées</Callout>
      </Sequence>
      <div style={{ position: "absolute", right: 60, bottom: 26, fontFamily: BODY, fontSize: 20, color: C.faint }}>Captures réelles · compte Pass Voyageur · Quartier latin</div>
    </AbsoluteFill>
  );
}
