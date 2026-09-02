// apps/mobile/src/components/MapPicker.web.js
//
// Variante web de MapPicker. Metro choisit ce fichier plutôt que MapPicker.js
// dès que la plateforme est `web`, sur la seule foi du suffixe.
//
// POURQUOI CE FICHIER EXISTE. `react-native-maps` s'appuie sur des composants
// natifs et casse entièrement le bundle web :
//   Importing native-only module "codegenNativeCommands" on web
// Sans cette variante, la préversion web ne compile plus — or c'est elle qui
// sert à vérifier l'application sans passer par un appareil. Un module natif
// qui rend la vérification impossible coûte plus qu'il ne rapporte ; le
// séparer par plateforme garde les deux.
//
// La sélection sur carte reste donc réservée aux appareils. Sur le web, les
// trois autres voies — position, saisie d'adresse, lieux en accès direct —
// restent entières, et le site React (apps/web) offre, lui, une vraie carte
// Leaflet.

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";

export default function MapPicker({ visible, onFermer }) {
  const colors = useColors();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <View style={[s.page, { backgroundColor: colors.background }]}>
        <View style={s.head}>
          <Text style={[s.title, { color: colors.text }]}>Choisissez un point</Text>
          <Pressable
            onPress={onFermer}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={[s.close, { backgroundColor: colors.surfaceSunken }]}
          >
            <Feather name="x" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={s.centre}>
          <Feather name="map" size={38} color={colors.textFaint} />
          <Text style={[s.titre, { color: colors.text }]}>
            Carte disponible sur l'application
          </Text>
          <Text style={[s.texte, { color: colors.textMuted }]}>
            La sélection sur carte utilise le fournisseur de cartes du téléphone.
            Depuis un navigateur, saisissez une adresse ou choisissez un lieu.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.lg },
  titre: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  texte: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
});
