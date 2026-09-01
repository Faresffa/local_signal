// apps/mobile/src/screens/ScanScreen.js
//
// Scan de carte : la fonctionnalité centrale du projet (D-004).
//
// L'utilisateur est debout devant le restaurant. Il photographie la carte
// affichée en vitrine et obtient une réponse en quelques secondes, sans qu'un
// seul avis ne soit nécessaire. C'est la réponse au paradoxe de l'invisibilité
// (D-001), et ce qui justifie une application native plutôt qu'un site.

import { useState } from "react";
import {
  ActivityIndicator, Image, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { scanMenu } from "../api";
import { Button, Verdict } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

// Seuils du verdict menu. PROVISOIRES : à caler sur le jeu labellisé (D-006).
const SEUIL_LOCAL = 0.7;
const SEUIL_MIXTE = 0.45;

function verdictMenu(score) {
  if (score >= SEUIL_LOCAL) return { label: "Profil local", tone: "local" };
  if (score >= SEUIL_MIXTE) return { label: "Profil mixte", tone: "mixed" };
  return { label: "Profil touristique", tone: "tourist" };
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
  if (details?.has_tourist_menu) out.push("Propose une formule « menu touristique ».");
  if (details?.has_dish_photos) out.push("La carte affiche des photos des plats.");
  if (obs?.vernacular_ratio >= 0.6) out.push("Les plats gardent leurs noms d'origine.");
  return out;
}

export default function ScanScreen() {
  const colors = useColors();

  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);

  async function lancer(depuisCamera) {
    setError(null);
    setResult(null);
    setOpenDetail(false);

    const permission = depuisCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        depuisCamera
          ? "Accès à l'appareil photo refusé. Autorisez-le dans les réglages."
          : "Accès à la photothèque refusé. Autorisez-le dans les réglages.",
      );
      return;
    }

    const picker = depuisCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    // quality 0.7 : au-delà l'image gonfle sans gain de lisibilité pour le
    // modèle, et le serveur refuse au-delà de 5 Mo.
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
  const v = score != null ? verdictMenu(score) : null;
  const raisons = result ? explications(result.observations, result.details) : [];

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={[s.title, { color: colors.text }]}>Scanner une carte</Text>
      <Text style={[s.lede, { color: colors.textMuted }]}>
        Photographiez la carte affichée en vitrine. Aucun avis n'est nécessaire
        pour obtenir une évaluation.
      </Text>

      <View style={s.actions}>
        <Button
          title="Prendre une photo"
          icon="camera"
          onPress={() => lancer(true)}
          disabled={loading}
        />
        <Button
          title="Choisir une image"
          icon="image"
          variant="ghost"
          onPress={() => lancer(false)}
          disabled={loading}
        />
      </View>

      {photo && (
        <Image
          source={{ uri: photo }}
          style={[s.preview, { backgroundColor: colors.skeleton }]}
        />
      )}

      {loading && (
        <View style={s.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>
            Lecture de la carte en cours
          </Text>
        </View>
      )}

      {error && (
        <View style={[s.error, { backgroundColor: colors.brandSoft }]}>
          <Feather name="alert-circle" size={17} color={colors.brand} />
          <Text style={[s.errorText, { color: colors.brand }]}>{error}</Text>
        </View>
      )}

      {result && !result.readable && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Carte illisible</Text>
          <Text style={[s.body, { color: colors.textMuted }]}>{result.notes}</Text>
          <Text style={[s.body, { color: colors.textMuted, marginTop: 6 }]}>
            Rapprochez-vous, évitez les reflets et cadrez la carte entière.
          </Text>
        </View>
      )}

      {result?.readable && v && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Verdict tone={v.tone} label={v.label} size="lg" />

          <View style={{ marginTop: spacing.md, gap: 7 }}>
            {raisons.map((r) => (
              <View key={r} style={s.raisonRow}>
                <View style={[s.dot, { backgroundColor: colors.brand }]} />
                <Text style={[s.body, { color: colors.text, flex: 1 }]}>{r}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setOpenDetail((o) => !o)}
            accessibilityRole="button"
            style={{ marginTop: spacing.md, minHeight: 30, justifyContent: "center" }}
          >
            <Text style={[s.link, { color: colors.brand }]}>
              {openDetail ? "Masquer le détail" : "Pourquoi ?"}
            </Text>
          </Pressable>

          {openDetail && (
            <View style={[s.detail, { borderTopColor: colors.border }]}>
              {/* Le score chiffré n'apparaît qu'ici, volontairement (D-009). */}
              <Ligne label="Signal menu" value={`${Math.round(score * 100)} / 100`} />
              <Ligne
                label="Cuisines"
                value={result.observations.cuisines.join(", ") || "non détectée"}
              />
              <Ligne label="Plats" value={String(result.observations.dish_count)} />
              <Ligne
                label="Langues"
                value={result.observations.languages.join(", ") || "non détectée"}
              />
              <Ligne
                label="Noms d'origine"
                value={`${Math.round(result.observations.vernacular_ratio * 100)} %`}
              />
              <Text style={[s.note, { color: colors.textFaint }]}>
                Pondérations provisoires, non encore calibrées sur un jeu de
                données labellisé.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Ligne({ label, value }) {
  const colors = useColors();
  return (
    <View style={s.ligne}>
      <Text style={[s.ligneLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.ligneValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  lede: { fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: spacing.lg },

  actions: { gap: spacing.sm },

  preview: {
    width: "100%",
    height: 210,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },

  loading: { alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  loadingText: { fontSize: 14 },

  error: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 19 },

  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  cardTitle: { fontSize: 17, fontWeight: "600", marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 19 },

  raisonRow: { flexDirection: "row", gap: 9 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  link: { fontSize: 14, fontWeight: "600" },

  detail: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, gap: 7 },
  ligne: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  ligneLabel: { fontSize: 13 },
  ligneValue: { fontSize: 13, fontWeight: "600" },
  note: { fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
