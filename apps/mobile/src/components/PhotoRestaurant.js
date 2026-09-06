// apps/mobile/src/components/PhotoRestaurant.js
//
// Visuel d'un restaurant : sa photo réelle quand on l'a, l'illustration
// générée sinon (D-035). Miroir du composant web.
//
// CE QUI EST AFFICHÉ N'EST PAS CE QUI EST STOCKÉ. La base ne porte qu'une
// URL ; l'image reste chez son hébergeur et ne transite jamais par nos
// serveurs. Même règle que pour les cartes (D-021, D-025).
//
// D'OÙ LE REPLI, QUI N'EST PAS UN DÉTAIL. 427 restaurants sur 10 686 ont une
// photo : le cas « pas de photo » est le cas MAJORITAIRE, pas l'exception.
// L'illustration reste donc le socle et la photo se pose par-dessus, plutôt
// que de la remplacer — sinon une liste à moitié illustrée serait pire que
// pas de photo du tout, et une URL expirée laisserait un trou.

import { useState } from "react";
import { Animated, StyleSheet } from "react-native";

import { CuisineVisual } from "./ui";

export default function PhotoRestaurant({
  id, cuisine, photoUrl, isDark, height = 150, iconSize = 40,
}) {
  // Opacité animée plutôt qu'un simple booléen : sans transition, la photo
  // remplace l'illustration d'un coup sec au milieu d'une liste qui défile.
  const [opacite] = useState(() => new Animated.Value(0));
  const [cassee, setCassee] = useState(false);

  const url = (photoUrl || "").trim();
  const afficher = Boolean(url) && !cassee;

  return (
    <>
      <CuisineVisual id={id} cuisine={cuisine} height={height} iconSize={iconSize} isDark={isDark} />

      {afficher && (
        <Animated.Image
          source={{ uri: url }}
          resizeMode="cover"
          // `accessibilityElementsHidden` : le nom du restaurant est annoncé
          // juste à côté, le répéter ici n'apprendrait rien.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { height, opacity: opacite }]}
          onLoad={() => {
            Animated.timing(opacite, {
              toValue: 1,
              duration: 320,
              useNativeDriver: true,
            }).start();
          }}
          // Une URL d'hébergeur peut expirer : on retire la photo et
          // l'illustration reprend sa place, sans cadre vide.
          onError={() => setCassee(true)}
        />
      )}
    </>
  );
}
