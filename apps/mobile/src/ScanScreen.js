// Écran de scan de carte — la fonctionnalité centrale de l'app (D-004).
//
// L'utilisateur est debout devant le restaurant. Il photographie la carte
// affichée en vitrine et obtient une réponse immédiate, sans qu'aucun avis
// ne soit nécessaire — c'est la réponse au paradoxe de l'invisibilité (D-001).
//
// Règle d'affichage (D-009) : on ne montre PAS le score brut par défaut.
// L'utilisateur voit un verdict lisible ; le détail chiffré est derrière
// « pourquoi ? », pour les curieux.

import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { scanMenu } from "./api";
import { colors, radius, spacing } from "./theme";
import { copy } from "../../../packages/shared/content.js";

// Seuils d'affichage — PROVISOIRES, à caler sur le jeu labellisé (D-006).
const SEUIL_LOCAL = 0.70;
const SEUIL_DOUTE = 0.45;

function verdict(score) {
  if (score >= SEUIL_LOCAL) {
    return { label: "Profil local", color: colors.local };
  }
  if (score >= SEUIL_DOUTE) {
    return { label: "Profil mixte", color: colors.mixed };
  }
  return { label: "Profil touristique", color: colors.brand };
}

/** Traduit les observations de la carte en phrases lisibles (D-009). */
function explications(obs, details) {
  const out = [];

  if (details?.cuisine_count === 1 && details?.dish_count) {
    out.push(`Carte resserrée : ${details.dish_count} plats, une seule cuisine.`);
  } else if (details?.cuisine_count > 2) {
    out.push(`Carte dispersée : ${details.cuisine_count} cuisines différentes.`);
  }
  if (details?.language_count >= 4) {
    out.push(`Carte traduite en ${details.language_count} langues.`);
  }
  if (details?.has_tourist_menu) {
    out.push("Propose une formule « menu touristique ».");
  }
  if (details?.has_dish_photos) {
    out.push("La carte affiche des photos des plats.");
  }
  if (obs?.vernacular_ratio >= 0.6) {
    out.push("Les plats gardent leurs noms d'origine.");
  }
  return out;
}

export default function ScanScreen() {
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  async function lancerScan(fromCamera) {
    setError(null);
    setResult(null);
    setShowDetail(false);

    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        fromCamera
          ? "Accès à l'appareil photo refusé."
          : "Accès à la photothèque refusé."
      );
      return;
    }

    const picker = fromCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    // quality 0.7 : au-delà, l'image gonfle sans gain de lisibilité pour le
    // modèle, et le backend refuse au-delà de 5 Mo.
    const shot = await picker({ quality: 0.7, mediaTypes: ["images"] });
    if (shot.canceled) return;

    const uri = shot.assets[0].uri;
    setPhoto(uri);
    setLoading(true);

    try {
      setResult(await scanMenu(uri));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const score = result?.menu_score;
  const v = score != null ? verdict(score) : null;
  const raisons = result ? explications(result.observations, result.details) : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{copy.scanTitle}</Text>
      <Text style={styles.subtitle}>
        {copy.scanSubtitle}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => lancerScan(true)}
          disabled={loading}
        >
          <Text style={styles.buttonPrimaryText}>Prendre une photo</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonGhost]}
          onPress={() => lancerScan(false)}
          disabled={loading}
        >
          <Text style={styles.buttonGhostText}>Choisir une image</Text>
        </Pressable>
      </View>

      {photo && <Image source={{ uri: photo }} style={styles.preview} />}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>Analyse de la carte…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {result && !result.readable && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Carte illisible</Text>
          <Text style={styles.muted}>{result.notes}</Text>
          <Text style={[styles.muted, styles.hint]}>
            Rapprochez-vous, évitez les reflets et cadrez la carte entière.
          </Text>
        </View>
      )}

      {result?.readable && v && (
        <View style={styles.card}>
          <View style={[styles.badge, { backgroundColor: v.color }]}>
            <Text style={styles.badgeText}>{v.label}</Text>
          </View>

          {raisons.map((r, i) => (
            <Text key={i} style={styles.reason}>
              • {r}
            </Text>
          ))}

          <Pressable onPress={() => setShowDetail((s) => !s)}>
            <Text style={styles.link}>
              {showDetail ? "Masquer le détail" : "Pourquoi ?"}
            </Text>
          </Pressable>

          {showDetail && (
            <View style={styles.detail}>
              {/* Le score chiffré n'apparaît qu'ici, volontairement (D-009). */}
              <Text style={styles.detailRow}>
                Signal menu : {(score * 100).toFixed(0)} / 100
              </Text>
              <Text style={styles.detailRow}>
                Cuisines : {result.observations.cuisines.join(", ") || "—"}
              </Text>
              <Text style={styles.detailRow}>
                Plats : {result.observations.dish_count}
              </Text>
              <Text style={styles.detailRow}>
                Langues : {result.observations.languages.join(", ") || "—"}
              </Text>
              <Text style={styles.detailRow}>
                Noms vernaculaires :{" "}
                {(result.observations.vernacular_ratio * 100).toFixed(0)} %
              </Text>
              <Text style={[styles.detailRow, styles.provisional]}>
                Pondérations provisoires — non encore calibrées.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  actions: { gap: spacing.sm },
  button: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonGhost: { borderWidth: 1, borderColor: colors.border },
  buttonGhostText: { color: colors.text, fontWeight: "500", fontSize: 16 },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    backgroundColor: colors.border,
  },
  center: { alignItems: "center", marginTop: spacing.lg, gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  hint: { marginTop: spacing.sm },
  errorBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: "#fdecec",
  },
  errorText: { color: colors.brandDark, fontSize: 14 },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
  badgeText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  reason: { color: colors.text, fontSize: 15, lineHeight: 21 },
  link: {
    color: colors.brand,
    fontWeight: "600",
    fontSize: 14,
    marginTop: spacing.xs,
  },
  detail: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  detailRow: { color: colors.textMuted, fontSize: 13 },
  provisional: { fontStyle: "italic", marginTop: spacing.xs },
});
