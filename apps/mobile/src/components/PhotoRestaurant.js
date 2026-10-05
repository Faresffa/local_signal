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
import { Animated, StyleSheet, Text } from "react-native";

import { photoUrl as photoUrlGoogle } from "../api";
import { CuisineVisual } from "./ui";

// URL Google signées et expirées (403, 5 octobre 2026) : voir le composant web.
const URL_EXPIREE = /googleusercontent\.com/;

export default function PhotoRestaurant({
  id, cuisine, photoUrl, credit, photoGoogle = false, isDark, height = 150, iconSize = 40,
}) {
  // Opacité animée plutôt qu'un simple booléen : sans transition, la photo
  // remplace l'illustration d'un coup sec au milieu d'une liste qui défile.
  const [opacite] = useState(() => new Animated.Value(0));
  // Rang de la source en cours : une image qui échoue passe à la suivante
  // (Google, puis site ou Panoramax, puis l'illustration) — voir le web.
  const [rang, setRang] = useState(0);

  const [chargee, setChargee] = useState(false);
  const externe = photoUrl && !URL_EXPIREE.test(photoUrl) ? photoUrl.trim() : "";
  const sources = [
    photoGoogle && { url: photoUrlGoogle(id), credit: "Google Maps" },
    externe && { url: externe, credit },
  ].filter(Boolean);
  const source = sources[rang];
  const url = source?.url || "";
  const afficher = Boolean(url);

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
            setChargee(true);
            Animated.timing(opacite, {
              toValue: 1,
              duration: 320,
              useNativeDriver: true,
            }).start();
          }}
          // Une URL d'hébergeur peut expirer : on retire la photo et
          // l'illustration reprend sa place, sans cadre vide.
          onError={() => { setChargee(false); setRang((r) => r + 1); }}
        />
      )}
      {/* Crédit obligatoire des photos sous licence libre (Panoramax, D-067). */}
      {afficher && chargee && source?.credit ? (
        <Text numberOfLines={1} style={styles.credit}>© {source.credit}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  credit: {
    position: "absolute",
    right: 4,
    bottom: 4,
    maxWidth: "90%",
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: 10,
  },
});
