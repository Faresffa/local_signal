// apps/mobile/src/screens/CGUScreen.js
//
// Conditions générales d'utilisation. Miroir de apps/web/src/pages/CGU.jsx —
// même texte, même réserve : premier jet, pas un document juridique validé.

import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { spacing, useColors } from "../theme";

const DERNIERE_MISE_A_JOUR = "22 septembre 2026";

const SECTIONS = [
  {
    titre: "1. Objet",
    texte:
      "Local Signal est un service qui aide un voyageur à trouver des restaurants fréquentés par les habitants plutôt que des adresses orientées vers les touristes, à l'aide d'un score d'authenticité calculé sur la carte, la langue des avis publics et les prix — pas sur la popularité ni le nombre d'avis. Le projet est né d'un mémoire de fin d'études (HETIC) et reste, à ce stade, un produit en développement actif.",
  },
  {
    titre: "2. Compte utilisateur",
    texte:
      "La création d'un compte demande un nom d'utilisateur, une adresse électronique et un mot de passe. Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée depuis votre compte. Un compte peut être suspendu en cas d'usage frauduleux ou abusif.",
  },
  {
    titre: "3. Contenu que vous publiez",
    texte:
      "Les photos de cartes que vous envoyez restent votre contenu, mais vous nous accordez le droit d'en extraire automatiquement des informations qui alimentent le score du restaurant — jamais votre nom, jamais publiées telles quelles. Le service ne permet pas de publier d'avis sur les restaurants.",
  },
  {
    titre: "4. Gratuité, offres professionnelles et neutralité",
    texte:
      "Le service est gratuit pour le voyageur, sans abonnement. Il est financé par des offres facultatives destinées aux professionnels : Visibilité (29 € HT/mois) et Visibilité+ (59 € HT/mois) pour les restaurateurs, offre Hôtel (49 € HT/mois) pour les hôtels et conciergeries. Règle de neutralité : un paiement ne modifie jamais le score d'un restaurant ni sa position dans le classement ; les offres n'achètent que de la présentation et un encart distinct, toujours étiqueté « Partenaires ». À ce stade, aucun paiement réel n'est traité.",
  },
  {
    titre: "5. Fiabilité des informations",
    texte:
      "Les informations sur les restaurants peuvent être incomplètes, obsolètes ou inexactes. Le score d'authenticité est une estimation, pas une garantie. Vérifiez toujours les horaires directement auprès du restaurant.",
  },
  {
    titre: "6. Résiliation",
    texte:
      "Vous pouvez supprimer votre compte à tout moment depuis Mon compte → Vos données ; la suppression est définitive et immédiate.",
  },
  {
    titre: "7. Contact",
    texte: "Pour toute question sur ces conditions : [à compléter — adresse de contact du projet].",
  },
];

export default function CGUScreen({ onBack, onGoToConfidentialite }) {
  const colors = useColors();

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <Text style={[s.titre, { color: colors.text }]}>Conditions générales d'utilisation</Text>
      <Text style={[s.date, { color: colors.textMuted }]}>
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}
      </Text>

      {SECTIONS.map((sec) => (
        <View key={sec.titre} style={{ marginTop: spacing.lg }}>
          <Text style={[s.sousTitre, { color: colors.text }]}>{sec.titre}</Text>
          <Text style={[s.texte, { color: colors.textMuted }]}>{sec.texte}</Text>
        </View>
      ))}

      <Pressable onPress={onGoToConfidentialite} style={{ marginTop: spacing.xl, minHeight: 44, justifyContent: "center" }}>
        <Text style={[s.lien, { color: colors.brand }]}>Voir la politique de confidentialité</Text>
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
