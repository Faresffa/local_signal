// Version verticale 9:16 pour TikTok / Instagram Reels (~28 s), ton léger.
// Objectif : faire acheter un premier Pass Voyageur.
//
// Les blagues restent accrochées à ce que mesure vraiment l'app (carte en
// plusieurs langues, nombre d'avis qui ne dit rien de l'ancrage local…) et ne
// visent aucun restaurant réel. Tous les restaurants montrés ont leur vraie
// photo (featured.json).
//
// Rythme calé sur 120 BPM (1 temps = 15 images) pour qu'un son tendance
// ajouté dans l'app tombe juste. Zones sûres : aucun texte au-dessus de
// y = 250 (barre du haut), sous y = 1500 (légende, boutons) ni dans les
// 130 px de droite (colonne d'actions).
import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import featured from "../../public/data/featured.json";
import { BODY, C, TITLE, VerdictPill, useSpring } from "../ui";
import { CameraRig, K, OUT, ramp } from "../v3/three";
import { Towers } from "../v3/towers";

// ---------------------------------------------------------------------------
// Typo « slam » : chaque ligne tombe à l'écran avec un léger rebond.
// `hl` : la ligne est posée sur un bandeau rouge (mot-clé).
// ---------------------------------------------------------------------------
function Slam({ children, at, hl = false, size = 112, color = C.text, bg = C.brand }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 220, mass: 0.6 } });
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          fontFamily: TITLE, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.035em",
          color: hl ? "#fff" : color, background: hl ? bg : "transparent", padding: hl ? "4px 22px 12px" : 0,
          borderRadius: hl ? 18 : 0, transform: `scale(${1.5 - 0.5 * s}) rotate(${hl ? -2 : 0}deg)`, transformOrigin: "left center",
          opacity: Math.min(1, s * 2), marginTop: hl ? 14 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Petite ligne d'aparté (le « chuchoté » des vidéos TikTok). */
function Aside({ at, children, color = C.muted, size = 40 }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps: 30, config: { damping: 200 } });
  return <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: size, color, marginTop: 20, opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>{children}</div>;
}

/** Bloc de texte dans la zone sûre, qui disparaît net à `to`. */
function Block({ from, to, top = 280, children }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  return <div style={{ position: "absolute", left: 70, right: 130, top }}>{children}</div>;
}

/** Secousse brève sur les temps forts. */
function useShake(hits, amp = 14) {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const h of hits) {
    const d = frame - h;
    if (d >= 0 && d < 8) {
      const k = (1 - d / 8) * amp;
      x += Math.sin(d * 2.7) * k;
      y += Math.cos(d * 3.1) * k * 0.6;
    }
  }
  return `translate(${x}px, ${y}px)`;
}

/** Trame de couverts qui défile, en fond. */
function Grid({ opacity = 0.5, invert = false }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundImage: `url(${staticFile("motif-couverts.svg")})`, backgroundSize: "300px 300px", backgroundPosition: `0px ${frame * 2}px`, opacity, filter: invert ? "invert(1)" : undefined }} />;
}

// ---------------------------------------------------------------------------
// Téléphone : capture réelle de l'app mobile, avec zooms « punch ».
// keys = [{at, fx, fy, z}] : point focal en pixels de capture (1170 × 2532).
// ---------------------------------------------------------------------------
const SW = 760;
const SH = SW * (2532 / 1170);

function Screen({ src, keys }) {
  const frame = useCurrentFrame();
  const ats = keys.map((k) => k.at);
  const opt = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: OUT };
  const pick = (p) => (keys.length === 1 ? keys[0][p] : interpolate(frame, ats, keys.map((k) => k[p]), opt));
  const z = pick("z");
  const s = (SW / 1170) * z;
  let tx = SW / 2 - pick("fx") * s;
  let ty = SH / 2 - pick("fy") * s;
  tx = Math.min(0, Math.max(SW - 1170 * s, tx));
  ty = Math.min(0, Math.max(SH - 2532 * s, ty));
  return <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: 0, width: 1170, height: 2532, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" }} />;
}

