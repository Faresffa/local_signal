// apps/mobile/src/screens/ScanScreen.js
//
// Scan de carte : la fonctionnalité centrale du projet (D-004).
//
// LIÉ À UN RESTAURANT DÈS L'ENVOI (retour utilisateur : « on ne saura même
// pas c'est quel restaurant, c'est nul pour l'instant »). L'écran demandait
// jusqu'ici une photo sans jamais savoir de quel restaurant elle venait :
// l'analyse s'affichait puis se perdait, sans rejoindre le corpus structuré
// qui est l'actif du projet (CLAUDE.md §3). Le parcours est maintenant :
// chercher le restaurant → photographier sa carte → avis facultatif, même
// mécanisme que `AjouterCarte.jsx` côté web (D-038, D-039), auquel cet écran
// s'aligne.
//
// LA RECHERCHE PAR NOM EST VOLONTAIRE, PAS PAR POSITION. L'utilisateur est
// debout devant le restaurant, souvent avec un GPS imprécis en intérieur ; il
// connaît le nom affiché sur la devanture. `GET /api/restaurants/recherche`
// est public et ne porte aucune donnée sensible (backend/main.py).
//
// UN RESTAURANT INTROUVABLE N'A PAS DE REPLI VERS UN ENVOI ANONYME. C'est un
// choix délibéré : la version précédente de cet écran était précisément cet
// envoi anonyme, et c'est ce que ce chantier corrige. Un restaurant manquant
// de la base reste un trou à combler autrement (import OSM), pas une carte
// scannée à laisser sans rattache.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator, Image, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { envoyerCarte, laisserAvis, rechercherRestaurants } from "../api";
import { Button } from "../components/ui";
import { radius, spacing, useColors } from "../theme";

