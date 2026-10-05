// Montage de la version 3D (Three.js + Remotion).
import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { City, CITY_DURATION } from "./City";
import { Focus, FOCUS_DURATION } from "./Focus";
import { WebApp, WEB_DURATION } from "./WebApp";
import { Mobile, MOBILE_DURATION, Scan, SCAN_DURATION } from "./Mobile";
import { Gallery, GALLERY_DURATION } from "./Gallery";
import { Outro, OUTRO_DURATION, PassResto, PASS_DURATION, Proof, PROOF_DURATION } from "./Closing";

const T = 15;

const SCENES = [
  [City, CITY_DURATION, fade()],
  [Focus, FOCUS_DURATION, slide({ direction: "from-right" })],
  [WebApp, WEB_DURATION, fade()],
  [Mobile, MOBILE_DURATION, fade()],
  [Scan, SCAN_DURATION, fade()],
  [Gallery, GALLERY_DURATION, slide({ direction: "from-bottom" })],
  [Proof, PROOF_DURATION, fade()],
  [PassResto, PASS_DURATION, fade()],
  [Outro, OUTRO_DURATION, null],
];

export const TOTAL_3D = SCENES.reduce((a, [, d]) => a + d, 0) - T * (SCENES.length - 1);

export function Presentation3D() {
  return (
    <TransitionSeries>
      {SCENES.flatMap(([Scene, d, tr], i) => {
        const items = [
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d}>
            <Scene />
          </TransitionSeries.Sequence>,
        ];
        if (tr) items.push(<TransitionSeries.Transition key={`t${i}`} presentation={tr} timing={linearTiming({ durationInFrames: T })} />);
        return items;
      })}
    </TransitionSeries>
  );
}
