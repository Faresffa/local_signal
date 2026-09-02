// apps/mobile/src/screens/SearchScreen.js
//
// Écran de recherche — pendant mobile du formulaire web (D-026).
//
// « Autour de moi » dépend entièrement du GPS : un utilisateur qui n'est pas
// dans la zone relevée n'a aucun moyen d'explorer. Cet écran lui donne quatre
// façons de choisir son point de départ :
//   1. la position GPS,
//   2. une adresse ou une ville saisie, avec suggestions,
//   3. un point posé sur la carte,
//   4. un lieu du Quartier latin en accès direct.
//
// La quatrième existe parce que la base ne couvre qu'une zone : demander une
// adresse sans dire laquelle est couverte revient à faire deviner. Elle
// renseigne, elle ne restreint pas — les trois autres acceptent le monde.
//
// Les textes viennent de packages/shared/content.js (D-026) et les couleurs de
// packages/shared/tokens.js (D-022) : rien n'est écrit en dur ici.

import { useEffect, useRef, useState } from "react";
import {
  Animated, FlatList, Pressable, ScrollView, StyleSheet, Text,
  TextInput, useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { fetchRestaurants } from "../api";
import MapPicker from "../components/MapPicker";
import {
  Button, CardSkeleton, CuisineVisual, ErrorState, Verdict,
} from "../components/ui";
import { radius, spacing, useColors } from "../theme";
import { distance, verdict } from "../lib/display";
import { copy, demoPlaces, fallbackLocation } from "../../../../packages/shared/content.js";

// Sans limite de temps, un appareil sans fix GPS récent laisse l'écran figé.
const DELAI_GPS_MS = 7000;

// PORTÉE DE VALIDATION ≠ PORTÉE D'USAGE. Le mémoire évalue le calcul sur un
// arrondissement ; le produit doit accepter n'importe quel point du globe. Le
// géocodage n'est donc borné à aucune zone : la couverture est une limite de
// la BASE, et c'est aux résultats de le dire — pas au champ de le refuser.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const BUDGETS = [
  { label: "Tous budgets", min: 0, max: 200 },
  { label: "Moins de 20 €", min: 0, max: 20 },
  { label: "20 – 40 €", min: 20, max: 40 },
  { label: "Plus de 40 €", min: 40, max: 200 },
];

/** Trois premiers segments d'une adresse Nominatim, le reste est du bruit. */
function libelleCourt(item) {
  return (item.display_name || "").split(",").slice(0, 3).join(",").trim();
}