function Etoiles({ note, onChange, colors }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(note === n ? null : n)}
          accessibilityRole="button"
          accessibilityLabel={`${n} sur 5`}
          hitSlop={8}
          style={{ padding: 3 }}
        >
          <Feather
            name="star"
            size={24}
            color={n <= (note || 0) ? colors.mixed : colors.borderStrong}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function ScanScreen({ user }) {
  const colors = useColors();

  // --- Étape 1 : quel restaurant ---------------------------------------
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState([]);
  const [recherchant, setRecherchant] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const rechercheId = useRef(0);

  useEffect(() => {
    const terme = recherche.trim();
    if (terme.length < 2) { setResultats([]); return; }

    const id = ++rechercheId.current;
    setRecherchant(true);
    const t = setTimeout(() => {
      rechercherRestaurants(terme)
        .then((d) => { if (rechercheId.current === id) setResultats(d.restaurants ?? []); })
        .catch(() => { if (rechercheId.current === id) setResultats([]); })
        .finally(() => { if (rechercheId.current === id) setRecherchant(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [recherche]);

  // --- Étape 2 : photo ----------------------------------------------------
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- Étape 3 : avis facultatif -------------------------------------------
  const [avisOuvert, setAvisOuvert] = useState(false);
  const [note, setNote] = useState(null);
  const [texteAvis, setTexteAvis] = useState("");
  const [envoiAvis, setEnvoiAvis] = useState(false);
  const [avisEnvoye, setAvisEnvoye] = useState(false);

  function changerRestaurant() {
    setRestaurant(null);
    setPhoto(null);
    setResult(null);
    setError(null);
    setAvisOuvert(false);
    setAvisEnvoye(false);
    setNote(null);
    setTexteAvis("");
  }

  async function lancer(depuisCamera) {
    setError(null);
    setResult(null);

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
      setResult(await envoyerCarte(restaurant.id, uri));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function publierAvis() {
    if (!note && !texteAvis.trim()) return;
    setEnvoiAvis(true);
    try {
      await laisserAvis(restaurant.id, { rating: note, text: texteAvis.trim() || null });
      setAvisEnvoye(true);
      setAvisOuvert(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnvoiAvis(false);
    }
  }

  // Le résultat se révèle au lieu d'apparaître : après plusieurs secondes
  // d'attente, une apparition brutale se lit comme un rechargement d'écran.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!result) { reveal.setValue(0); return; }
    const animation = Animated.timing(reveal, {
      toValue: 1, duration: 480, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [result, reveal]);
  const styleReveal = {
    opacity: reveal,
    transform: [
      { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
      { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };

  // --- Étape 1 : pas encore de restaurant choisi ---------------------------
  if (!restaurant) {
    return (
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={[s.title, { color: colors.text }]}>Scanner une carte</Text>
        <Text style={[s.lede, { color: colors.textMuted }]}>
          Cherchez d'abord le restaurant — la photo rejoint sa fiche, et
          alimente son score dès l'envoi.
        </Text>

        <View style={[s.recherche, { borderColor: colors.borderStrong }]}>
          <Feather name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={recherche}
            onChangeText={setRecherche}
            placeholder="Nom du restaurant"
            placeholderTextColor={colors.textFaint}
            style={[s.rechercheInput, { color: colors.text }]}
            autoCorrect={false}
          />
        </View>

        {recherchant && <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />}

        {!recherchant && recherche.trim().length >= 2 && resultats.length === 0 && (
          <Text style={[s.lede, { color: colors.textFaint, marginTop: spacing.md }]}>
            Aucun restaurant trouvé pour « {recherche.trim()} ». Vérifiez
            l'orthographe, ou repérez-le d'abord depuis « Découvrir ».
          </Text>
        )}

        <View style={{ marginTop: spacing.sm }}>
          {resultats.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRestaurant(r)}
              style={[s.option, { borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.optionNom, { color: colors.text }]}>{r.name}</Text>
                <Text style={[s.optionMeta, { color: colors.textMuted }]}>
                  {[r.cuisine_label, r.address].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  // --- Étapes 2 et 3 : restaurant choisi, photo puis avis ------------------
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={changerRestaurant} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Changer de restaurant</Text>
      </Pressable>

      <Text style={[s.title, { color: colors.text }]}>{restaurant.name}</Text>
      <Text style={[s.lede, { color: colors.textMuted }]}>
        Photographiez la carte affichée en vitrine. Aucun avis n'est
        nécessaire pour contribuer.
      </Text>

      {!result && (
        <View style={s.actions}>
          <Button title="Prendre une photo" icon="camera" onPress={() => lancer(true)} disabled={loading} />
          <Button title="Choisir une image" icon="image" variant="ghost" onPress={() => lancer(false)} disabled={loading} />
        </View>
      )}

      {photo && (
        <Image source={{ uri: photo }} style={[s.preview, { backgroundColor: colors.skeleton }]} />
      )}

      {loading && (
        <View style={s.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Envoi et lecture en cours</Text>
        </View>
      )}

      {error && (
        <View style={[s.error, { backgroundColor: colors.brandSoft }]}>
          <Feather name="alert-circle" size={17} color={colors.brand} />
          <Text style={[s.errorText, { color: colors.brand }]}>{error}</Text>
        </View>
      )}

      {result && (
        <Animated.View style={[s.card, styleReveal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.okRow}>
            <Feather name="check-circle" size={18} color={colors.local} />
            <Text style={[s.body, { color: colors.text, flex: 1 }]}>{result.message}</Text>
          </View>

          {result.analysee ? (
            <Text style={[s.body, { color: colors.textMuted, marginTop: 6 }]}>
              Carte lue : signal de {Math.round((result.analyse?.menu_score ?? 0) * 100)} / 100.
              {result.analyse?.readable === false
                && " Le texte était partiellement illisible — la photo est conservée et sera relue."}
            </Text>
          ) : (
            <Text style={[s.body, { color: colors.textMuted, marginTop: 6 }]}>
              La lecture automatique n'a pas abouti cette fois. La photo est
              enregistrée et sera relue : rien n'est perdu.
            </Text>
          )}

          {/* AVIS FACULTATIF, RÉSERVÉ À UN COMPTE CONNECTÉ — même règle que
              Avis.js sur la fiche : un avis anonyme ne serait ni modifiable
              ni supprimable par son auteur. */}
          {user && !avisEnvoye && (
            <View style={{ marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              {!avisOuvert ? (
                <Button
                  title="Ajouter un avis (facultatif)"
                  icon="star"
                  variant="ghost"
                  onPress={() => setAvisOuvert(true)}
                />
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <Etoiles note={note} onChange={setNote} colors={colors} />
                  <TextInput
                    value={texteAvis}
                    onChangeText={setTexteAvis}
                    placeholder="Ce que vous avez mangé, l'accueil…"
                    placeholderTextColor={colors.textFaint}
                    multiline
                    style={[s.avisInput, { color: colors.text, borderColor: colors.border }]}
                  />
                  <Button
                    title={envoiAvis ? "Publication…" : "Publier l'avis"}
                    onPress={publierAvis}
                    disabled={envoiAvis || (!note && !texteAvis.trim())}
                  />
                </View>
              )}
            </View>
          )}

          {avisEnvoye && (
            <Text style={[s.body, { color: colors.local, marginTop: spacing.md }]}>
              Avis publié — merci.
            </Text>
          )}

          <Pressable onPress={changerRestaurant} style={{ marginTop: spacing.lg, minHeight: 44, justifyContent: "center" }}>
            <Text style={[s.link, { color: colors.brand }]}>Scanner un autre restaurant</Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: spacing.lg },

  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },

  recherche: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 13, paddingVertical: 11,
    borderWidth: 1, borderRadius: radius.sm,
  },
  rechercheInput: { flex: 1, fontSize: 15, padding: 0 },

  option: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  optionNom: { fontSize: 15, fontWeight: "600" },
  optionMeta: { fontSize: 12, marginTop: 2 },

  actions: { gap: spacing.sm },

  preview: { width: "100%", height: 210, borderRadius: radius.md, marginTop: spacing.lg },

  loading: { alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  loadingText: { fontSize: 14 },

  error: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.lg,
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 19 },

  card: { marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  okRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  body: { fontSize: 14, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: "600" },

  avisInput: {
    borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm,
    minHeight: 70, fontSize: 14, textAlignVertical: "top",
  },
});
