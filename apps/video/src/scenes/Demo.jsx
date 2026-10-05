// Scène 5 : l'application web, filmée avec le compte abonné de démonstration.
// Les captures viennent de capture/capture.mjs (public/shots/).
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Background, BrowserFrame, C, Callout, CameraShot, Cursor, TITLE, WordReveal, useCamera, useSpring, BODY } from "../ui";

const W = 1440;
const H = 810;

/** Couche d'image qui apparaît en fondu entre `from` et `to`. */
function Layer({ src, from, to, fade = 6 }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [from, from + fade, to - 1, to], [0, 1, 1, to >= 9999 ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < from || frame > to) return null;
  return <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: o }} />;
}

/** Première partie : recherche, filtre abonné, résultats (même gabarit 1920×1080). */
function Search() {
  const frame = useCurrentFrame();
  const cam = useCamera([
    { at: 0, cx: 960, cy: 540, z: 1 },
    { at: 25, cx: 960, cy: 540, z: 1 },
    { at: 75, cx: 960, cy: 250, z: 1.55 },
    { at: 118, cx: 960, cy: 250, z: 1.55 },
    { at: 150, cx: 560, cy: 640, z: 1.45 },
    { at: 190, cx: 480, cy: 760, z: 1.8 },
    { at: 262, cx: 480, cy: 760, z: 1.8 },
    { at: 300, cx: 960, cy: 600, z: 1.15 },
    { at: 335, cx: 1080, cy: 860, z: 1.9 },
    { at: 372, cx: 1080, cy: 860, z: 1.9 },
    { at: 405, cx: 1470, cy: 520, z: 1.75 },
    { at: 440, cx: 1470, cy: 520, z: 1.75 },
  ]);
  const cursorOut = interpolate(frame, [275, 290], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <CameraShot src="shots/d01-home.png" iw={1920} ih={1080} w={W} h={H} cam={cam}>
      <Layer src="shots/d03-filter-open.png" from={152} to={9999} />
      <Layer src="shots/d04-filter-set.png" from={226} to={9999} fade={4} />
      <Layer src="shots/d05-filtered.png" from={262} to={9999} fade={10} />
      <div style={{ opacity: cursorOut }}>
        <Cursor
          path={[
            { at: 118, x: 1100, y: 640 },
            { at: 148, x: 400, y: 698 },
            { at: 180, x: 300, y: 792 },
            { at: 188, x: 300, y: 792 },
            { at: 226, x: 466, y: 792 },
            { at: 236, x: 466, y: 792 },
            { at: 256, x: 560, y: 930 },
          ]}
          clicks={[150, 188, 258]}
        />
      </div>
    </CameraShot>
  );
}

function Detail() {
  const cam = useCamera([
    { at: 0, cx: 960, cy: 540, z: 1 },
    { at: 20, cx: 960, cy: 540, z: 1 },
    { at: 70, cx: 1330, cy: 800, z: 1.7 },
    { at: 150, cx: 1330, cy: 800, z: 1.7 },
  ]);
  return <CameraShot src="shots/d08-detail-calc-full.png" iw={1920} ih={1621} w={W} h={H} cam={cam} />;
}

function Menus() {
  const cam = useCamera([
    { at: 0, cx: 1330, cy: 1000, z: 1.2 },
    { at: 60, cx: 1330, cy: 1170, z: 1.9 },
    { at: 110, cx: 1330, cy: 1170, z: 1.95 },
  ]);
  return <CameraShot src="shots/d09-carte-full.png" iw={1920} ih={1970} w={W} h={H} cam={cam} />;
}

function Headline({ from, to, text, children }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const o = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <div style={{ position: "absolute", left: 240, top: 58, opacity: o, display: "flex", alignItems: "center", gap: 26 }}>
        <WordReveal text={text} size={62} align="left" stagger={2} />
        {children}
      </div>
    </Sequence>
  );
}

function PassBadge({ delay }) {
  const s = useSpring(delay, { damping: 12, stiffness: 160 });
  return (
    <div style={{ transform: `scale(${s})`, padding: "10px 22px", borderRadius: 99, background: C.localSoft, color: C.local, fontFamily: TITLE, fontWeight: 700, fontSize: 28 }}>
      Pass Voyageur
    </div>
  );
}

export function Demo() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18 });
  const dOpacity = interpolate(frame, [440, 452], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const mOpacity = interpolate(frame, [585, 597], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background glow={false} />
      <Headline from={0} to={120} text="Cherchez *autour de vous.*" />
      <Headline from={120} to={300} text="Filtrez par *score local.*">
        <PassBadge delay={20} />
      </Headline>
      <Headline from={300} to={445} text="Les adresses locales *remontent.*" />
      <Headline from={445} to={590} text="Chaque score *s'explique.*" />
      <Headline from={590} to={700} text="La carte, *lue automatiquement.*" />

      <div style={{ position: "absolute", left: 240, top: 170, transform: `translateY(${(1 - enter) * 300}px) perspective(2000px) rotateX(${(1 - enter) * 18}deg)`, transformOrigin: "center top" }}>
        <BrowserFrame w={W} h={H}>
          <Search />
          <div style={{ position: "absolute", inset: 0, opacity: dOpacity }}>
            <Sequence from={440} layout="none">
              <Detail />
            </Sequence>
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: mOpacity }}>
            <Sequence from={585} layout="none">
              <Menus />
            </Sequence>
          </div>
        </BrowserFrame>

        {/* Annotations, en coordonnées de la fenêtre */}
        <Sequence from={60} durationInFrames={60} layout="none">
          <Callout x={1100} y={700} anchor="center">Autour de moi · à pied</Callout>
        </Sequence>
        <Sequence from={195} durationInFrames={100} layout="none">
          <Callout x={1060} y={640}>Seulement 7,5/10 et plus</Callout>
        </Sequence>
        <Sequence from={340} durationInFrames={50} layout="none">
          <Callout x={300} y={250}>Profil local · 8,7/10 · à 30 m</Callout>
        </Sequence>
        <Sequence from={395} durationInFrames={50} layout="none">
          <Callout x={120} y={620}>20 profils locaux à 10 min à pied</Callout>
        </Sequence>
        <Sequence from={515} durationInFrames={75} layout="none">
          <Callout x={130} y={420}>4 indicateurs, en clair</Callout>
        </Sequence>
        <Sequence from={640} durationInFrames={60} layout="none">
          <Callout x={120} y={560}>Photo de carte → plats, prix, langues</Callout>
        </Sequence>
      </div>
      <div style={{ position: "absolute", right: 240, bottom: 20, fontFamily: BODY, fontSize: 20, color: C.faint }}>Captures réelles de l'application · compte abonné</div>
    </AbsoluteFill>
  );
}

export const DEMO_DURATION = 700;
