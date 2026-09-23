// apps/mobile/src/screens/ConfidentialiteScreen.js
//
// Politique de confidentialité / RGPD. Miroir de
// apps/web/src/pages/Confidentialite.jsx — mêmes réserves.

import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { spacing, useColors } from "../theme";

const DERNIERE_MISE_A_JOUR = "22 septembre 2026";

const SECTIONS = [
  {
    titre: "1. Quelles données sont collectées",
    texte:
      "Compte (nom d'utilisateur, adresse électronique, mot de passe — jamais stocké en clair), avis publiés, photos de cartes de restaurant envoyées (déliées de votre identité une fois traitées), réservations effectuées. Aucune donnée bancaire n'est collectée : aucun paiement réel n'est traité à ce stade.",
  },
  {
    titre: "2. Pourquoi ces données",
    texte:
      "Le compte sert à retrouver vos avis et vos favoris d'une visite à l'autre. Les avis et les photos de cartes alimentent le score d'authenticité des restaurants — c'est le cœur du service. Aucune donnée n'est vendue à un tiers.",
  },
  {
    titre: "3. Durée de conservation",
    texte:
      "Aussi longtemps que votre compte existe. Sa suppression efface immédiatement et définitivement le compte, les avis et les réservations qui lui sont rattachés.",
  },
  {
    titre: "4. Vos droits",
    texte:
      "Accès et portabilité : téléchargez vos données depuis Mon compte → Vos données. Effacement : supprimez votre compte depuis le même écran — immédiat et définitif. Pour toute autre demande : [à compléter — adresse de contact du projet].",
  },
  {
    titre: "5. Hébergement",
    texte:
      "Les données sont hébergées chez notre prestataire d'hébergement. Les données de localisation des restaurants proviennent d'OpenStreetMap.",
  },
];

export default function ConfidentialiteScreen({ onBack, onGoToCGU }) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>Politique de confidentialité</Text>
      <Text style={[s.date, { color: colors.textMuted }]}>
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}
      </Text>

      {SECTIONS.map((sec) => (
        <View key={sec.titre} style={{ marginTop: spacing.lg }}>
          <Text style={[s.sousTitre, { color: colors.text }]}>{sec.titre}</Text>
          <Text style={[s.texte, { color: colors.textMuted }]}>{sec.texte}</Text>
        </View>
      ))}

      <Pressable onPress={onGoToCGU} style={{ marginTop: spacing.xl, minHeight: 44, justifyContent: "center" }}>
        <Text style={[s.lien, { color: colors.brand }]}>Voir les conditions générales d'utilisation</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },
  titre: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  date: { marginTop: 4, fontSize: 13 },
  sousTitre: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  texte: { fontSize: 14, lineHeight: 20 },
  lien: { fontSize: 14, fontWeight: "600" },
});
