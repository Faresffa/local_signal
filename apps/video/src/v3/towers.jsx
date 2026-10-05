// La ville en tours : un volume par restaurant réel (public/data/paris.json).
// Partagé par la vidéo longue (City.jsx) et la version réseaux (social/).
//
// Le minutage vient de l'appelant, en images :
//   appear          début de l'apparition (onde depuis le centre)
//   pop  [a, b]     montée des tours « nombre d'avis »
//   fall [a, b]     effondrement
//   flip            bascule vers le Local Signal (hauteur et couleur)
//   grow [a, b]     repousse des tours « Local Signal »
//   green [a, b]    passage aux couleurs du Local Signal
//   fade [a, b]     tout sauf le Quartier latin s'estompe (facultatif)
import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCurrentFrame } from "remotion";
import paris from "../../public/data/paris.json";
import { K, OUT, clamp01, lerp, ramp } from "./three";

export const QL = { x: -0.38, z: 0.84 }; // centre approximatif du Quartier latin
const MAX_REVIEWS = Math.max(...paris.map((p) => p[3]));

// Précalcul par restaurant : distance au centre (ordre d'apparition),
// hauteur « popularité », hauteur et couleur « Local Signal ».
const PRE = paris.map(([x, z, ls, rc]) => {
  const t = ls == null ? null : clamp01((ls - 45) / 45);
  return {
    x, z,
    d: Math.hypot(x, z),
    dQL: Math.hypot(x - QL.x, z - QL.z),
    hPop: 0.03 + 2.8 * Math.pow(rc / MAX_REVIEWS, 0.7),
    popT: Math.pow(rc / MAX_REVIEWS, 0.35),
    hLs: t == null ? 0.03 : 0.05 + 1.0 * Math.pow(t, 1.6),
    lsT: t,
  };
});

const cNeutral = new THREE.Color("#8f8374");
const cGold = new THREE.Color(K.gold);
const cMixed = new THREE.Color(K.mixed);
const cLocal = new THREE.Color(K.local);
const cGrey = new THREE.Color("#cfc5b5");
const cFaded = new THREE.Color("#e4dccd");

export function Towers({ appear = 4, appearSpeed = 11, pop, fall, flip, grow, green, fade }) {
  const frame = useCurrentFrame();
  const ref = useRef();
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    const tPop = ramp(frame, pop[0], pop[1], OUT);
    const tFall = ramp(frame, fall[0], fall[1]);
    const tGrow = ramp(frame, grow[0], grow[1], OUT);
    const tGreen = ramp(frame, green[0], green[1]);
    const tFade = fade ? ramp(frame, fade[0], fade[1]) : 0;
    for (let i = 0; i < PRE.length; i++) {
      const p = PRE[i];
      const shown = clamp01((frame - appear - p.d * appearSpeed) / 14);
      let h;
      if (frame < fall[0]) h = lerp(0.03, p.hPop, tPop);
      else if (frame < flip) h = lerp(p.hPop, 0.02, tFall);
      else h = lerp(0.02, p.hLs, tGrow);
      const w = 0.05 * shown;
      m.makeScale(w, Math.max(0.001, h * shown), w);
      m.setPosition(p.x, 0, p.z);
      mesh.setMatrixAt(i, m);

      if (frame < flip) {
        col.copy(cNeutral).lerp(cGold, tPop * p.popT);
      } else if (p.lsT == null) {
        col.copy(cGrey);
      } else {
        tmp.copy(cMixed).lerp(cLocal, p.lsT);
        col.copy(cNeutral).lerp(tmp, tGreen);
      }
      const away = clamp01((p.dQL - 1.1) / 0.6);
      if (tFade > 0 && away > 0) col.lerp(cFaded, tFade * away * 0.85);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }, [frame, m, col, tmp, appear, appearSpeed, pop, fall, flip, grow, green, fade]);

  return (
    <instancedMesh ref={ref} args={[geo, undefined, PRE.length]} frustumCulled={false}>
      <meshStandardMaterial roughness={0.75} metalness={0} />
    </instancedMesh>
  );
}