function PhoneShell({ children, tilt = 0, y = 0 }) {
  return (
    <div style={{ position: "absolute", left: (1080 - SW - 36) / 2, top: 560 + y, perspective: 2200 }}>
      <div style={{ transform: `rotateY(${tilt}deg) rotateX(${tilt * 0.3}deg)`, transformOrigin: "center top", width: SW + 36, height: SH + 36, borderRadius: 96, background: "#17150f", padding: 18, boxShadow: "0 60px 140px rgba(28,26,23,0.45)" }}>
        <div style={{ position: "relative", width: SW, height: SH, borderRadius: 80, overflow: "hidden", background: C.bg }}>
          {children}
          <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", width: 200, height: 56, borderRadius: 99, background: "#17150f" }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. POV : la carte en 7 langues (une carte générique, aucun vrai resto)
// ---------------------------------------------------------------------------
const MENUS = ["MENU", "MENÚ", "SPEISEKARTE", "MENU TOURISTIQUE", "メニュー", "菜单", "МЕНЮ", "CARDÁPIO"];

function PovMenu() {
  const frame = useCurrentFrame();
  const shake = useShake([18, 60, 66], 16);
  const fall = ramp(frame, 62, 80);
  return (
    <AbsoluteFill style={{ background: K.bg, transform: shake }}>
      <Grid />
      {/* La carte « plastifiée », qui s'empile de langues */}
      <div style={{ position: "absolute", left: 150, top: 700, width: 780, height: 780, transform: `translateY(${fall * 1400}px) rotate(${-4 + fall * 30}deg)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "#fff", boxShadow: "0 50px 120px rgba(28,26,23,0.3)", border: `10px solid ${C.sunken}` }} />
        {MENUS.map((m, i) => {
          const at = 8 + i * 5;
          if (frame < at) return null;
          const s = spring({ frame: frame - at, fps: 30, config: { damping: 11, stiffness: 260, mass: 0.5 } });
          const rot = ((i * 29) % 15) - 7;
          return (
            <div key={m} style={{ position: "absolute", left: 50 + ((i * 71) % 180), top: 40 + i * 86, transform: `scale(${1.8 - 0.8 * s}) rotate(${rot}deg)`, opacity: Math.min(1, s * 2), fontFamily: TITLE, fontWeight: 800, fontSize: 64, color: i === 3 ? C.brand : C.text, whiteSpace: "nowrap" }}>
              {m}
            </div>
          );
        })}
      </div>
      <Block from={0} to={62} top={270}>
        <Slam at={0} size={80} color={C.muted}>POV :</Slam>
        <Slam at={6} size={96}>la carte est</Slam>
        <Slam at={12} size={96}>en 7 langues.</Slam>
      </Block>
      <Block from={62} to={100} top={560}>
        <Slam at={62} size={104}>Spoiler :</Slam>
        <Slam at={68} size={104} hl>les habitants</Slam>
        <Slam at={74} size={104} hl>mangent ailleurs.</Slam>
      </Block>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 2. La ville 3D : les + commentés contre ceux du quartier
// ---------------------------------------------------------------------------
function CityVertical() {
  return (
    <ThreeCanvas width={1080} height={1920} camera={{ fov: 50, position: [0, 14, 9] }}>
      <color attach="background" args={[K.bg]} />
      <fog attach="fog" args={[K.bg, 14, 34]} />
      <hemisphereLight args={["#fffaf0", "#d9ccb5", 1.1]} />
      <directionalLight position={[8, 14, 6]} intensity={1.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={K.ground} roughness={1} />
      </mesh>
      <CameraRig
        keys={[
          { at: 0, pos: [3, 7.5, 10.5], look: [-0.2, 0.2, 0.6], fov: 50 },
          { at: 60, pos: [-4, 6.5, 9.5], look: [-0.2, 0.3, 0.6] },
          { at: 120, pos: [-1.5, 3.2, 5.5], look: [-0.38, 0.3, 0.84] },
        ]}
      />
      <Towers appear={-40} appearSpeed={2} pop={[0, 22]} fall={[50, 60]} flip={62} grow={[64, 100]} green={[62, 78]} />
    </ThreeCanvas>
  );
}

function CityFlip() {
  const frame = useCurrentFrame();
  const shake = useShake([0, 50, 64], 14);
  const flash = interpolate(frame, [48, 52, 62], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: K.bg, transform: shake }}>
      <CityVertical />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(247,240,227,0) 10%, rgba(247,240,227,0.93) 16%, rgba(247,240,227,0.93) 40%, rgba(247,240,227,0) 52%)" }} />
      <Block from={0} to={50}>
        <Slam at={2} size={92}>Les applis te montrent</Slam>
        <Slam at={10} size={92} hl bg={K.gold}>les + commentés.</Slam>
        <Aside at={24}>(10 000 avis. Combien de voisins ?)</Aside>
      </Block>
      <Block from={52} to={130}>
        <Slam at={54} size={92}>Nous, on te montre</Slam>
        <Slam at={62} size={92} hl bg={K.localDeep}>ceux du quartier.</Slam>
        <Sequence from={80} layout="none">
          <Logo />
        </Sequence>
      </Block>
      {frame >= 62 && (
        <div style={{ position: "absolute", left: 70, top: 1430, fontFamily: BODY, fontSize: 30, color: C.muted, fontWeight: 600 }}>
          1 tour = 1 vrai resto parisien. Hauteur = <b style={{ color: C.local }}>Local Signal</b>.
        </div>
      )}
      <AbsoluteFill style={{ background: C.brand, opacity: flash }} />
    </AbsoluteFill>
  );
}

function Logo() {
  const s = useSpring(0, { damping: 11, stiffness: 170 });
  return <Img src={staticFile("logo-alpha.png")} style={{ width: 540, height: 270, objectFit: "contain", marginTop: 20, transform: `scale(${s}) rotate(${(1 - s) * -8}deg)`, transformOrigin: "left center" }} />;
}

// ---------------------------------------------------------------------------
// 3. L'app : autour de toi, puis le « pourquoi »
// ---------------------------------------------------------------------------
function AppDemo() {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: 30, config: { damping: 16, stiffness: 120 } });
  const shake = useShake([0, 45, 105, 150], 10);
  return (
    <AbsoluteFill style={{ background: K.bg, transform: shake }}>
      <Grid />
      <PhoneShell tilt={(1 - enter) * 40 + Math.sin(frame / 30) * 3} y={(1 - enter) * 900}>
        {frame < 105 ? (
          <Screen src="shots/m01-discover.png" keys={[{ at: 0, fx: 585, fy: 1266, z: 1 }, { at: 30, fx: 585, fy: 1266, z: 1 }, { at: 48, fx: 640, fy: 1380, z: 1.75 }, { at: 105, fx: 700, fy: 1420, z: 1.85 }]} />
        ) : (
          <Screen src="shots/m04-detail-bas.png" keys={[{ at: 105, fx: 585, fy: 700, z: 1.0 }, { at: 150, fx: 585, fy: 620, z: 1.28 }, { at: 225, fx: 585, fy: 600, z: 1.32 }]} />
        )}
      </PhoneShell>
      <Block from={0} to={105} top={270}>
        <Slam at={4} size={96}>Autour de toi,</Slam>
        <Slam at={12} size={96}>à pied.</Slam>
        <Slam at={45} size={96} hl>Classé local,</Slam>
        <Slam at={53} size={96}>pas hype.</Slam>
      </Block>
      <Block from={105} to={225} top={270}>
        <Slam at={108} size={96}>Et on t'explique</Slam>
        <Slam at={116} size={96} hl>pourquoi.</Slam>
        <Aside at={135}>Sans blabla. Promis.</Aside>
      </Block>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 4. Le scan : pas d'avis, une photo de la carte suffit
// ---------------------------------------------------------------------------
const ROWS = [17.8, 21.6, 25.3, 29.6, 35.2, 40.9, 45.6, 51.4, 57.1, 62.8, 70.0, 88.8];

function ScanShot() {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [26, 30, 42], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweep = ramp(frame, 34, 86);
  const menuH = SW * (1656 / 1242);
  const menuTop = (SH - menuH) / 2;
  const verdict = useSpring(92, { damping: 10, stiffness: 190 });
  const shake = useShake([30, 92], 16);
  return (
    <AbsoluteFill style={{ background: K.bg, transform: shake }}>
      <Grid />
      <PhoneShell tilt={Math.sin(frame / 25) * 4}>
        {frame < 30 ? (
          <Img src={staticFile("photos/osm_n6226490387.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.2 + frame * 0.004})` }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#141210" }}>
            <Img src={staticFile("shots/menu-hd-3.jpg")} style={{ position: "absolute", left: 0, top: menuTop, width: SW, height: menuH }} />
            {ROWS.map((r, i) =>
              sweep * 100 > r + 2 ? <div key={i} style={{ position: "absolute", left: SW * 0.07, right: SW * 0.04, top: menuTop + (r / 100) * menuH - 16, height: 32, borderRadius: 6, border: `3px solid ${C.localBright}`, background: "rgba(22,138,90,0.15)" }} /> : null,
            )}
            {frame < 90 && <div style={{ position: "absolute", left: 0, right: 0, top: menuTop + sweep * menuH, height: 8, background: C.localBright, boxShadow: "0 0 40px 14px rgba(22,138,90,0.6)" }} />}
          </div>
        )}
        {frame < 30 &&
          [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
            <div key={i} style={{ position: "absolute", width: 110, height: 110, left: x ? undefined : 70, right: x ? 70 : undefined, top: y ? undefined : 300, bottom: y ? 380 : undefined, borderColor: "#fff", borderStyle: "solid", borderWidth: `${y ? 0 : 8}px ${x ? 8 : 0}px ${y ? 8 : 0}px ${x ? 0 : 8}px`, borderRadius: 16 }} />
          ))}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, display: "flex", justifyContent: "center", transform: `scale(${verdict})` }}>
          <VerdictPill scale={1.9} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
      </PhoneShell>
      <Block from={0} to={120} top={270}>
        <Slam at={2} size={96}>Zéro avis ?</Slam>
        <Slam at={34} size={96} hl>Scanne la carte.</Slam>
        <Aside at={60}>L'IA la lit à ta place.</Aside>
      </Block>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 5. Rafale : une cuisine par temps, chaque resto avec sa vraie photo