function Carte({ item, onOpen, isDark, index }) {
  const colors = useColors();
  const v = verdict(item.local_signal, item.confidence);
  const dist = distance(item.scoring?.relevance?.distance_m ?? item.distance_m);
  const raison = item.scoring?.reasons?.[0];

  // Même entrée échelonnée que l'écran « autour de vous » : les deux listes
  // doivent se comporter pareil, sinon l'application paraît faite en morceaux.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index * 55, 420),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${v.label}`}
        style={({ pressed }) => [
          s.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
      >
        <View>
          <CuisineVisual id={item.id} cuisine={item.cuisine} isDark={isDark} />
          {dist && (
            <View style={[s.distance, { backgroundColor: colors.surface }]}>
              <Text style={[s.distanceText, { color: colors.text }]}>{dist}</Text>
            </View>
          )}
        </View>

        <View style={s.cardBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>

          <Text style={[s.meta, { color: colors.textMuted }]}>
            {item.cuisine_label || "Restaurant"}
            {item.price != null ? `  ·  ${item.price} EUR` : ""}
          </Text>

          {raison && (
            <Text style={[s.reason, { color: colors.textMuted }]} numberOfLines={2}>
              {raison}
            </Text>
          )}

          <View style={s.cardFoot}>
            <Verdict tone={v.tone} label={v.label} />
            <Feather name="chevron-right" size={18} color={colors.textFaint} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function SearchScreen({ onOpen }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [depart, setDepart] = useState(null);
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [budget, setBudget] = useState(BUDGETS[0]);
  const [resultats, setResultats] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [carteOuverte, setCarteOuverte] = useState(false);

  function choisir(lat, lng, label) {
    setDepart({ lat, lng, label });
    setSuggestions([]);
    setAdresse("");
    setErreur(null);
  }

  async function utiliserGps() {
    setErreur(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setErreur("Position refusée. Choisissez une adresse ou un lieu ci-dessous.");
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({}),
        new Promise((_, rejeter) =>
          setTimeout(() => rejeter(new Error("timeout")), DELAI_GPS_MS)
        ),
      ]);
      choisir(pos.coords.latitude, pos.coords.longitude, "Votre position actuelle");
    } catch {
      setErreur("Position indisponible. Choisissez une adresse ou un lieu ci-dessous.");
    }
  }

  // Suggestions au fil de la frappe, avec pause : Nominatim est un service
  // communautaire, on ne l'interroge pas à chaque caractère.
  useEffect(() => {
    if (adresse.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let annule = false;
    const minuteur = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}?format=json&limit=6&q=${encodeURIComponent(adresse)}`
        );
        const data = await res.json();
        if (!annule) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!annule) setSuggestions([]);
      }
    }, 400);

    return () => { annule = true; clearTimeout(minuteur); };
  }, [adresse]);

  async function chercher() {
    const origine = depart ?? fallbackLocation;
    setChargement(true);
    setErreur(null);
    try {
      const data = await fetchRestaurants({
        lat: origine.lat,
        lng: origine.lng,
        budgetMin: budget.min,
        budgetMax: budget.max,
      });
      setResultats(data.restaurants ?? []);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }

  // --- Résultats -----------------------------------------------------------
  if (resultats) {
    const origine = depart ?? fallbackLocation;
    // Un lieu choisi explicitement qui ne renvoie rien, sans budget restreint,
    // signale une zone non relevée plutôt qu'un critère trop strict.
    const horsCouverture =
      resultats.length === 0 && Boolean(depart) && budget.min === 0 && budget.max >= 200;
    return (
      <FlatList
        data={resultats}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Pressable
              onPress={() => setResultats(null)}
              accessibilityRole="button"
              style={s.retour}
            >
              <Feather name="arrow-left" size={17} color={colors.brand} />
              <Text style={[s.retourText, { color: colors.brand }]}>
                Modifier la recherche
              </Text>
            </Pressable>

            <Text style={[s.title, { color: colors.text }]}>{copy.resultsTitle}</Text>
            <Text style={[s.lede, { color: colors.textMuted }]}>
              {resultats.length} autour de {origine.label}
            </Text>
            <Text style={[s.hint, { color: colors.textFaint }]}>{copy.resultsHint}</Text>
          </View>
        }
        ListEmptyComponent={
          // Deux causes très différentes : un budget trop étroit sur une zone
          // couverte, ou une zone non relevée. Dire « aucune adresse ici » à
          // quelqu'un qui cherche à Lisbonne lui ferait croire que Lisbonne
          // n'a pas de restaurants, alors que c'est notre relevé qui s'arrête.
          <View style={s.vide}>
            <Text style={[s.videTitre, { color: colors.text }]}>
              {horsCouverture ? "Zone pas encore relevée" : copy.resultsEmpty}
            </Text>
            <Text style={[s.hint, { color: colors.textMuted }]}>
              {horsCouverture
                ? "Le relevé couvre pour l'instant le Quartier latin, à Paris — "
                  + "c'est la zone sur laquelle la méthode est évaluée. Le calcul, "
                  + "lui, ne dépend d'aucune ville."
                : copy.resultsEmptyHint}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Carte item={item} onOpen={onOpen} isDark={isDark} index={index} />
        )}
      />
    );
  }

  // --- Formulaire ----------------------------------------------------------
  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>{copy.searchTitle}</Text>
        <Text style={[s.lede, { color: colors.textMuted }]}>{copy.searchSubtitle}</Text>
      </View>

      {depart && (
        <View style={[s.retenu, { backgroundColor: colors.brandSoft }]}>
          <Feather name="map-pin" size={15} color={colors.brand} />
          <Text style={[s.retenuText, { color: colors.brand }]} numberOfLines={2}>
            {depart.label}
          </Text>
        </View>
      )}

      <Button title="Utiliser ma position" icon="navigation" onPress={utiliserGps} />

      <View style={{ marginTop: spacing.sm }}>
        <Button
          title="Choisir sur la carte"
          icon="map"
          variant="ghost"
          onPress={() => setCarteOuverte(true)}
        />
      </View>

      <MapPicker
        visible={carteOuverte}
        centre={depart ?? fallbackLocation}
        onValider={(lieu) => { choisir(lieu.lat, lieu.lng, lieu.label); setCarteOuverte(false); }}
        onFermer={() => setCarteOuverte(false)}
      />

      <Text style={[s.section, { color: colors.text }]}>Chercher une adresse</Text>
      <TextInput
        style={[
          s.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            color: colors.text,
          },
        ]}
        placeholder="Une ville, un quartier, une adresse"
        placeholderTextColor={colors.textFaint}
        value={adresse}
        onChangeText={setAdresse}
        autoCorrect={false}
        accessibilityLabel="Adresse de départ"
      />

      {suggestions.map((sug) => (
        <Pressable
          key={sug.place_id}
          onPress={() =>
            choisir(parseFloat(sug.lat), parseFloat(sug.lon), libelleCourt(sug))
          }
          accessibilityRole="button"
          style={({ pressed }) => [
            s.suggestion,
            { borderBottomColor: colors.border },
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Feather name="map-pin" size={15} color={colors.textFaint} />
          <Text style={[s.suggestionText, { color: colors.text }]} numberOfLines={2}>
            {libelleCourt(sug)}
          </Text>
        </Pressable>
      ))}

      {/* La base ne couvre qu'une zone : ces raccourcis disent laquelle,
          au lieu de laisser l'utilisateur la deviner. */}
      <Text style={[s.section, { color: colors.text }]}>{copy.locationDemoLabel}</Text>
      <View style={s.lieux}>
        {demoPlaces.map((lieu) => {
          const actif = depart?.label === lieu.label;
          return (
            <Pressable
              key={lieu.label}
              onPress={() => choisir(lieu.lat, lieu.lng, lieu.label)}
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              style={[
                s.chip,
                { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                actif && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text
                style={[s.chipText, { color: actif ? colors.onBrand : colors.textMuted }]}
              >
                {lieu.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[s.section, { color: colors.text }]}>Budget</Text>
      <View style={s.lieux}>
        {BUDGETS.map((b) => {
          const actif = b.label === budget.label;
          return (
            <Pressable
              key={b.label}
              onPress={() => setBudget(b)}
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              style={[
                s.chip,
                { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                actif && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text
                style={[s.chipText, { color: actif ? colors.onBrand : colors.textMuted }]}
              >
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {erreur && <ErrorState message={erreur} onRetry={chercher} />}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title={chargement ? "Recherche en cours" : copy.searchCta}
          icon="search"
          onPress={chercher}
          disabled={chargement}
        />
      </View>

      {chargement && (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {[0, 1].map((i) => <CardSkeleton key={i} />)}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  lede: { fontSize: 15, marginTop: 4, lineHeight: 21 },
  hint: { fontSize: 13, marginTop: 6, lineHeight: 18 },

  retour: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    marginBottom: 4,
  },
  retourText: { fontSize: 15, fontWeight: "600" },

  retenu: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  retenuText: { fontSize: 14, fontWeight: "600", flex: 1 },

  section: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },

  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  suggestionText: { fontSize: 14, flex: 1 },

  lieux: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: "500" },

  vide: { paddingVertical: spacing.xxl, gap: 6 },
  videTitre: { fontSize: 17, fontWeight: "600" },

  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  cardBody: { padding: spacing.md, gap: 5 },
  name: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  meta: { fontSize: 14 },
  reason: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardFoot: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  distance: {
    position: "absolute",
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  distanceText: { fontSize: 12, fontWeight: "600" },
});
