import React from "react";
import { Composition, registerRoot } from "remotion";
import { Presentation, TOTAL } from "./Presentation";
import { Presentation3D, TOTAL_3D } from "./v3/Presentation3D";
import { Social, SOCIAL_TOTAL } from "./social/Social";

function Root() {
  return (
    <>
      {/* Version 3D (Three.js), celle à rendre. */}
      <Composition id="Presentation3D" component={Presentation3D} durationInFrames={TOTAL_3D} fps={30} width={1920} height={1080} />
      {/* Version verticale TikTok / Reels. */}
      <Composition id="Social" component={Social} durationInFrames={SOCIAL_TOTAL} fps={30} width={1080} height={1920} />
      {/* Première version, en 2D. */}
      <Composition id="Presentation" component={Presentation} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    </>
  );
}
registerRoot(Root);
