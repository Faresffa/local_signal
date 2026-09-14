// apps/mobile/src/components/BarreSignal.js
//
// Position d'un restaurant sur l'échelle du Local Signal (LS-12, LS-14).
// Pendant mobile de `apps/web/src/components/BarreSignal.jsx`.
//
// POURQUOI PAS DES ÉTOILES, POURQUOI PAS DE CHIFFRE. Le raisonnement complet
// est dans la version web ; en deux lignes : les étoiles reprennent le symbole
// de la note de popularité que le projet récuse (D-007) et, sur données
// réelles, placent presque tout le monde entre trois et quatre. Un chiffre,
// lui, contredirait D-009 — aucun score visible par défaut. Une barre montre
// une POSITION sans énoncer une note.
//
// L'ANIMATION N'EST PAS DÉCORATIVE : le remplissage dit qu'un calcul a eu
// lieu. Une barre déjà pleine se lit comme une propriété fixe du restaurant,
// une barre qui se remplit se lit comme un résultat.
//
// `useNativeDriver` est impossible ici : la largeur n'est pas une propriété
// que le fil natif sait animer seul. On anime donc l'ÉCHELLE, qui l'est — la
// barre est posée à sa largeur finale et part d'un facteur zéro. Le rendu est
// identique et l'animation ne traverse pas le fil JavaScript à chaque image,
// ce qui compte sur une liste qui défile.

import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";

import { radius, useColors } from "../theme";

const DUREE_MS = 600;

export default function BarreSignal({ valeur, ton, delai = 0, label }) {
  const colors = useColors();
  const progression = useRef(new Animated.Value(0)).current;

  // La valeur peut manquer — un restaurant non évalué existe (D-012). On
  // affiche alors la piste vide plutôt que de supposer zéro, qui se lirait
  // comme « mauvais » au lieu de « inconnu ».
  const part = valeur == null ? 0 : Math.max(0, Math.min(100, valeur));

  useEffect(() => {
    let annule = false;
    const animation = Animated.timing(progression, {
      toValue: 1,
      duration: DUREE_MS,
      delay: delai,
      useNativeDriver: true,
    });

    AccessibilityInfo.isReduceMotionEnabled().then((reduit) => {
      if (annule) return;
      if (reduit) progression.setValue(1);
      else animation.start();
    });

    return () => { annule = true; animation.stop(); };
  }, [progression, delai]);

  const couleur = {
    local: colors.local,
    mixed: colors.mixed,
    tourist: colors.tourist,
  }[ton] || colors.textFaint;

  return (
    <View
      style={[s.piste, { backgroundColor: colors.surfaceSunken }]}
      // La barre est une image de données : elle porte son sens en texte pour
      // qui ne la voit pas, et annonce le verdict — pas un pourcentage, qui ne
      // voudrait rien dire sans l'échelle.
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          s.part,
          {
            width: `${part}%`,
            backgroundColor: couleur,
            transform: [{ scaleX: progression }],
          },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  piste: { height: 6, borderRadius: radius.sm, overflow: "hidden" },
  part: {
    height: "100%",
    borderRadius: radius.sm,
    // Sans cela l'échelle part du centre et la barre s'ouvre en éventail.
    transformOrigin: "left",
  },
});
