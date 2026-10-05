// Montage : dix scènes enchaînées par des fondus et des glissés.
import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Hook, Problem, BrandReveal } from "./scenes/Intro";
import { Signal } from "./scenes/Signal";
import { Demo, DEMO_DURATION } from "./scenes/Demo";
import { Scan, Mobile, Proof, Restaurateurs, Final } from "./scenes/Outro";

const T = 15; // durée d'une transition, en images
const FINAL = 240;

export const SCENES = [
  [Hook, 210, fade()],
  [Problem, 280, fade()],
  [BrandReveal, 150, slide({ direction: "from-bottom" })],
  [Signal, 380, fade()],
  [Demo, DEMO_DURATION, slide({ direction: "from-right" })],
  [Scan, 360, fade()],
  [Mobile, 210, slide({ direction: "from-right" })],
  [Proof, 330, fade()],
  [Restaurateurs, 210, fade()],
  [Final, FINAL, null],
];

export const TOTAL = SCENES.reduce((a, [, d]) => a + d, 0) - T * (SCENES.length - 1);

export function Presentation() {
  return (
    <TransitionSeries>
      {SCENES.flatMap(([Scene, d, tr], i) => {
        const items = [
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d}>
            <Scene duration={d} />
          </TransitionSeries.Sequence>,
        ];
        if (tr) items.push(<TransitionSeries.Transition key={`t${i}`} presentation={tr} timing={linearTiming({ durationInFrames: T })} />);
        return items;
      })}
    </TransitionSeries>
  );
}
