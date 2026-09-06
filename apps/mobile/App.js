// Local Signal — application mobile (Expo / React Native).
//
// Navigation par état plutôt que par bibliothèque : deux onglets et deux
// écrans empilés. react-navigation sera introduit quand il faudra des liens
// profonds ou une pile plus profonde, pas avant.
//
// Le thème suit le réglage système, comme le web. Toutes les couleurs viennent
// de packages/shared : les deux interfaces ne peuvent pas diverger (D-022).

import { useEffect, useRef, useState } from "react";
import {
  Animated, Pressable, SafeAreaView, StatusBar, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import DetailScreen from "./src/screens/DetailScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import ReserveScreen from "./src/screens/ReserveScreen";
import ScanScreen from "./src/screens/ScanScreen";
import { spacing, useColors } from "./src/theme";

// Transition d'écran.
//
// Composant à part, et volontairement remonté à chaque changement de `key` :
// il naît avec une valeur animée neuve à 0. On ne réinitialise jamais une
// valeur existante pour rejouer l'animation — sous react-native-web, remettre
// à zéro une valeur déjà pilotée par le driver natif la laisse bloquée là, et
// l'écran reste invisible. Remonter le composant est la seule façon fiable de
// repartir.
function Transition({ decalage, duree, children }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duree,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, duree]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [decalage, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// « Découvrir » dépend du GPS ; « Chercher » ne l'exige pas. Les deux sont
// nécessaires : la base ne couvre qu'un quartier, et un utilisateur qui n'y
// est pas doit quand même pouvoir explorer (D-026).
// DEUX ONGLETS, PAS TROIS (D-037).
//
// « Chercher » etait un ecran a part, dedie au choix du point de depart,
// alors que le web fait tout depuis sa page unique. Deux interfaces pour le
// meme produit, avec des parcours differents : passer de l'une a l'autre
// obligeait a reapprendre. Le choix du lieu est desormais dans la page de
// decouverte, comme sur le web, et l'onglet separe disparait.
//
// Reste ce qui est reellement une autre activite : scanner une carte.
const ONGLETS = [
  { key: "discover", label: "Découvrir", icon: "compass" },
  { key: "scan", label: "Scanner", icon: "camera" },
];

export default function App() {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [tab, setTab] = useState("discover");
  const [stack, setStack] = useState(null); // { screen, restaurant }

  function ouvrirFiche(restaurant) {
    setStack({ screen: "detail", restaurant });
  }

  function ouvrirReservation(restaurant) {
    setStack({ screen: "reserve", restaurant });
  }

  // Un écran empilé recouvre les onglets : on ne mélange pas une fiche et une
  // barre de navigation qui suggère qu'on est ailleurs.
  const contenu = stack ? (
    stack.screen === "detail" ? (
      <DetailScreen
        restaurant={stack.restaurant}
        onBack={() => setStack(null)}
        onReserve={ouvrirReservation}
      />
    ) : (
      <ReserveScreen
        restaurant={stack.restaurant}
        onBack={() => setStack({ screen: "detail", restaurant: stack.restaurant })}
        onDone={() => setStack(null)}
      />
    )
  ) : tab === "discover" ? (
    <DiscoverScreen onOpen={ouvrirFiche} />
  ) : (
    <ScanScreen />
  );

  // Le mouvement dit ce qui vient de se passer : un écran empilé glisse depuis
  // la droite (on s'enfonce dans une pile), un changement d'onglet se substitue
  // en fondu (on se déplace latéralement).
  const cle = stack ? `${stack.screen}-${stack.restaurant.id}` : tab;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <Transition key={cle} decalage={stack ? 34 : 0} duree={stack ? 260 : 200}>
        {contenu}
      </Transition>

      {!stack && (
        <View
          style={[
            s.tabBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          {ONGLETS.map((o) => {
            const actif = o.key === tab;
            return (
              <Pressable
                key={o.key}
                onPress={() => setTab(o.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: actif }}
                accessibilityLabel={o.label}
                style={s.tab}
              >
                <Feather
                  name={o.icon}
                  size={21}
                  color={actif ? colors.brand : colors.textMuted}
                />
                <Text
                  style={[
                    s.tabLabel,
                    { color: actif ? colors.brand : colors.textMuted },
                    actif && s.tabLabelActive,
                  ]}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: 1 },
  // 56 points minimum : la cible tactile doit rester confortable au pouce.
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: spacing.sm,
  },
  tabLabel: { fontSize: 11, fontWeight: "500" },
  tabLabelActive: { fontWeight: "700" },
});
