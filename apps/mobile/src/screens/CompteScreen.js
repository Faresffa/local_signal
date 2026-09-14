// apps/mobile/src/screens/CompteScreen.js
//
// Connexion, inscription, déconnexion (LS-40).
//
// UN SEUL ÉCRAN POUR LES DEUX FORMULAIRES, là où le web en a deux. Ce n'est
// pas une divergence de produit mais de support : sur le web, passer de
// « connexion » à « inscription » coûte un clic et rien d'autre. Sur un
// téléphone, chaque écran empilé de plus est un retour à faire, et les deux
// formulaires diffèrent d'un seul champ. Les mots, les règles de validation et
// les messages sont en revanche exactement ceux du web — c'est le même produit
// (D-037).
//
// LE COMPTE EST LE MÊME DES DEUX CÔTÉS : même table, même jeton, même durée.
// S'inscrire ici, c'est pouvoir se connecter sur le web, et l'inverse.

import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { Button } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

function Champ({ label, aide, erreur, ...props }) {
  const colors = useColors();

  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.textFaint}
        style={[
          s.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: erreur ? colors.brand : colors.border,
          },
        ]}
      />
      {aide && !erreur && <Text style={[s.aide, { color: colors.textFaint }]}>{aide}</Text>}
      {erreur && <Text style={[s.erreur, { color: colors.brand }]}>{erreur}</Text>}
    </View>
  );
}

export default function CompteScreen({ user, onLogin, onSignup, onLogout, onBack, motif }) {
  const colors = useColors();

  const [mode, setMode] = useState("login");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);

  const inscription = mode === "signup";

  function valider() {
    const e = {};
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    // Même seuil que côté serveur : autant prévenir avant l'envoi.
    if (inscription && motDePasse.length < 8) e.motDePasse = "8 caractères minimum.";
    if (!inscription && !motDePasse) e.motDePasse = "Mot de passe requis.";
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre() {
    if (!valider()) return;
    setEnvoi(true);
    try {
      if (inscription) {
        await onSignup({ email: email.trim(), password: motDePasse, name: nom.trim() || undefined });
      } else {
        await onLogin({ email: email.trim(), password: motDePasse });
      }
    } catch (err) {
      setErreurs({ global: err.message });
    } finally {
      setEnvoi(false);
    }
  }

  // --- Déjà connecté : l'écran devient celui du compte ---------------------
  if (user) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.brand} />
          <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
        </Pressable>

        <Text style={[s.titre, { color: colors.text }]}>Mon compte</Text>

        <View style={[s.bloc, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.nom, { color: colors.text }]}>{user.name || "Voyageur"}</Text>
          <Text style={[s.email, { color: colors.textMuted }]}>{user.email}</Text>
        </View>

        <Text style={[s.note, { color: colors.textFaint }]}>
          Ce compte est le même sur le site et sur l'application. Vos avis et
          vos contributions vous suivent d'un écran à l'autre.
        </Text>

        <View style={{ marginTop: spacing.lg }}>
          <Button title="Se déconnecter" variant="ghost" icon="log-out" onPress={onLogout} />
        </View>
      </ScrollView>
    );
  }

  // --- Non connecté : connexion ou inscription -----------------------------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.brand} />
          <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
        </Pressable>

        <Text style={[s.titre, { color: colors.text }]}>
          {inscription ? "Créer un compte" : "Se connecter"}
        </Text>

        {/* POURQUOI ON DEMANDE ÇA, MAINTENANT. Arriver sur un formulaire sans
            savoir ce qu'on y gagne est la première cause d'abandon. Le motif
            vient de l'écran qui a demandé la connexion. */}
        {motif && <Text style={[s.motif, { color: colors.textMuted }]}>{motif}</Text>}

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {inscription && (
            <Champ
              label="Nom (facultatif)"
              value={nom}
              onChangeText={setNom}
              autoComplete="name"
              placeholder="Comment vous appeler"
            />
          )}

          <Champ
            label="Adresse électronique"
            value={email}
            onChangeText={setEmail}
            erreur={erreurs.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="vous@exemple.fr"
          />

          <Champ
            label="Mot de passe"
            value={motDePasse}
            onChangeText={setMotDePasse}
            erreur={erreurs.motDePasse}
            aide={inscription ? "8 caractères minimum." : undefined}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={inscription ? "new-password" : "current-password"}
          />

          {erreurs.global && (
            <Text style={[s.erreur, { color: colors.brand }]} accessibilityRole="alert">
              {erreurs.global}
            </Text>
          )}

          <Button
            title={
              envoi
                ? (inscription ? "Création en cours" : "Connexion en cours")
                : (inscription ? "Créer mon compte" : "Se connecter")
            }
            onPress={soumettre}
            disabled={envoi}
          />

          <Pressable
            onPress={() => { setMode(inscription ? "login" : "signup"); setErreurs({}); }}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[s.lien, { color: colors.brand }]}>
              {inscription
                ? "Déjà un compte ? Se connecter"
                : "Pas encore de compte ? Créer un compte"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },

  titre: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  motif: { marginTop: spacing.sm, fontSize: 14, lineHeight: 19 },

  label: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    // 46 points : un champ plus bas se rate au pouce, un champ plus haut fait
    // remonter le clavier sur le bouton d'envoi.
    minHeight: 46,
    fontSize: 15,
  },
  aide: { fontSize: 12 },
  erreur: { fontSize: 12, lineHeight: 17 },

  bloc: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: 3,
  },
  nom: { fontSize: 17, fontWeight: "700" },
  email: { fontSize: 14 },
  note: { marginTop: spacing.md, fontSize: 12, lineHeight: 17 },

  lien: { fontSize: 14, fontWeight: "600" },
});
