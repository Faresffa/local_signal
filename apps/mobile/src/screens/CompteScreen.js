// apps/mobile/src/screens/CompteScreen.js
//
// Connexion, inscription, déconnexion (LS-40) — et depuis ce chantier,
// paramètres du compte : rôle, Pass Voyageur, mot de passe, droits RGPD. Miroir
// fonctionnel de Profile.jsx + Settings.jsx côté web, réunis sur un seul
// écran mobile (même raison qu'avant : chaque écran empilé de plus coûte un
// retour sur téléphone, là où le web peut se permettre plusieurs pages).
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
  Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  Share, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { fetchMesDonnees, changerMotDePasse } from "../api";
import { Button } from "../components/ui";
import { useEntree } from "../lib/motion";
import { radius, spacing, useColors } from "../theme";

// Défaut affiché quand l'écran n'a pas été ouvert avec un motif contextuel
// (ex. « ajouter aux favoris »). Sans ça, un utilisateur qui ouvre l'onglet
// compte directement n'a aucune raison affichée de créer un compte.
const MOTIF_DEFAUT =
  "Contribuez une carte, gardez vos favoris, et retrouvez tout ça sur le site comme ici — c'est le même compte.";

const ROLE_LABEL = {
  admin: "Administrateur",
  subscriber: "Pass Voyageur actif",
  user: "Compte gratuit",
};

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

function Section({ titre, colors, children }) {
  return (
    <View style={[s.section, { borderTopColor: colors.border }]}>
      <Text style={[s.sectionTitre, { color: colors.text }]}>{titre}</Text>
      {children}
    </View>
  );
}

// Pas de pied de page sur mobile (D-037) : ces liens vivent ici, seul
// endroit où un compte — connecté ou non — passe forcément. Miroir du pied
// de page web (À propos / Contact / Faire un don).
function LiensBasDePage({ onGoToAbout, onGoToContact, onGoToDons, colors }) {
  return (
    <View style={s.piedLiens}>
      <Pressable onPress={onGoToAbout} style={s.piedLien}>
        <Text style={[s.piedLienTexte, { color: colors.textFaint }]}>À propos</Text>
      </Pressable>
      <Pressable onPress={onGoToContact} style={s.piedLien}>
        <Text style={[s.piedLienTexte, { color: colors.textFaint }]}>Contact</Text>
      </Pressable>
      <Pressable onPress={onGoToDons} style={s.piedLien}>
        <Text style={[s.piedLienTexte, { color: colors.textFaint }]}>Faire un don</Text>
      </Pressable>
    </View>
  );
}

