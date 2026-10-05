// Scène 4 : ce que mesure le Local Signal, sur un vrai restaurant de la base
// (Les Crêpes de Louis-Marie, valeurs lues dans local_signal.db).
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Background, BODY, C, Count, FadeUp, TITLE, VerdictPill, WordReveal, useSpring, EASE } from "../ui";

const ROWS = [
  { label: "Carte du restaurant", detail: "24 plats, une seule cuisine", value: 88 },
  { label: "Langue des avis", detail: "des avis surtout écrits en français", value: 75 },
  { label: "Prix face au quartier", detail: "19 % sous la médiane voisine", value: 100 },
  { label: "Hors zone touristique", detail: "loin de la pression des monuments", value: 93 },
];

function Row({ row, delay }) {
  const frame = useCurrentFrame();
  const s = useSpring(delay);
  const fill = interpolate(frame, [delay + 8, delay + 48], [0, row.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <div style={{ opacity: s, transform: `translateX(${(1 - s) * 60}px)`, marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: TITLE, fontWeight: 700, fontSize: 38, color: C.text }}>{row.label}</div>
          <div style={{ fontFamily: BODY, fontSize: 24, color: C.muted, marginTop: 2 }}>{row.detail}</div>
        </div>
        <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 46, color: C.local, fontVariantNumeric: "tabular-nums" }}>{Math.round(fill)} %</div>
      </div>
      <div style={{ height: 16, borderRadius: 99, background: C.sunken, marginTop: 14, overflow: "hidden" }}>
        <div style={{ width: `${fill}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${C.local}, ${C.localBright})` }} />
      </div>
    </div>
  );
}

export function Signal() {
  const frame = useCurrentFrame();
  const photo = useSpring(10, { damping: 16 });
  const total = useSpring(215);
  const pill = useSpring(262, { damping: 11, stiffness: 160 });
  const rowsDim = interpolate(frame, [205, 230], [1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", top: 80, left: 150, right: 150 }}>
        <WordReveal text="Un score d'authenticité, *sans la popularité.*" size={78} align="left" />
      </div>

      {/* Le restaurant */}
      <div style={{ position: "absolute", left: 150, top: 290, width: 660, transform: `translateY(${(1 - photo) * 80}px) rotate(${(1 - photo) * -4}deg)`, opacity: photo }}>
        <div style={{ position: "relative", borderRadius: 30, overflow: "hidden", boxShadow: "0 40px 90px rgba(28,26,23,0.25)" }}>
          <Img src={staticFile("shots/crepes-photo.png")} style={{ width: 660, height: 494, objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", left: 26, bottom: 26, transform: `scale(${pill})`, transformOrigin: "left bottom" }}>
            <VerdictPill scale={1.35} />
          </div>
        </div>
        <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 44, color: C.text, marginTop: 28 }}>Les Crêpes de Louis-Marie</div>
        <div style={{ fontFamily: BODY, fontSize: 28, color: C.muted, marginTop: 4 }}>Crêperie · Paris 5e · 30 m</div>
      </div>

      {/* Les quatre indicateurs */}
      <div style={{ position: "absolute", left: 930, top: 290, width: 840, opacity: rowsDim }}>
        {ROWS.map((r, i) => (
          <Row key={r.label} row={r} delay={40 + i * 32} />
        ))}
      </div>

      <div style={{ position: "absolute", left: 930, top: 560, width: 840, opacity: total, transform: `scale(${0.8 + 0.2 * total})`, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
        <div style={{ background: C.text, color: "#fff", borderRadius: 30, padding: "30px 60px", boxShadow: "0 30px 80px rgba(28,26,23,0.35)", textAlign: "center" }}>
          <div style={{ fontFamily: BODY, fontSize: 28, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d5c9b6" }}>Local Signal</div>
          <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 130, lineHeight: 1, marginTop: 8 }}>
            <Count to={87} range={[218, 258]} />
            <span style={{ fontSize: 56, color: "#d5c9b6" }}> / 100</span>
          </div>
        </div>
      </div>

      <Sequence from={295} layout="none">
        <FadeUp style={{ position: "absolute", left: 930, bottom: 90, fontFamily: BODY, fontSize: 30, color: C.muted }}>
          Note Google et nombre d'avis : <b style={{ color: C.brand }}>exclus du calcul.</b>
        </FadeUp>
      </Sequence>
    </AbsoluteFill>
  );
}
