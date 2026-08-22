// Écran de recherche — pendant mobile du formulaire web (D-026).
//
// Le mobile n'avait aucune recherche : seulement « autour de moi », qui dépend
// entièrement du GPS. Un utilisateur qui n'est pas dans la zone relevée n'avait
// donc aucun moyen d'explorer quoi que ce soit.
//
// TROIS FAÇONS DE CHOISIR SON POINT DE DÉPART, comme sur le web :
//   1. la position GPS,
//   2. une adresse saisie, avec suggestions,
//   3. un lieu du Quartier latin en accès direct.
//
// La troisième existe parce que la base ne couvre qu'une zone : demander une
// adresse sans dire laquelle est couverte revient à faire deviner. Les
// raccourcis retirent cette devinette.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";

import { fetchRestaurants, photoUrl } from "./api";
import { colors, radius, spacing } from "./theme";
import { copy, demoPlaces, fallbackLocation } from "../../../packages/shared/content.js";

const GEOLOCATION_TIMEOUT_MS = 7000;

// Cadre de recherche privilégié pour les suggestions d'adresse. Sans `bounded`,
// une adresse hors zone reste trouvable — la restriction serait un mur, pas
// une aide.
const VIEWBOX = "2.3380,48.8535,2.3560,48.8400";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const BUDGETS = [
  { label: "Tous budgets", min: 0, max: 200 },
  { label: "Moins de 20 €", min: 0, max: 20 },
  { label: "20 – 40 €", min: 20, max: 40 },
  { label: "Plus de 40 €", min: 40, max: 200 },
];

function shortLabel(item) {
  return (item.display_name || "").split(",").slice(0, 3).join(",").trim();
}