export default function CompteScreen({
  user, onLogin, onSignup, onLogout, onBack, motif, modeDepart,
  onGoToCGU, onGoToConfidentialite, onGoToPricing, onUnsubscribe, onDeleteAccount,
  onGoToAbout, onGoToContact, onGoToDons,
}) {
  const colors = useColors();
  const entree = useEntree(60);

  const [mode, setMode] = useState(modeDepart || "login");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);

  // --- Mot de passe (compte connecté) ---
  const [mdpActuel, setMdpActuel] = useState("");
  const [mdpNouveau, setMdpNouveau] = useState("");
  const [erreurMdp, setErreurMdp] = useState(null);
  const [statutMdp, setStatutMdp] = useState("idle");

  const [statutExport, setStatutExport] = useState("idle");
  const [statutAbonnement, setStatutAbonnement] = useState("idle");

  const inscription = mode === "signup";

  function valider() {
    const e = {};
    if (!nom.trim() && inscription) e.nom = "Le nom d'utilisateur est requis.";
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    // Même seuil que côté serveur : autant prévenir avant l'envoi.
    if (inscription && motDePasse.length < 8) e.motDePasse = "8 caractères minimum.";
    if (!inscription && !motDePasse) e.motDePasse = "Mot de passe requis.";
    if (inscription && !accepteConditions) {
      e.conditions = "Vous devez accepter les CGU et la politique de confidentialité.";
    }
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre() {
    if (!valider()) return;
    setEnvoi(true);
    try {
      if (inscription) {
        await onSignup({
          email: email.trim(), password: motDePasse, name: nom.trim(),
          acceptedTerms: accepteConditions,
        });
      } else {
        await onLogin({ email: email.trim(), password: motDePasse });
      }
    } catch (err) {
      setErreurs({ global: err.message });
    } finally {
      setEnvoi(false);
    }
  }

  async function soumettreMdp() {
    setErreurMdp(null);
    if (mdpNouveau.length < 8) {
      setErreurMdp("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setStatutMdp("sending");
    try {
      await changerMotDePasse(mdpActuel, mdpNouveau);
      setMdpActuel("");
      setMdpNouveau("");
      setStatutMdp("done");
    } catch (err) {
      setErreurMdp(err.message);
      setStatutMdp("idle");
    }
  }

  async function telechargerDonnees() {
    setStatutExport("sending");
    try {
      const donnees = await fetchMesDonnees();
      // Pas de systeme de fichiers ici : `Share` est le geste natif pour
      // « faire sortir » une donnee de l'app (enregistrer, envoyer par
      // e-mail, copier) sans dependance native supplementaire.
      await Share.share({ message: JSON.stringify(donnees, null, 2) });
    } catch (err) {
      Alert.alert("Export impossible", err.message);
    } finally {
      setStatutExport("idle");
    }
  }

  function confirmerSuppression() {
    Alert.alert(
      "Supprimer votre compte ?",
      "Suppression définitive et immédiate : compte, avis, réservations. Impossible à annuler.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await onDeleteAccount();
            } catch (err) {
              Alert.alert("Suppression impossible", err.message);
            }
          },
        },
      ],
    );
  }

  async function toggleAbonnement() {
    setStatutAbonnement("sending");
    try {
      await onUnsubscribe();
    } finally {
      setStatutAbonnement("idle");
    }
  }

  // --- Déjà connecté : l'écran devient celui du compte ---------------------
  if (user) {
    const abonne = user.role === "subscriber";

    return (
      <ScrollView contentContainerStyle={s.page}>
        <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.brand} />
          <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
        </Pressable>

        <Animated.View style={entree}>
          <Text style={[s.titre, { color: colors.text }]}>Mon compte</Text>

          <View style={[s.bloc, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.nom, { color: colors.text }]}>{user.name || "Voyageur"}</Text>
            <Text style={[s.email, { color: colors.textMuted }]}>{user.email}</Text>
            <View style={[s.roleBadge, { backgroundColor: colors.surfaceSunken }]}>
              <Text style={[s.roleBadgeTexte, { color: colors.textMuted }]}>
                {ROLE_LABEL[user.role] || ROLE_LABEL.user}
              </Text>
            </View>
          </View>

          {user.role !== "admin" && (
            <Section titre="Pass Voyageur" colors={colors}>
              <Text style={[s.sectionAide, { color: colors.textMuted }]}>
                Formule actuelle : {ROLE_LABEL[user.role] || ROLE_LABEL.user}.
              </Text>
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  title={
                    statutAbonnement === "sending"
                      ? "Désactivation…"
                      : abonne ? "Désactiver mon Pass" : "Voir les Pass"
                  }
                  variant={abonne ? "ghost" : "primary"}
                  icon="credit-card"
                  onPress={abonne ? toggleAbonnement : onGoToPricing}
                  disabled={statutAbonnement === "sending"}
                />
              </View>
            </Section>
          )}

          <Section titre="Vos données" colors={colors}>
            <View style={{ gap: spacing.sm }}>
              <Button
                title={statutExport === "sending" ? "Préparation…" : "Télécharger mes données"}
                variant="ghost"
                icon="download"
                onPress={telechargerDonnees}
                disabled={statutExport === "sending"}
              />
              <Text style={[s.sectionAide, { color: colors.textFaint }]}>
                Compte, sessions, réservations et avis laissés par le passé — au format JSON.
              </Text>
              <Button
                title="Supprimer mon compte"
                variant="ghost"
                icon="trash-2"
                onPress={confirmerSuppression}
              />
            </View>
          </Section>

          <Section titre="Mot de passe" colors={colors}>
            <View style={{ gap: spacing.md }}>
              <Champ
                label="Mot de passe actuel"
                value={mdpActuel}
                onChangeText={setMdpActuel}
                secureTextEntry
                autoComplete="current-password"
              />
              <Champ
                label="Nouveau mot de passe"
                value={mdpNouveau}
                onChangeText={setMdpNouveau}
                secureTextEntry
                autoComplete="new-password"
                aide="8 caractères minimum."
              />
              {erreurMdp && (
                <Text style={[s.erreur, { color: colors.brand }]} accessibilityRole="alert">
                  {erreurMdp}
                </Text>
              )}
              {statutMdp === "done" && (
                <Text style={[s.sectionAide, { color: colors.local }]}>Mot de passe modifié.</Text>
              )}
              <Button
                title={statutMdp === "sending" ? "Enregistrement…" : "Changer mon mot de passe"}
                icon="lock"
                onPress={soumettreMdp}
                disabled={statutMdp === "sending"}
              />
            </View>
          </Section>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="Se déconnecter" variant="ghost" icon="log-out" onPress={onLogout} />
          </View>

          <LiensBasDePage
            onGoToAbout={onGoToAbout}
            onGoToContact={onGoToContact}
            onGoToDons={onGoToDons}
            colors={colors}
          />
        </Animated.View>
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

        <Animated.View style={entree}>
        <View style={[s.marque, { backgroundColor: colors.brand }]} aria-hidden="true">
          <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={colors.onBrand} />
        </View>

        <Text style={[s.titre, { color: colors.text }]}>
          {inscription ? "Créer un compte" : "Se connecter"}
        </Text>

        {/* POURQUOI ON DEMANDE ÇA, MAINTENANT. Arriver sur un formulaire sans
            savoir ce qu'on y gagne est la première cause d'abandon. Le motif
            vient de l'écran qui a demandé la connexion ; à défaut, un motif
            générique reste affiché plutôt que rien (LS-refonte). */}
        <Text style={[s.motif, { color: colors.textMuted }]}>{motif || MOTIF_DEFAUT}</Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {inscription && (
            <Champ
              label="Nom d'utilisateur"
              value={nom}
              onChangeText={setNom}
              erreur={erreurs.nom}
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

          {inscription && (
            <Pressable
              onPress={() => setAccepteConditions((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepteConditions }}
              style={s.conditions}
            >
              <View
                style={[
                  s.checkbox,
                  { borderColor: erreurs.conditions ? colors.brand : colors.border },
                  accepteConditions && { backgroundColor: colors.brand, borderColor: colors.brand },
                ]}
              >
                {accepteConditions && <Feather name="check" size={13} color={colors.onBrand} />}
              </View>
              <Text style={[s.conditionsTexte, { color: colors.textMuted }]}>
                J'accepte les{" "}
                <Text style={{ color: colors.brand, fontWeight: "600" }} onPress={onGoToCGU}>
                  conditions générales d'utilisation
                </Text>{" "}
                et la{" "}
                <Text style={{ color: colors.brand, fontWeight: "600" }} onPress={onGoToConfidentialite}>
                  politique de confidentialité
                </Text>.
              </Text>
            </Pressable>
          )}
          {erreurs.conditions && (
            <Text style={[s.erreur, { color: colors.brand }]}>{erreurs.conditions}</Text>
          )}

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

          <LiensBasDePage
            onGoToAbout={onGoToAbout}
            onGoToContact={onGoToContact}
            onGoToDons={onGoToDons}
            colors={colors}
          />
        </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },

  marque: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },

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

  conditions: { flexDirection: "row", alignItems: "flex-start", gap: 9, minHeight: 44 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  conditionsTexte: { flex: 1, fontSize: 13, lineHeight: 18 },

  bloc: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: 3,
  },
  nom: { fontSize: 17, fontWeight: "700" },
  email: { fontSize: 14 },
  roleBadge: {
    alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: radius.sm,
  },
  roleBadgeTexte: { fontSize: 11, fontWeight: "700" },
  note: { marginTop: spacing.md, fontSize: 12, lineHeight: 17 },

  section: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1 },
  sectionTitre: { fontSize: 16, fontWeight: "700", marginBottom: spacing.sm },
  sectionAide: { fontSize: 12, lineHeight: 17 },

  piedLiens: {
    flexDirection: "row", justifyContent: "center", gap: spacing.lg,
    marginTop: spacing.xl,
  },
  piedLien: { minHeight: 44, justifyContent: "center" },
  piedLienTexte: { fontSize: 12, fontWeight: "500" },

  lien: { fontSize: 14, fontWeight: "600" },
});
