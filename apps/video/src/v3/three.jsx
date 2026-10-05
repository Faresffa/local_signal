// Outils 3D communs : textures chargées de façon déterministe (delayRender),
// caméra pilotée par l'image courante, interpolations.
import React, { useEffect, useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { cancelRender, continueRender, delayRender, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";

export const SMOOTH = Easing.bezier(0.65, 0, 0.35, 1);
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ramp = (frame, a, b, ease = SMOOTH) =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

/** Texture d'image, chargée avant que Remotion ne capture l'image. */
//
// ThreeCanvas ne redessine qu'au changement d'image Remotion : une texture
// arrivée après coup ne serait jamais peinte. On redessine donc une fois la
// texture montée (`advance`), et seulement ensuite on libère la capture.
export function useTex(src) {
  const [handle] = useState(() => delayRender(`texture ${src}`));
  const [tex, setTex] = useState(null);
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    new THREE.TextureLoader().load(
      staticFile(src),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 16;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        setTex(t);
      },
      undefined,
      (e) => cancelRender(e),
    );
  }, [src]);
  useEffect(() => {
    if (!tex) return;
    requestAnimationFrame(() => {
      advance(performance.now());
      continueRender(handle);
    });
  }, [tex, advance, handle]);
  return tex;
}

/**
 * Caméra à images clés : `keys` = [{at, pos:[x,y,z], look:[x,y,z], fov?}].
 * Interpolation douce entre deux clés consécutives.
 */
export function CameraRig({ keys }) {
  const frame = useCurrentFrame();
  const { camera } = useThree();
  useLayoutEffect(() => {
    let i = 0;
    while (i < keys.length - 2 && frame >= keys[i + 1].at) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const t = b.at === a.at ? 1 : ramp(frame, a.at, b.at, b.ease || SMOOTH);
    const P = a.pos.map((v, k) => lerp(v, b.pos[k], t));
    const L = a.look.map((v, k) => lerp(v, b.look[k], t));
    camera.position.set(P[0], P[1], P[2]);
    if (a.fov || b.fov) {
      camera.fov = lerp(a.fov || 35, b.fov || 35, t);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(L[0], L[1], L[2]);
  }, [frame, camera, keys]);
  return null;
}

/** Palette 3D (identité de l'app, voir packages/shared/tokens.js). */
export const K = {
  bg: "#f7f0e3",
  ground: "#efe6d6",
  brand: "#c1121f",
  gold: "#e3a008",
  local: "#168a5a",
  localDeep: "#2d6a4f",
  mixed: "#d98700",
  grey: "#b9ad9b",
};
