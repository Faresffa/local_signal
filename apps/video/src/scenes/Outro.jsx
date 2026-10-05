// Scènes 6 à 10 : le scan de carte, le mobile, la preuve, les restaurateurs, la fin.
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Background, BODY, BrowserFrame, C, CameraShot, Count, FadeUp, Logo, Phone, TITLE, VerdictPill, WordReveal, useCamera, useSpring, EASE } from "../ui";

// ---------------------------------------------------------------------------
// 6. Le scan de carte
// ---------------------------------------------------------------------------
const CHIPS = ["24 plats", "Une seule cuisine", "Une seule langue", "Pas de « menu touriste »", "Prix 19 % sous le quartier"];

function Chip({ text, delay, y }) {
  const s = useSpring(delay, { damping: 13, stiffness: 170 });
  return (
    <div style={{ position: "absolute", right: 0, top: y, transform: `translateX(${(1 - s) * 120}px) scale(${0.7 + 0.3 * s})`, transformOrigin: "right center", opacity: Math.min(1, s * 1.4), display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderRadius: 16, background: C.surface, boxShadow: "0 14px 40px rgba(28,26,23,0.16)", fontFamily: TITLE, fontWeight: 600, fontSize: 28, color: C.text, whiteSpace: "nowrap" }}>
      <span style={{ width: 30, height: 30, borderRadius: 99, background: C.localSoft, color: C.local, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>✓</span>
      {text}
    </div>
  );
}

// Lignes de plats de la carte photographiée (en % de la hauteur de l'image).
const PRICE_ROWS = [17.8, 21.6, 25.3, 29.6, 35.2, 40.9, 45.6, 51.4, 57.1, 62.8, 70.0, 88.8];

export function Scan() {
  const frame = useCurrentFrame();
  const phone = useSpring(4, { damping: 16 });
  const flash = interpolate(frame, [70, 74, 90], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scanY = interpolate(frame, [92, 170], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const scanOn = frame >= 90 && frame < 176;
  const verdict = useSpring(292, { damping: 11, stiffness: 150 });
  const PW = 400;
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 150, top: 200, width: 760 }}>
        <WordReveal text="Pas d'avis ? *Pas grave.*" size={84} align="left" delay={6} style={{ width: 1000 }} />
        <FadeUp delay={36} style={{ fontFamily: TITLE, fontWeight: 600, fontSize: 48, color: C.text, marginTop: 30, lineHeight: 1.15 }}>
          Une photo de la carte en vitrine suffit.
        </FadeUp>
        <FadeUp delay={64} style={{ fontFamily: BODY, fontSize: 32, color: C.muted, marginTop: 28, lineHeight: 1.4 }}>
          L'IA <b style={{ color: C.text }}>observe</b> la carte, sans jamais la juger. Un calcul transparent et reproductible donne le score.
        </FadeUp>
        <FadeUp delay={200} style={{ fontFamily: BODY, fontSize: 28, color: C.brand, marginTop: 40, fontWeight: 600 }}>
          Chaque scan enrichit une base de cartes que personne d'autre n'a.
        </FadeUp>
      </div>

      <div style={{ position: "absolute", left: 1020, top: 250, width: 330, height: 520 }}>
        {CHIPS.map((t, i) => (
          <Chip key={t} text={t} delay={180 + i * 16} y={i * 96} />
        ))}
      </div>

      <div style={{ position: "absolute", left: 1400, top: 100, transform: `translateY(${(1 - phone) * 500}px) rotate(${(1 - phone) * 8}deg)` }}>
        <Phone w={PW}>
          {/* Viseur : la vitrine */}
          <Img src={staticFile("shots/crepes-photo.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: frame < 74 ? 1 : 0, transform: `scale(${1.15 + frame * 0.002})` }} />
          {/* Après la photo : la carte */}
          {frame >= 74 && (
            <div style={{ position: "absolute", inset: 0, background: "#141210" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", fontFamily: BODY, fontWeight: 600, fontSize: 17, color: "#d5c9b6" }}>
                {frame < 176 ? "Lecture de la carte…" : "Carte lue · 24 plats"}
              </div>
              <div style={{ position: "absolute", left: 0, top: 110, width: "100%", aspectRatio: "1242 / 1656" }}>
                <Img src={staticFile("shots/menu-hd-3.jpg")} style={{ width: "100%", height: "100%", display: "block" }} />
                {PRICE_ROWS.map((y, i) =>
                  scanY >= y + 2 || frame >= 176 ? (
                    <div key={i} style={{ position: "absolute", left: "8%", right: "4%", top: `${y - 2}%`, height: "3.6%", border: `2px solid ${C.localBright}`, borderRadius: 4, background: "rgba(22,138,90,0.12)" }} />
                  ) : null,
                )}
                {scanOn && (
                  <>
                    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${scanY}%`, background: "rgba(22,138,90,0.10)" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, top: `${scanY}%`, height: 5, background: C.localBright, boxShadow: `0 0 30px 8px rgba(22,138,90,0.6)` }} />
                  </>
                )}
              </div>
            </div>
          )}
          {frame < 74 &&
            [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
              <div key={i} style={{ position: "absolute", width: 60, height: 60, left: x ? undefined : 40, right: x ? 40 : undefined, top: y ? undefined : 150, bottom: y ? 220 : undefined, borderColor: "#fff", borderStyle: "solid", borderWidth: `${y ? 0 : 5}px ${x ? 5 : 0}px ${y ? 5 : 0}px ${x ? 0 : 5}px`, borderRadius: 10 }} />
            ))}
          {frame < 74 && (
            <div style={{ position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)", width: 86, height: 86, borderRadius: 99, border: "6px solid #fff", background: frame > 62 ? "#fff" : "rgba(255,255,255,0.3)" }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 50, display: "flex", justifyContent: "center", transform: `scale(${verdict})` }}>
            <VerdictPill scale={1.05} />
          </div>
        </Phone>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 7. Mobile
// ---------------------------------------------------------------------------
function PhoneShot({ src, delay, x, rot, scroll = 0 }) {
  const frame = useCurrentFrame();
  const s = useSpring(delay, { damping: 16 });
  const y = interpolate(frame, [delay + 20, delay + 160], [0, scroll], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <div style={{ position: "absolute", left: x, top: 150, transform: `translateY(${(1 - s) * 700}px) rotate(${rot * s}deg)` }}>
      <Phone w={380}>
        <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -y, width: "100%" }} />
      </Phone>
    </div>
  );
}

export function Mobile() {
  const pill = useSpring(60, { damping: 13 });
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 150, top: 300, width: 760 }}>
        <WordReveal text="Dans la poche, *devant la vitrine.*" size={84} align="left" delay={4} />
        <FadeUp delay={30} style={{ fontFamily: BODY, fontSize: 34, color: C.muted, marginTop: 30, lineHeight: 1.4 }}>
          Le même produit sur le web et sur mobile : même score, mêmes explications, même compte.
        </FadeUp>
        <div style={{ display: "flex", gap: 16, marginTop: 40, transform: `scale(${pill})`, transformOrigin: "left center" }}>
          {["Web", "iOS", "Android"].map((t) => (
            <span key={t} style={{ padding: "12px 26px", borderRadius: 99, background: C.text, color: "#fff", fontFamily: TITLE, fontWeight: 700, fontSize: 28 }}>{t}</span>
          ))}
        </div>
      </div>
      <PhoneShot src="shots/m01-home.png" delay={10} x={1000} rot={-5} />
      <PhoneShot src="shots/m03-detail-top.png" delay={22} x={1400} rot={4} scroll={140} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 8. La preuve : ce qui a été mesuré
// ---------------------------------------------------------------------------
function Stat({ to, label, delay }) {
  const s = useSpring(delay);
  return (
    <div style={{ flex: 1, opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>
      <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 124, color: C.brand, letterSpacing: "-0.04em", lineHeight: 1 }}>
        <Count to={to} range={[delay, delay + 45]} />
      </div>
      <div style={{ fontFamily: BODY, fontSize: 30, color: C.muted, marginTop: 14, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function Bar({ label, value, color, delay }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [delay, delay + 40], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const s = useSpring(delay - 6);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 26, opacity: s }}>
      <div style={{ width: 300, fontFamily: TITLE, fontWeight: 700, fontSize: 36, color: C.text }}>{label}</div>
      <div style={{ flex: 1, height: 54, background: C.sunken, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ width: `${(w / 0.4) * 100}%`, height: "100%", background: color, borderRadius: 14 }} />
      </div>
      <div style={{ width: 130, fontFamily: TITLE, fontWeight: 800, fontSize: 44, color, fontVariantNumeric: "tabular-nums" }}>{w.toFixed(2).replace(".", ",")}</div>
    </div>
  );
}

export function Proof() {
  const frame = useCurrentFrame();
  const up = interpolate(frame, [150, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <AbsoluteFill>
      <Background glow={false} />
      <div style={{ position: "absolute", left: 150, top: 90 }}>
        <WordReveal text="Mesuré, *pas décrété.*" size={84} align="left" delay={2} />
      </div>
      <div style={{ position: "absolute", left: 150, right: 150, top: 300 - up * 60, display: "flex", gap: 80, opacity: 1 - up * 0.55, transform: `scale(${1 - up * 0.25})`, transformOrigin: "left top" }}>
        <Stat to={10644} label="restaurants parisiens analysés" delay={18} />
        <Stat to={467} label="restaurants classés par un panel, rue par rue" delay={34} />
        <Stat to={4528} label="comparaisons deux à deux pour les départager" delay={50} />
      </div>
      <Sequence from={170} layout="none">
        <div style={{ position: "absolute", left: 150, right: 150, top: 540 }}>
          <FadeUp style={{ fontFamily: TITLE, fontWeight: 700, fontSize: 46, color: C.text }}>
            Adresses <span style={{ color: C.brand }}>peu connues</span> (moins de 300 avis) : qui colle le mieux au terrain ?
          </FadeUp>
          <Bar label="Local Signal" value={0.33} color={C.local} delay={20} />
          <Bar label="Note Google" value={0.18} color="#9b9186" delay={34} />
          <FadeUp delay={70} style={{ fontFamily: BODY, fontSize: 24, color: C.faint, marginTop: 26 }}>
            Corrélation de rang avec le classement de terrain, 85 restaurants du Quartier latin. Écart indicatif, en cours de consolidation.
          </FadeUp>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 9. Restaurateurs
// ---------------------------------------------------------------------------
export function Restaurateurs() {
  const enter = useSpring(0, { damping: 18 });
  const cam = useCamera([
    { at: 0, cx: 960, cy: 540, z: 1 },
    { at: 30, cx: 960, cy: 540, z: 1 },
    { at: 90, cx: 900, cy: 560, z: 1.6 },
    { at: 210, cx: 900, cy: 560, z: 1.6 },
  ]);
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 150, top: 230, width: 720 }}>
        <FadeUp style={{ fontFamily: BODY, fontSize: 30, color: C.brand, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Pour les restaurateurs</FadeUp>
        <WordReveal text="Gratuit. Et *rien à acheter* pour monter." size={76} align="left" delay={10} style={{ marginTop: 20 }} />
        <FadeUp delay={45} style={{ fontFamily: BODY, fontSize: 32, color: C.muted, marginTop: 30, lineHeight: 1.4 }}>
          Revendiquer sa fiche, déposer sa devanture, suivre ses visites. Le score, lui, se calcule sans eux.
        </FadeUp>
      </div>
      <div style={{ position: "absolute", left: 920, top: 250, transform: `translateX(${(1 - enter) * 400}px) perspective(1800px) rotateY(${-10 + (1 - enter) * -20}deg)` }}>
        <BrowserFrame w={880} h={495}>
          <CameraShot src="shots/d10-restaurateurs-full.png" iw={1920} ih={1080} w={880} h={495} cam={cam} />
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 10. Fin
// ---------------------------------------------------------------------------
export function Final({ duration }) {
  const frame = useCurrentFrame();
  const s = useSpring(4, { damping: 14, stiffness: 110 });
  const black = interpolate(frame, [duration - 25, duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * s})`, opacity: s }}>
          <Logo width={820} />
        </div>
        <div style={{ marginTop: 10 }}>
          <WordReveal text="Mangez là où mangent *les habitants.*" delay={24} size={64} weight={700} />
        </div>
        <FadeUp delay={60} style={{ fontFamily: BODY, fontSize: 28, color: C.muted, marginTop: 44, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Paris · Web · iOS · Android
        </FadeUp>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </AbsoluteFill>
  );
}