function cuisineOf(item) {
  const raw = (item.cuisine || "").split(";")[0].trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

function ResultCard({ item }) {
  const [showWhy, setShowWhy] = useState(false);
  const [noPhoto, setNoPhoto] = useState(false);
  const raisons = item.scoring?.reasons ?? [];
  const distance = item.scoring?.relevance?.distance_m;

  const meta = [
    cuisineOf(item),
    distance != null &&
      (distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      {!noPhoto && (
        <Image
          source={{ uri: photoUrl(item.id) }}
          style={styles.photo}
          resizeMode="cover"
          onError={() => setNoPhoto(true)}
        />
      )}
      <Text style={styles.cardName}>{item.name}</Text>
      {!!meta && <Text style={styles.cardMeta}>{meta}</Text>}
      {!!item.address && <Text style={styles.cardAddress}>{item.address}</Text>}

      {(item.scoring?.confidence ?? 0) < 0.4 && (
        <Text style={styles.provisional}>{copy.provisional}</Text>
      )}

      {raisons.length > 0 && (
        <Pressable onPress={() => setShowWhy((s) => !s)}>
          <Text style={styles.link}>{showWhy ? "Masquer" : "Pourquoi ?"}</Text>
        </Pressable>
      )}
      {showWhy && (
        <View style={styles.why}>
          {raisons.map((r, i) => (
            <Text key={i} style={styles.reason}>• {r}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function SearchScreen() {
  const [picked, setPicked] = useState(null);
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [budget, setBudget] = useState(BUDGETS[0]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const select = (lat, lng, label) => {
    setPicked({ lat, lng, label });
    setSuggestions([]);
    setError(null);
  };

  const useGps = async () => {
    setError(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setError("Position refusée. Choisissez une adresse ou un lieu ci-dessous.");
        return;
      }
      // Même garde-fou que sur l'écran « autour de moi » : sans limite de
      // temps, un appareil sans fix GPS récent laisse l'écran figé.
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({}),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), GEOLOCATION_TIMEOUT_MS)
        ),
      ]);
      select(pos.coords.latitude, pos.coords.longitude, "Votre position actuelle");
    } catch {
      setError("Position indisponible. Choisissez une adresse ou un lieu ci-dessous.");
    }
  };

  // Suggestions au fil de la frappe, avec pause : Nominatim est un service
  // communautaire, on ne l'interroge pas à chaque caractère.
  useEffect(() => {
    if (address.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}?format=json&limit=5&viewbox=${VIEWBOX}&q=${encodeURIComponent(address)}`
        );
        const data = await res.json();
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address]);

  const search = async () => {
    const origin = picked ?? fallbackLocation;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRestaurants({
        lat: origin.lat,
        lng: origin.lng,
        budgetMin: budget.min,
        budgetMax: budget.max,
      });
      setResults(data.restaurants ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (results) {
    return (
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Pressable onPress={() => setResults(null)}>
              <Text style={styles.link}>← Modifier la recherche</Text>
            </Pressable>
            <Text style={styles.title}>{copy.resultsTitle}</Text>
            <Text style={styles.subtitle}>
              {results.length} autour de {(picked ?? fallbackLocation).label}
            </Text>
            <Text style={styles.hint}>{copy.resultsHint}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.muted}>{copy.resultsEmpty}</Text>
            <Text style={styles.muted}>{copy.resultsEmptyHint}</Text>
          </View>
        }
        renderItem={({ item }) => <ResultCard item={item} />}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{copy.searchTitle}</Text>
      <Text style={styles.hint}>{copy.searchSubtitle}</Text>

      {picked && (
        <Text style={styles.pickedNote}>
          Position retenue : {picked.label} ({picked.lat.toFixed(4)}, {picked.lng.toFixed(4)})
        </Text>
      )}

      <Pressable style={styles.gpsButton} onPress={useGps}>
        <Text style={styles.gpsLabel}>Utiliser ma position</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Chercher une adresse</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex : 15 rue de la Huchette, Paris"
        placeholderTextColor={colors.textFaint}
        value={address}
        onChangeText={setAddress}
        autoCorrect={false}
      />
      {suggestions.map((s) => (
        <Pressable
          key={String(s.place_id)}
          style={styles.suggestion}
          onPress={() => {
            setAddress(shortLabel(s));
            select(parseFloat(s.lat), parseFloat(s.lon), shortLabel(s));
          }}
        >
          <Text style={styles.suggestionText}>{shortLabel(s)}</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionLabel}>{copy.locationDemoLabel}</Text>
      <Text style={styles.hint}>{copy.locationDemoHint}</Text>
      <View style={styles.pillRow}>
        {demoPlaces.map((p) => (
          <Pressable
            key={p.label}
            style={[styles.pill, picked?.label === p.label && styles.pillActive]}
            onPress={() => select(p.lat, p.lng, p.label)}
          >
            <Text
              style={[
                styles.pillLabel,
                picked?.label === p.label && styles.pillLabelActive,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{copy.budgetLabel}</Text>
      <View style={styles.pillRow}>
        {BUDGETS.map((b) => (
          <Pressable
            key={b.label}
            style={[styles.pill, budget.label === b.label && styles.pillActive]}
            onPress={() => setBudget(b)}
          >
            <Text
              style={[
                styles.pillLabel,
                budget.label === b.label && styles.pillLabelActive,
              ]}
            >
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={styles.cta} onPress={search} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.ctaLabel}>{copy.searchCta}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pickedNote: {
    fontSize: 13,
    color: colors.local,
    backgroundColor: colors.localSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  gpsButton: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
  },
  gpsLabel: { color: colors.brand, fontWeight: "600", fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  suggestion: {
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  suggestionText: { fontSize: 14, color: colors.text },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillLabel: { fontSize: 14, color: colors.text },
  pillLabelActive: { color: colors.textInverse, fontWeight: "600" },
  cta: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: "center",
  },
  ctaLabel: { color: colors.textInverse, fontWeight: "700", fontSize: 16 },
  errorText: { color: colors.brandDark, fontSize: 14, marginTop: spacing.sm },
  center: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
  },
  cardName: { fontSize: 17, fontWeight: "600", color: colors.text },
  cardMeta: { fontSize: 14, color: colors.textMuted },
  cardAddress: { fontSize: 13, color: colors.textFaint },
  provisional: { fontSize: 12, color: colors.mixed, fontStyle: "italic" },
  link: { color: colors.brand, fontWeight: "600", fontSize: 14, marginTop: spacing.xs },
  why: { gap: spacing.xs, marginTop: spacing.xs },
  reason: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