// ---------------------------------------------------------------------------
const CUISINES = [
  ["Louis-Marie", "Crêpes."],
  ["Li Beyrouth", "Libanais."],
  ["El Picaflor", "Péruvien."],
  ["Seoul Mama", "Coréen."],
  ["Sushi Fresh", "Sushi."],
  ["Little Napoli", "Pizza."],
  ["La Rose de Damas", "Syrien."],
  ["Pasta & Fagioli", "Pâtes."],
  ["Les Saveurs d'Abyssinie", "Éthiopien."],
];
const RAFALE = CUISINES.map(([n, label]) => ({ ...featured.find((f) => f.name.includes(n)), label })).filter((r) => r.id);
const STEP = 10;

function Burst() {
  const frame = useCurrentFrame();
  const shake = useShake(RAFALE.map((_, i) => i * STEP), 9);
  const idx = Math.min(RAFALE.length - 1, Math.floor(frame / STEP));
  const done = frame >= RAFALE.length * STEP + 4;
  return (
    <AbsoluteFill style={{ background: K.bg, transform: shake }}>
      <Grid />
      {RAFALE.slice(0, idx + 1).map((r, i) => {
        const d = frame - i * STEP;
        const s = spring({ frame: d, fps: 30, config: { damping: 14, stiffness: 260, mass: 0.5 } });
        const rot = ((i * 37) % 13) - 6;
        const off = ((i * 53) % 90) - 45;
        return (
          <Img
            key={r.id}
            src={staticFile(`cards/${r.id}.png`)}
            style={{ position: "absolute", left: 160 + off, top: 520 + (i % 3) * 14, width: 760, height: 988, transform: `scale(${1.35 - 0.35 * s}) rotate(${rot * s}deg)`, opacity: Math.min(1, s * 2), filter: "drop-shadow(0 40px 60px rgba(28,26,23,0.3))" }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 70, right: 130, top: 280 }}>
        {!done ? (
          <Slam key={idx} at={idx * STEP} size={120} hl>{RAFALE[idx].label}</Slam>
        ) : (
          <>
            <Slam at={RAFALE.length * STEP + 4} size={96}>Que des adresses</Slam>
            <Slam at={RAFALE.length * STEP + 10} size={96} hl bg={K.localDeep}>de quartier.</Slam>
          </>
        )}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 6. Appel à l'action : le Pass Week-end (tarif D-063, Pricing.jsx)
// ---------------------------------------------------------------------------
function CTA() {
  const frame = useCurrentFrame();
  const price = useSpring(18, { damping: 9, stiffness: 180 });
  const card = useSpring(4, { damping: 13, stiffness: 150 });
  const pulse = 1 + 0.035 * Math.sin((frame - 70) / 5) * (frame > 70 ? 1 : 0);
  const shake = useShake([18, 70], 14);
  return (
    <AbsoluteFill style={{ background: C.brand, transform: shake }}>
      <Grid invert opacity={0.12} />
      <div style={{ position: "absolute", left: 70, right: 130, top: 290 }}>
        <Slam at={2} size={96} color="#fff">Tu visites Paris</Slam>
        <Slam at={10} size={96} color="#fff">ce week-end ?</Slam>
      </div>
      <div style={{ position: "absolute", left: 90, right: 150, top: 620, transform: `scale(${(0.6 + 0.4 * card) * pulse}) rotate(${(1 - card) * 8 - 1.5}deg)`, opacity: card, background: "#fffbf3", borderRadius: 48, padding: "50px 56px 54px", boxShadow: "0 50px 120px rgba(0,0,0,0.35)" }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: "0.12em", textTransform: "uppercase", color: C.brand }}>Pass Week-end</div>
        <div style={{ fontFamily: TITLE, fontWeight: 800, fontSize: 210, lineHeight: 1, letterSpacing: "-0.05em", color: C.text, marginTop: 10, transform: `scale(${0.5 + 0.5 * price})`, transformOrigin: "left center" }}>
          2,99&nbsp;€
        </div>
        <div style={{ fontFamily: BODY, fontSize: 36, color: C.muted, marginTop: 14, lineHeight: 1.35 }}>
          3 jours · paiement unique
          <br />
          <b style={{ color: C.text }}>sans abonnement</b>
        </div>
      </div>
      <Sequence from={40} layout="none">
        <Pop style={{ position: "absolute", left: 90, right: 150, top: 1170, textAlign: "center", fontFamily: TITLE, fontWeight: 700, fontSize: 40, color: "#fff", lineHeight: 1.2 }}>
          (Moins cher qu'un expresso en terrasse.)
        </Pop>
      </Sequence>
      <Sequence from={64} layout="none">
        <Pop style={{ position: "absolute", left: 0, right: 0, top: 1285, display: "flex", justifyContent: "center" }}>
          <div style={{ padding: "22px 52px", borderRadius: 999, background: C.text, color: "#fff", fontFamily: TITLE, fontWeight: 800, fontSize: 54 }}>Lien en bio</div>
        </Pop>
      </Sequence>
      <Sequence from={84} layout="none">
        <Pop style={{ position: "absolute", left: 0, right: 0, top: 1415, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 28, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fde4e6" }}>
          Local Signal · Web · iOS · Android
        </Pop>
      </Sequence>
    </AbsoluteFill>
  );
}

function Pop({ children, style }) {
  const s = useSpring(0, { damping: 12, stiffness: 180 });
  return <div style={{ ...style, opacity: s, transform: `scale(${0.7 + 0.3 * s})` }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Montage : coupes franches, calées sur les temps.
// ---------------------------------------------------------------------------
const PARTS = [
  [PovMenu, 100],
  [CityFlip, 130],
  [AppDemo, 225],
  [ScanShot, 120],
  [Burst, 120],
  [CTA, 170],
];

export const SOCIAL_TOTAL = PARTS.reduce((a, [, d]) => a + d, 0);

export function Social() {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      {PARTS.map(([Part, d], i) => {
        const el = (
          <Sequence key={i} from={from} durationInFrames={d}>
            <Part />
          </Sequence>
        );
        from += d;
        return el;
      })}
    </AbsoluteFill>
  );
}
