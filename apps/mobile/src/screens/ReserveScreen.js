// apps/mobile/src/screens/ReserveScreen.js
//
// Formulaire de réservation.
//
// Étiquette au-dessus du champ, aide et erreur en dessous. Jamais de
// marque-place tenant lieu d'étiquette : il disparaît dès que l'utilisateur
// tape, et personne ne se souvient de ce qu'il demandait.

import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { createReservation } from "../api";
import { Button } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

const CRENEAUX = ["12:00", "12:30", "13:00", "19:00", "19:30", "20:00", "20:30", "21:00"];
const TAILLES = [1, 2, 3, 4, 5, 6];

export default function ReserveScreen({ restaurant, onBack, onDone }) {
  const colors = useColors();

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [personnes, setPersonnes] = useState(2);
  const [creneau, setCreneau] = useState(null);

  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [confirmation, setConfirmation] = useState(null);

  function valider() {
    const e = {};
    if (!nom.trim()) e.nom = "Indiquez le nom de la réservation.";
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    if (!creneau) e.creneau = "Choisissez une heure.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre() {
    if (!valider()) return;
    setStatus("sending");
    try {
      const res = await createReservation({
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        user_name: nom.trim(),
        user_email: email.trim(),
        num_persons: personnes,
        date: new Date().toISOString().slice(0, 10),
        time_slot: creneau,
      });
      setConfirmation(res);
      setStatus("done");
    } catch (err) {
      setErrors({ global: err.message });
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <View style={s.confirm}>
        <Feather name="check-circle" size={44} color={colors.local} />
        <Text style={[s.confirmTitle, { color: colors.text }]}>
          Réservation confirmée
        </Text>
        <Text style={[s.confirmText, { color: colors.textMuted }]}>
          {confirmation?.message || `Table réservée chez ${restaurant.name}.`}
        </Text>
        <Button title="Retour aux restaurants" onPress={onDone} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.brand} />
          <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
        </Pressable>

        <Text style={[s.title, { color: colors.text }]}>Réserver</Text>
        <Text style={[s.lede, { color: colors.textMuted }]}>{restaurant.name}</Text>

        <Champ
          label="Nom de la réservation"
          value={nom}
          onChangeText={setNom}
          autoComplete="name"
          error={errors.nom}
        />

        <Champ
          label="Adresse électronique"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          hint="Sert uniquement à vous envoyer la confirmation."
          error={errors.email}
        />

        <Text style={[s.label, { color: colors.text }]}>Nombre de personnes</Text>
        <View style={s.row}>
          {TAILLES.map((n) => (
            <Pressable
              key={n}
              onPress={() => setPersonnes(n)}
              accessibilityRole="button"
              accessibilityState={{ selected: personnes === n }}
              style={[
                s.pill,
                { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                personnes === n && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text
                style={[
                  s.pillText,
                  { color: personnes === n ? colors.onBrand : colors.textMuted },
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[s.label, { color: colors.text, marginTop: spacing.md }]}>
          Heure
        </Text>
        <View style={s.row}>
          {CRENEAUX.map((h) => (
            <Pressable
              key={h}
              onPress={() => setCreneau(h)}
              accessibilityRole="button"
              accessibilityState={{ selected: creneau === h }}
              style={[
                s.pill,
                s.pillWide,
                { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                creneau === h && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text
                style={[
                  s.pillText,
                  { color: creneau === h ? colors.onBrand : colors.textMuted },
                ]}
              >
                {h}
              </Text>
            </Pressable>
          ))}
        </View>
        {errors.creneau && (
          <Text style={[s.error, { color: colors.brand }]}>{errors.creneau}</Text>
        )}

        {errors.global && (
          <Text style={[s.error, { color: colors.brand, marginTop: spacing.md }]}>
            {errors.global}
          </Text>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            title={status === "sending" ? "Envoi en cours" : "Confirmer la réservation"}
            onPress={soumettre}
            disabled={status === "sending"}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Champ({ label, hint, error, ...props }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        {...props}
        style={[
          s.input,
          {
            borderColor: error ? colors.brand : colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.text,
          },
        ]}
        placeholderTextColor={colors.textFaint}
      />
      {hint && !error && (
        <Text style={[s.hint, { color: colors.textMuted }]}>{hint}</Text>
      )}
      {error && <Text style={[s.error, { color: colors.brand }]}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },

  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  lede: { fontSize: 15, marginTop: 2, marginBottom: spacing.sm },

  label: { fontSize: 14, fontWeight: "500", marginBottom: 6 },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: radius.sm,
    fontSize: 15,
  },
  hint: { fontSize: 12, marginTop: 5 },
  error: { fontSize: 12, marginTop: 5 },

  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minWidth: 46,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  pillWide: { minWidth: 68 },
  pillText: { fontSize: 15, fontWeight: "500" },

  confirm: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  confirmTitle: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  confirmText: { fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 300 },
});
