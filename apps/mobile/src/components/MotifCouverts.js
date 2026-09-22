// apps/mobile/src/components/MotifCouverts.js
//
// Trame de fourchettes-couteaux en filigrane derrière tout l'écran
// (LS-refonte). Équivalent mobile du masque CSS
// `apps/web/src/index.css` (`.app::before` + `motif-couverts.svg`) — même
// tracé (Phosphor "ForkKnife", graisse "thin"), rendu ici via `react-native-svg`
// plutôt qu'une icône de police : la première version utilisait
// `MaterialCommunityIcons`, dont le couteau ne se lisait pas comme un couteau
// et dont le trait ne pouvait pas s'affiner davantage — une police d'icônes
// n'a qu'une seule graisse. Le chemin vectoriel, lui, s'affine autant qu'on
// veut et reste identique au web au pixel près.
//
// Positions/rotations FIXES, pas `Math.random()` à chaque rendu : la
// dispersion doit être stable d'un écran à l'autre, pas reclignoter à
// chaque re-rendu du parent.

import Svg, { Path } from "react-native-svg";
import { StyleSheet, View } from "react-native";

// Chemin exact du repère de marque (Phosphor ForkKnife, "thin"), viewBox
// 0 0 256 256 — celui qu'utilise déjà `App.js` pour l'icône des onglets,
// à la graisse la plus fine du jeu.
const PATH =
  "M76,88V40a4,4,0,0,1,8,0V88a4,4,0,0,1-8,0ZM212,40V224a4,4,0,0,1-8,0V172H152a4,4,0,0,1-4-4,264.27,264.27,0,0,1,7.11-55.94c9.47-39.22,27.21-65.41,51.31-75.74A4,4,0,0,1,212,40Zm-8,6.46C162.25,70.33,156.81,145.75,156.1,164H204Zm-88-7.12a4,4,0,0,0-7.9,1.32l8,47.66a36,36,0,0,1-72,0l8-47.66a4,4,0,0,0-7.9-1.32l-8,48A4.89,4.89,0,0,0,36,88a44.06,44.06,0,0,0,40,43.81V224a4,4,0,0,0,8,0V131.81A44.06,44.06,0,0,0,124,88a4.89,4.89,0,0,0,0-.66Z";

// left/top en pourcentage de l'écran. Tailles remontées (retour utilisateur,
// deux fois) : à 11-16px le motif restait imperceptible sur un écran réel —
// le trait reste fin (c'est la nature du tracé), seule l'échelle grandit.
const MOTIFS = [
  { top: "3%", left: "8%", rotate: "-22deg", size: 32 },
  { top: "6%", left: "58%", rotate: "35deg", size: 26 },
  { top: "12%", left: "32%", rotate: "-55deg", size: 24 },
  { top: "17%", left: "80%", rotate: "12deg", size: 30 },
  { top: "24%", left: "14%", rotate: "50deg", size: 26 },
  { top: "29%", left: "48%", rotate: "-18deg", size: 32 },
  { top: "35%", left: "72%", rotate: "-60deg", size: 22 },
  { top: "40%", left: "4%", rotate: "25deg", size: 28 },
  { top: "45%", left: "62%", rotate: "70deg", size: 26 },
  { top: "51%", left: "26%", rotate: "-30deg", size: 30 },
  { top: "56%", left: "88%", rotate: "-40deg", size: 24 },
  { top: "61%", left: "42%", rotate: "15deg", size: 28 },
  { top: "67%", left: "10%", rotate: "-48deg", size: 26 },
  { top: "72%", left: "68%", rotate: "28deg", size: 32 },
  { top: "78%", left: "34%", rotate: "-15deg", size: 24 },
  { top: "83%", left: "80%", rotate: "55deg", size: 28 },
  { top: "88%", left: "18%", rotate: "-35deg", size: 30 },
  { top: "93%", left: "54%", rotate: "20deg", size: 26 },
  { top: "97%", left: "2%", rotate: "40deg", size: 24 },
  { top: "95%", left: "92%", rotate: "-25deg", size: 28 },
];

export default function MotifCouverts({ color }) {
  return (
    <View style={s.couche} pointerEvents="none">
      {MOTIFS.map((m, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: m.top,
            left: m.left,
            transform: [{ rotate: m.rotate }],
          }}
        >
          <Svg width={m.size} height={m.size} viewBox="0 0 256 256">
            <Path d={PATH} fill={color} />
          </Svg>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  couche: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    // Opacité de la couche entière : posée en avant-plan (App.js), au-dessus
    // des photos et du texte, elle doit rester perçue comme une texture,
    // jamais comme des icônes qu'on lit une par une. Remontée après retour
    // utilisateur : à 0,05 le motif ne se voyait quasiment plus à l'écran.
    opacity: 0.1,
  },
});
