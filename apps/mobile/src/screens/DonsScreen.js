// apps/mobile/src/screens/DonsScreen.js
//
// Don. BOUTON VOLONTAIREMENT BLOQUÉ — miroir de apps/web/src/pages/Dons.jsx,
// même décision que pour les offres pro : aucun moyen de paiement n'est
// intégré, rien ici ne doit avoir l'air de fonctionner.

import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Button } from "../components/ui";
import { spacing, useColors } from "../theme";

export default function DonsScreen({ onBack }) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>Soutenir Local Signal</Text>

      <Text style={[s.texte, { color: colors.textMuted, marginTop: spacing.md }]}>
        Local Signal reste gratuit à découvrir, et le restera pour son usage
        de base. Si le projet vous est utile, un don aide à couvrir les coûts
        de fonctionnement (hébergement, collecte des données) et à continuer
        de l'améliorer.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Faire un don — bientôt disponible" icon="heart" onPress={() => {}} disabled />
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
