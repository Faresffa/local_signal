// apps/mobile/src/lib/motion.js
//
// Entrée animée pour les écrans mobiles qui n'en ont pas encore (LS-refonte).
// Équivalent de `.enter` côté web (index.css) : fondu + léger glissement vers
// le haut au montage, jamais au défilement — ces écrans sont courts, ils
// tiennent dans le premier écran, une révélation au scroll n'aurait rien à
// révéler.
//
// Respecte le réglage d'accessibilité « Réduire les animations » du système :
// dans ce cas le contenu apparaît directement, sans transition.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

export function useEntree(delay = 0) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    let annule = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (!annule) setReduit(v);
    });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    if (reduit) {
      progress.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, reduit]);

  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };
}
