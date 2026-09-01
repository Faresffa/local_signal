// Local Signal — application mobile (Expo / React Native).
//
// Navigation par état plutôt que par bibliothèque : deux onglets et deux
// écrans empilés. react-navigation sera introduit quand il faudra des liens
// profonds ou une pile plus profonde, pas avant.
//
// Le thème suit le réglage système, comme le web. Toutes les couleurs viennent
// de packages/shared : les deux interfaces ne peuvent pas diverger (D-022).

import { useState } from "react";
import {
  Pressable, SafeAreaView, StatusBar, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import DetailScreen from "./src/screens/DetailScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import ReserveScreen from "./src/screens/ReserveScreen";
import ScanScreen from "./src/screens/ScanScreen";
import { spacing, useColors } from "./src/theme";

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

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <View style={{ flex: 1 }}>{contenu}</View>

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
