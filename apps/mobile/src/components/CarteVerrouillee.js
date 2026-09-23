// apps/mobile/src/components/CarteVerrouillee.js
//
// Résultat masqué à un visiteur non connecté (LS-19). Miroir de
// apps/web/src/components/LockedCard.jsx.
//
// NE REÇOIT ET N'AFFICHE AUCUNE DONNÉE RÉELLE. Le serveur ne renvoie que le
// NOMBRE de résultats masqués, jamais leur contenu. Un flou appliqué à de
// vraies données serait contournable en lisant la réponse réseau — cette
// carte est donc générique par construction, pas une vraie carte floutée.
//
// CE QUI EST RÉSERVÉ, C'EST LA LISTE, PAS LE CLASSEMENT. Les cinq restaurants
// visibles sont bien les cinq meilleurs : on ne dégrade jamais le score d'un
// visiteur, on borne seulement le nombre de lignes. Un classement faussé pour
// pousser à l'inscription ruinerait la seule chose que le produit vend.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";

export default function CarteVerrouillee({ onInscription }) {
  const colors = useColors();

  return (
    <View
      style={[
        s.carte,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[s.media, { backgroundColor: colors.surfaceSunken }]}>
        <Feather name="lock" size={24} color={colors.textFaint} />
      </View>

      <View style={s.corps}>
        <Text style={[s.nom, { color: colors.textMuted }]}>Restaurant verrouillé</Text>
        <Text style={[s.meta, { color: colors.textFaint }]}>Réservé aux membres</Text>

        <Pressable
          onPress={onInscription}
          accessibilityRole="button"
          style={({ pressed }) => [
            s.bouton,
            { backgroundColor: colors.brand },
            pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
          ]}
        >
          <Text style={[s.boutonTexte, { color: colors.onBrand }]}>Créer un compte</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  carte: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  media: { height: 96, alignItems: "center", justifyContent: "center" },
  corps: { padding: spacing.md, gap: 4 },
  nom: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13 },
  bouton: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonTexte: { fontSize: 15, fontWeight: "600" },
});
