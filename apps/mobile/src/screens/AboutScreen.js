// apps/mobile/src/screens/AboutScreen.js
//
// À propos. Miroir de apps/web/src/pages/About.jsx.

import { ScrollView, StyleSheet, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { spacing, useColors } from "../theme";

export default function AboutScreen({ onBack }) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>À propos</Text>

      <Text style={[s.texte, { color: colors.textMuted, marginTop: spacing.lg }]}>
        Local Signal aide un voyageur qui ne connaît pas une ville à trouver
        un vrai restaurant local plutôt qu'une adresse tournée vers les
        touristes. Le problème n'est pas le manque de restaurants
        authentiques, c'est leur manque de visibilité — un restaurant
        fréquenté par les habitants a souvent peu d'avis, pas de site, pas de
        photos. Nous cherchions un moyen de le repérer sans nous fier à sa
        popularité.
      </Text>

      <Text style={[s.texte, { color: colors.textMuted, marginTop: spacing.md }]}>
        Le score qui accompagne chaque restaurant — le Local Signal — se
        calcule sur sa carte, la langue de ses avis publics et ses prix
        comparés au quartier. Jamais sur le nombre d'avis ni sur la note.
        C'est ce qui permet à un restaurant sans presque aucune trace en
        ligne d'apparaître quand même, à sa juste place.
      </Text>
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
