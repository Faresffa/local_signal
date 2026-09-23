// apps/mobile/src/screens/PricingScreen.js
//
// Page d'abonnement. Miroir de apps/web/src/pages/Pricing.jsx — mêmes
// réserves : prix indicatif, bouton volontairement bloqué (pas de paiement
// réel, voir backend/main.py). `Filtre à fourchette sur le score Local
// Signal` (D-050) figure dans les avantages, comme côté web.

import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

const AVANTAGES_GRATUIT = [
  "5 premiers restaurants de chaque recherche",
  "Score Local Signal et explication complète",
];
const LIMITES_GRATUIT = ["Le reste des résultats reste verrouillé"];
const AVANTAGES_ABONNE = [
  "Tous les restaurants de chaque recherche, sans limite",
  "Recherches illimitées",
  "Restaurants favoris",
  "Filtre à fourchette sur le score Local Signal",
];

function Ligne({ texte, ok, colors }) {
  return (
    <View style={s.ligne}>
      <Feather
        name={ok ? "check" : "x"}
        size={15}
        color={ok ? colors.local : colors.textFaint}
      />
      <Text style={[s.ligneTexte, { color: ok ? colors.text : colors.textFaint }]}>{texte}</Text>
    </View>
  );
}

export default function PricingScreen({ user, onBack }) {
  const colors = useColors();
  const dejaAbonne = user?.role === "subscriber" || user?.role === "admin";

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>S'abonner</Text>
      <Text style={[s.intro, { color: colors.textMuted }]}>
        Local Signal reste gratuit pour découvrir les premiers restaurants de
        chaque recherche. L'abonnement lève la limite.
      </Text>

      <View style={[s.carte, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.nom, { color: colors.text }]}>Gratuit</Text>
        <Text style={[s.prix, { color: colors.text }]}>0 € / mois</Text>
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          {AVANTAGES_GRATUIT.map((t) => <Ligne key={t} texte={t} ok colors={colors} />)}
          {LIMITES_GRATUIT.map((t) => <Ligne key={t} texte={t} ok={false} colors={colors} />)}
        </View>
      </View>

      <View style={[s.carte, s.carteVedette, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
        <View style={[s.badge, { backgroundColor: colors.brand }]}>
          <Text style={[s.badgeTexte, { color: colors.onBrand }]}>Recommandé</Text>
        </View>
        <Text style={[s.nom, { color: colors.text }]}>Abonné</Text>
        <Text style={[s.prix, { color: colors.text }]}>3 € / mois</Text>
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          {AVANTAGES_ABONNE.map((t) => <Ligne key={t} texte={t} ok colors={colors} />)}
        </View>

        {/* BOUTON VOLONTAIREMENT BLOQUÉ — même décision que le web (Pricing.jsx) :
            aucun paiement réel n'est intégré, rien ici ne doit avoir l'air de
            fonctionner. */}
        <View style={{ marginTop: spacing.lg }}>
          <Button
            title={dejaAbonne ? "Déjà abonné" : "Paiement bientôt disponible"}
            icon="credit-card"
            onPress={() => {}}
            disabled
          />
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },
  titre: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  intro: { marginTop: spacing.sm, fontSize: 14, lineHeight: 19 },

  carte: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  carteVedette: { borderWidth: 2 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  nom: { fontSize: 18, fontWeight: "700" },
  prix: { fontSize: 24, fontWeight: "800", marginTop: 2 },
  note: { fontSize: 12, marginTop: 2 },

  ligne: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  ligneTexte: { fontSize: 13, lineHeight: 18, flex: 1 },
});
