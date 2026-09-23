// apps/mobile/src/components/AjouterCarte.js
//
// Envoi de la photo d'une carte depuis la fiche du restaurant (D-038, D-039).
// Miroir de apps/web/src/components/AjouterCarte.jsx.
//
// C'EST LE MÉCANISME PAR LEQUEL L'ACTIF DU PROJET SE CONSTRUIT (CLAUDE.md §3).
// L'onglet Scanner reste : il répond au cas où l'on est devant un restaurant
// qu'on n'a pas encore trouvé dans la liste. Mais son analyse est affichée
// puis perdue, faute de restaurant à qui la rattacher. Ici, la photo arrive
// déjà liée — c'est ce qui la fait entrer dans la base plutôt que dans le
// vide.
//
// PAS DE CONNEXION EXIGÉE. Le premier réflexe devant une carte en vitrine est
// de la photographier, pas de créer un compte.
//
// L'IMAGE EST CONSERVÉE, JAMAIS SERVIE (D-038) : elle rejoint un corpus
// interne qui permet de vérifier ce que la lecture automatique en a tiré, et
// de la refaire si les méthodes s'améliorent.

import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { envoyerCarte, fetchCartes } from "../api";
import { Button } from "./ui";
import { radius, spacing, useColors } from "../theme";

export default function AjouterCarte({ restaurantId, onLue }) {
  const colors = useColors();

  const [photo, setPhoto] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [deja, setDeja] = useState(0);

  useEffect(() => {
    let annule = false;
    fetchCartes(restaurantId)
      .then((d) => { if (!annule) setDeja(d.nombre ?? 0); })
      .catch(() => {});
    return () => { annule = true; };
  }, [restaurantId]);

  async function choisir(depuisCamera) {
    setErreur(null);
    setResultat(null);

    const permission = depuisCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErreur(
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
    // modèle, et le serveur refuse les fichiers trop lourds.
    const prise = await picker({ quality: 0.7, mediaTypes: ["images"] });
    if (prise.canceled) return;

    setPhoto(prise.assets[0].uri);
  }

  async function envoyer() {
    if (!photo) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await envoyerCarte(restaurantId, photo);
      setResultat(r);
      setPhoto(null);
      setDeja((n) => n + 1);
      if (r.analysee) onLue?.(r);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <View style={[s.bloc, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.tete}>
        <View style={s.titreLigne}>
          <Feather name="camera" size={17} color={colors.text} />
          <Text style={[s.titre, { color: colors.text }]}>Ajouter la carte</Text>
        </View>
        {deja > 0 && (
          <Text style={[s.deja, { color: colors.textMuted }]}>
            {deja} {deja > 1 ? "cartes envoyées" : "carte envoyée"}
          </Text>
        )}
      </View>

      <Text style={[s.pitch, { color: colors.textMuted }]}>
        Une photo de la carte suffit à mesurer ce restaurant, même s'il n'a
        aucun avis. C'est le signal qui compte le plus dans le score.
      </Text>

      {!photo && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Button title="Photographier la carte" icon="camera" onPress={() => choisir(true)} />
          <Pressable
            onPress={() => choisir(false)}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={[s.lien, { color: colors.brand }]}>Choisir dans mes photos</Text>
          </Pressable>
        </View>
      )}

      {photo && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Image
            source={{ uri: photo }}
            style={[s.apercu, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}
            resizeMode="contain"
          />
          <Button
            title={envoi ? "Lecture en cours…" : "Envoyer la carte"}
            icon="upload"
            onPress={envoyer}
            disabled={envoi}
          />
          <Button
            title="Changer de photo"
            variant="ghost"
            onPress={() => setPhoto(null)}
            disabled={envoi}
          />
        </View>
      )}

      {resultat && (
        <View style={[s.resultat, { backgroundColor: colors.localSoft }]}>
          <View style={s.okLigne}>
            <Feather name="check-circle" size={16} color={colors.local} />
            <Text style={[s.ok, { color: colors.local }]}>{resultat.message}</Text>
          </View>

          {resultat.analysee ? (
            <Text style={[s.lecture, { color: colors.textMuted }]}>
              Carte lue : signal de{" "}
              {Math.round((resultat.analyse?.menu_score ?? 0) * 100)} / 100.
              {resultat.analyse?.readable === false
                ? " Le texte était partiellement illisible — la photo est conservée et sera relue."
                : ""}
            </Text>
          ) : (
            /* NE PAS FAIRE PASSER UNE PANNE POUR UN SUCCÈS. L'image est
               déposée avant l'analyse, précisément pour que l'indisponibilité
               du modèle ne coûte pas la contribution. */
            <Text style={[s.lecture, { color: colors.textMuted }]}>
              La lecture automatique n'a pas abouti cette fois. La photo est
              enregistrée et sera relue : rien n'est perdu.
            </Text>
          )}
        </View>
      )}

      {erreur && (
        <View style={s.erreurLigne}>
          <Feather name="alert-triangle" size={15} color={colors.brand} />
          <Text style={[s.erreur, { color: colors.brand }]}>{erreur}</Text>
        </View>
      )}

      <Text style={[s.mention, { color: colors.textFaint, borderTopColor: colors.border }]}>
        La photo rejoint un corpus interne qui sert à vérifier et à améliorer la
        lecture automatique. Elle n'est ni publiée, ni affichée, ni revendue.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  tete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  titreLigne: { flexDirection: "row", alignItems: "center", gap: 7 },
  titre: { fontSize: 16, fontWeight: "600" },
  deja: { fontSize: 12 },

  pitch: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  lien: { fontSize: 14, fontWeight: "600" },

  apercu: { width: "100%", height: 220, borderWidth: 1, borderRadius: radius.sm },

  resultat: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, gap: 5 },
  okLigne: { flexDirection: "row", alignItems: "center", gap: 7 },
  ok: { flex: 1, fontSize: 14, fontWeight: "600" },
  lecture: { fontSize: 12, lineHeight: 17 },

  erreurLigne: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm },
  erreur: { flex: 1, fontSize: 13, lineHeight: 18 },

  mention: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
