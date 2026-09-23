// apps/mobile/src/screens/ContactScreen.js
//
// Contact. Miroir de apps/web/src/pages/Contact.jsx.

import { Linking, ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Button } from "../components/ui";
import { spacing, useColors } from "../theme";

const EMAIL_CONTACT = "fareshafianepro@gmail.com";

export default function ContactScreen({ onBack }) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>Contact</Text>

      <Text style={[s.texte, { color: colors.textMuted, marginTop: spacing.md }]}>
        Une question, un restaurant à signaler, un problème rencontré dans
        l'application ? Écrivez-nous.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        <Button title={EMAIL_CONTACT} icon="mail" onPress={() => Linking.openURL(`mailto:${EMAIL_CONTACT}`)} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },
  titre: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  texte: { fontSize: 14, lineHeight: 20 },
});
