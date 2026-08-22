// Local Signal — application mobile (Expo / React Native).
//
// Trois écrans, navigation par onglets manuelle.
//
// SUR react-navigation : la roadmap prévoyait de l'adopter « dès qu'un
// troisième écran apparaîtra ». Il apparaît ici — mais ces trois écrans sont
// des destinations parallèles, sans pile ni retour arrière imbriqué. Une barre
// d'onglets manuelle les couvre exactement. react-navigation deviendra
// justifié quand un écran en empilera un autre : la fiche restaurant détaillée,
// prévue en phase 3, sera ce déclencheur.

import { useState } from "react";
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";

import NearbyScreen from "./src/NearbyScreen";
import ScanScreen from "./src/ScanScreen";
import SearchScreen from "./src/SearchScreen";
import { colors, spacing } from "./src/theme";

const TABS = [
  { key: "nearby", label: "Autour de moi", Screen: NearbyScreen },
  { key: "search", label: "Rechercher", Screen: SearchScreen },
  { key: "scan", label: "Scanner", Screen: ScanScreen },
];

export default function App() {
  const [active, setActive] = useState("nearby");
  const { Screen } = TABS.find((t) => t.key === active);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.body}>
        <Screen />
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => setActive(tab.key)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.indicator} />}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md, gap: 6 },
  tabLabel: { fontSize: 14, color: colors.textMuted, fontWeight: "500" },
  tabLabelActive: { color: colors.brand, fontWeight: "700" },
  indicator: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
});
