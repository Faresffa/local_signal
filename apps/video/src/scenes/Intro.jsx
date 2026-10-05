// Scènes 1 à 3 : l'accroche, le problème, l'apparition de la marque.
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Background, BODY, C, Count, FadeUp, TITLE, WordReveal, useSpring } from "../ui";

// ---------------------------------------------------------------------------
// 1. Accroche
// ---------------------------------------------------------------------------
const PINS = [
  [220, 240, 30], [1640, 210, 44], [340, 820, 60], [1500, 860, 20], [980, 150, 76],
  [120, 560, 90], [1780, 560, 52], [760, 930, 36], [1230, 930, 84], [600, 200, 100],
];

function Pin({ x, y, delay }) {
  const frame = useCurrentFrame();
  const s = useSpring(delay, { damping: 10, stiffness: 180 });
  const bob = Math.sin((frame - delay) / 14) * 6;
  return (
    <div style={{ position: "absolute", left: x, top: y + bob, transform: `translate(-50%,-100%) scale(${s})`, opacity: 0.9 }}>
      <svg width="44" height="58" viewBox="0 0 24 32">
        <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0z" fill={C.brand} />
        <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
      </svg>
    </div>
  );
}

export function Hook() {
  const frame = useCurrentFrame();
  const out1 = interpolate(frame, [88, 100], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background />
      {PINS.map(([x, y, d], i) => (
        <Pin key={i} x={x} y={y} delay={d} />
      ))}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 160 }}>
        <Sequence durationInFrames={100} layout="none">
          <div style={{ opacity: out1, transform: `translateY(${(1 - out1) * -30}px)` }}>
            <WordReveal text="Vous arrivez dans une ville *inconnue.*" delay={6} size={104} />
            <FadeUp delay={40} style={{ marginTop: 34, textAlign: "center", fontFamily: BODY, fontSize: 40, color: C.muted }}>
              Il est 13 h. Vous avez faim.
            </FadeUp>
          </div>
        </Sequence>
        <Sequence from={100} layout="none">
          <WordReveal text="Mais où mangent *vraiment les habitants* ?" delay={2} size={112} style={{ maxWidth: 1500 }} />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 2. Le problème : la popularité rend les adresses de quartier invisibles
// ---------------------------------------------------------------------------
function PopularCard({ delay, rating, reviews, hue }) {
  const s = useSpring(delay, { damping: 14, stiffness: 150 });
  return (
    <div style={{ width: 360, borderRadius: 26, background: C.surface, boxShadow: "0 24px 60px rgba(28,26,23,0.14)", overflow: "hidden", transform: `translateY(${(1 - s) * 80}px) scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s * 1.3) }}>
      <div style={{ height: 190, background: `linear-gradient(135deg, hsl(${hue} 30% 78%), hsl(${hue + 30} 25% 62%))` }} />
      <div style={{ padding: "24px 28px 28px" }}>
        <div style={{ width: "70%", height: 20, borderRadius: 8, background: C.sunken }} />
        <div style={{ width: "45%", height: 14, borderRadius: 8, background: C.sunken, marginTop: 12 }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 22, fontFamily: TITLE }}>
          <span style={{ fontSize: 46, fontWeight: 800, color: "#e3a008" }}>★ {rating}</span>
          <span style={{ fontSize: 26, fontWeight: 600, color: C.muted }}>
            <Count to={reviews} range={[delay, delay + 40]} /> avis
          </span>
        </div>
      </div>
    </div>
  );
}

export function Problem() {
  const frame = useCurrentFrame();
  const swap = interpolate(frame, [140, 152], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const small = useSpring(96, { damping: 14 });
  const fade = interpolate(frame, [125, 165], [1, 0.28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardsUp = interpolate(frame, [150, 175], [0, -40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background glow={false} />
      <div style={{ position: "absolute", top: 90, left: 0, right: 0, height: 240, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "absolute", opacity: swap }}>
          <WordReveal text="Les applis classent par *popularité.*" delay={4} size={84} />
        </div>
        {frame >= 146 && (
          <div style={{ position: "absolute", width: 1600 }}>
            <WordReveal text="Les adresses de quartier ne sont pas mal notées." delay={0} size={66} stagger={2} color={C.muted} weight={600} />
            <WordReveal text="*Elles sont invisibles.*" delay={22} size={84} />
          </div>
        )}
      </div>
      <div style={{ position: "absolute", top: 390, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 44, transform: `translateY(${cardsUp}px)` }}>
        <PopularCard delay={24} rating="4,6" reviews={28389} hue={20} />
        <PopularCard delay={34} rating="4,4" reviews={11364} hue={200} />
        <PopularCard delay={44} rating="4,5" reviews={10760} hue={90} />
        <div style={{ width: 260, alignSelf: "flex-end", marginBottom: -30, borderRadius: 22, background: C.surface, border: `2px dashed ${C.border}`, padding: 22, opacity: Math.min(small, fade), transform: `translateY(${(1 - small) * 60 + 70}px)` }}>
          <div style={{ height: 110, borderRadius: 14, background: `linear-gradient(135deg, #e9d5c2, #c9a88b)` }} />
          <div style={{ fontFamily: TITLE, fontWeight: 700, fontSize: 26, color: C.text, marginTop: 14 }}>Le resto du coin</div>
          <div style={{ fontFamily: BODY, fontSize: 22, color: C.muted, marginTop: 4 }}>12 avis · page 9</div>
        </div>
      </div>
      <Sequence from={185} layout="none">
        <FadeUp delay={0} style={{ position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center", fontFamily: BODY, fontSize: 30, color: C.muted }}>
          Quartier latin : <b style={{ color: C.text }}>les 10 restaurants les plus commentés</b> sont tous dans la moitié la plus touristique de notre classement de terrain.
        </FadeUp>
      </Sequence>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 3. La marque : l'animation officielle du logo (apps/web/public), 5 s
// ---------------------------------------------------------------------------
// Images extraites de localsignal-logo-animated.mp4 : le fichier vidéo a une
// image que le moteur de rendu ne sait pas décoder (~2,5 s).
const LOGO_FRAMES = 150;
function LogoFrames() {
  const frame = useCurrentFrame();
  const i = Math.min(LOGO_FRAMES - 1, Math.max(0, frame));
  return <Img src={staticFile(`logo-frames/${String(i).padStart(3, "0")}.jpg`)} style={{ width: 1080, height: 1080, marginTop: -60 }} />;
}

export function BrandReveal() {
  return (
    <AbsoluteFill style={{ background: "#fefaf2" }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <LogoFrames />
      </AbsoluteFill>
      <Sequence from={58} layout="none">
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 170 }}>
          <WordReveal text="Mangez là où mangent *les habitants.*" size={62} color={C.text} weight={600} />
        </div>
      </Sequence>
    </AbsoluteFill>
  );
}
