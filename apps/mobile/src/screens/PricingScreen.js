// apps/mobile/src/screens/PricingScreen.js
//
// Page du Pass Voyageur (D-063, remplace l'abonnement mensuel). Miroir de
// apps/web/src/pages/Pricing.jsx — trois forfaits temporels à paiement
// unique, bouton volontairement bloqué (pas de paiement réel, voir
// backend/main.py).

import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Button } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

const AVANTAGES_GRATUIT = [
  "5 premiers restaurants de chaque recherche",
  "Score Local Signal et explication complète",
];
const LIMITES_GRATUIT = [
  "Le reste des résultats reste verrouillé",
  "Filtres avancés verrouillés",
  "Publicités affichées",
];
const AVANTAGES_PASS = [
  "Tous les restaurants de chaque recherche",
  "Filtres avancés, dont la fourchette sur le score Local Signal",
  "Scans de cartes illimités",
  "Recherches illimitées et restaurants favoris",
  "Aucune publicité",
];

// Tarifs du business plan v2 (D-063) — même liste que le web (Pricing.jsx).
const PASS = [
  { id: "3j", nom: "Pass Week-end", duree: "3 jours", prix: "2,99" },
  { id: "7j", nom: "Pass Semaine", duree: "7 jours", prix: "4,99", vedette: true },
  { id: "1an", nom: "Pass Annuel", duree: "12 mois", prix: "14,99", note: "Pour les voyageurs fréquents" },
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
  const passActif = user?.role === "subscriber" || user?.role === "admin";

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>Pass Voyageur</Text>
      <Text style={[s.intro, { color: colors.textMuted }]}>
        Local Signal reste gratuit pour découvrir les premiers restaurants de
        chaque recherche. Pour tout débloquer, prenez un Pass à la durée de
        votre séjour : un seul paiement, sans abonnement ni reconduction.
      </Text>

      {/* Gratuit en premier, puis les trois Pass — même ordre que le web. */}
      <View style={[s.carte, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.nom, { color: colors.text }]}>Gratuit</Text>
        <Text style={[s.prix, { color: colors.text }]}>0 €<Text style={[s.duree, { color: colors.textMuted }]}> · sans limite de durée</Text></Text>
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          {AVANTAGES_GRATUIT.map((t) => <Ligne key={t} texte={t} ok colors={colors} />)}
          {LIMITES_GRATUIT.map((t) => <Ligne key={t} texte={t} ok={false} colors={colors} />)}
        </View>
      </View>

      {PASS.map((p) => (
        <View
          key={p.id}
          style={[
            s.carte, p.vedette && s.carteVedette,
            { backgroundColor: colors.surface, borderColor: p.vedette ? colors.brand : colors.border },
          ]}
        >
          {p.vedette && (
            <View style={[s.badge, { backgroundColor: colors.brand }]}>
              <Text style={[s.badgeTexte, { color: colors.onBrand }]}>Offre phare</Text>
            </View>
          )}
          <Text style={[s.nom, { color: colors.text }]}>{p.nom}</Text>
          <Text style={[s.prix, { color: colors.text }]}>
            {p.prix} €<Text style={[s.duree, { color: colors.textMuted }]}> TTC · {p.duree}</Text>
          </Text>
          {p.note && <Text style={[s.note, { color: colors.textFaint }]}>{p.note}</Text>}
          {p.vedette && (
            <View style={{ marginTop: spacing.md, gap: 8 }}>
              {AVANTAGES_PASS.map((t) => <Ligne key={t} texte={t} ok colors={colors} />)}
            </View>
          )}

          {/* BOUTON VOLONTAIREMENT BLOQUÉ — même décision que le web
              (Pricing.jsx) : aucun paiement réel n'est intégré. */}
          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={passActif ? "Pass déjà actif" : "Paiement bientôt disponible"}
              icon="credit-card"
              variant={p.vedette ? "primary" : "ghost"}
              onPress={() => {}}
              disabled
            />
          </View>
        </View>
      ))}

      <Text style={[s.memes, { color: colors.textMuted }]}>
        Les trois Pass donnent exactement les mêmes avantages ; seule la durée change.
      </Text>

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
  duree: { fontSize: 14, fontWeight: "500" },
  memes: { marginTop: spacing.md, fontSize: 12, lineHeight: 17 },

  ligne: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  ligneTexte: { fontSize: 13, lineHeight: 18, flex: 1 },
});
