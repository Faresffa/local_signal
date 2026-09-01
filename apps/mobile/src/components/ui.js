// apps/mobile/src/components/ui.js
//
// Briques d'interface partagées par les écrans mobiles.
//
// Conventions natives plutôt que portage du web : cibles tactiles d'au moins
// 44 points, retour visuel à la pression, défilement natif. La cohérence avec
// le web passe par les jetons et le vocabulaire, pas par la copie des mises
// en page.

import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";
import {
  hue, verdictColors, visualBackground, visualForeground,
} from "../lib/display";

/* ------------------------------------------------------------------ Verdict */

export function Verdict({ tone, label, size = "md" }) {
  const colors = useColors();
  const { background, text } = verdictColors(tone, colors);

  return (
    <View
      style={[
        s.verdict,
        { backgroundColor: background },
        size === "lg" && s.verdictLg,
      ]}
    >
      <Text style={[s.verdictText, { color: text }, size === "lg" && s.verdictTextLg]}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------- Visuel de remplacement */

// Association grossière cuisine vers pictogramme : elle sert à varier le
// visuel, pas à décrire la carte.
const GLYPHES = [
  { name: "coffee", keys: ["coffee", "cafe", "tea", "bakery", "dessert", "ice_cream", "brunch"] },
  { name: "package", keys: ["burger", "sandwich", "fast_food", "kebab", "american"] },
];

function glyphe(cuisine) {
  const value = (cuisine || "").toLowerCase();
  const found = GLYPHES.find((g) => g.keys.some((k) => value.includes(k)));
  return found ? found.name : "compass";
}

/**
 * Visuel d'une fiche.
 *
 * OpenStreetMap ne fournit pas de photographies. Plutôt qu'une image de stock
 * qui affirmerait quelque chose de faux, un fond dérivé de l'identifiant et un
 * pictogramme. À remplacer par les vrais clichés dès qu'ils existent.
 */
export function CuisineVisual({ id, cuisine, height = 150, iconSize = 40, isDark }) {
  const h = hue(id);
  return (
    <View
      style={[
        s.visual,
        { height, backgroundColor: visualBackground(h, isDark) },
      ]}
    >
      <Feather
        name={glyphe(cuisine)}
        size={iconSize}
        color={visualForeground(h, isDark)}
      />
    </View>
  );
}

/* -------------------------------------------------------------- Boutons */

export function Button({ title, onPress, variant = "primary", disabled, icon }) {
  const colors = useColors();
  const primary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.button,
        primary
          ? { backgroundColor: colors.brand }
          : { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
        // Retour tactile : l'élément s'enfonce légèrement sous le doigt.
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 },
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon && (
        <Feather
          name={icon}
          size={16}
          color={primary ? colors.onBrand : colors.text}
        />
      )}
      <Text style={[s.buttonText, { color: primary ? colors.onBrand : colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------- États */

/** Squelette qui reproduit la forme de la carte, pas un rond qui tourne. */
export function CardSkeleton() {
  const colors = useColors();
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ height: 150, backgroundColor: colors.skeleton }} />
      <View style={{ padding: spacing.md, gap: 10 }}>
        <View style={{ height: 17, width: "65%", borderRadius: 4, backgroundColor: colors.skeleton }} />
        <View style={{ height: 12, width: "40%", borderRadius: 4, backgroundColor: colors.skeleton }} />
      </View>
    </View>
  );
}

export function Loading({ label }) {
  const colors = useColors();
  return (
    <View style={s.state}>
      <ActivityIndicator color={colors.brand} />
      <Text style={[s.stateText, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/** Erreur : cause probable et action, jamais un code technique seul. */
export function ErrorState({ message, onRetry }) {
  const colors = useColors();
  return (
    <View style={s.state}>
      <Feather name="alert-circle" size={34} color={colors.brand} />
      <Text style={[s.stateTitle, { color: colors.text }]}>
        Chargement impossible
      </Text>
      <Text style={[s.stateText, { color: colors.textMuted }]}>
        {message || "Une erreur est survenue."} Vérifiez que le serveur est
        démarré, puis réessayez.
      </Text>
      {onRetry && <Button title="Réessayer" onPress={onRetry} />}
    </View>
  );
}

/** Aucun résultat : on dit quoi faire, pas seulement qu'il n'y a rien. */
export function EmptyState({ onReset }) {
  const colors = useColors();
  return (
    <View style={s.state}>
      <Feather name="search" size={34} color={colors.textFaint} />
      <Text style={[s.stateTitle, { color: colors.text }]}>
        Aucun restaurant ici
      </Text>
      <Text style={[s.stateText, { color: colors.textMuted }]}>
        Élargissez le rayon de recherche pour voir plus d'établissements autour
        de vous.
      </Text>
      {onReset && <Button title="Élargir la recherche" onPress={onReset} variant="ghost" />}
    </View>
  );
}

const s = StyleSheet.create({
  verdict: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  verdictLg: { paddingHorizontal: 14, paddingVertical: 7 },
  verdictText: { fontSize: 12, fontWeight: "600" },
  verdictTextLg: { fontSize: 13 },

  visual: { width: "100%", alignItems: "center", justifyContent: "center" },

  button: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },

  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },

  state: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  stateTitle: { fontSize: 19, fontWeight: "700" },
  stateText: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
});
