// apps/mobile/src/screens/DiscoverScreen.js
//
// Écran « autour de moi » : géolocalisation, filtres, liste de résultats.
//
// Règle d'affichage (D-009) : aucun score visible par défaut. L'utilisateur
// voit un verdict lisible et la première raison en français ; le détail du
// calcul est sur la fiche, derrière « pourquoi ? ».

import { useCallback, useEffect, useState } from "react";
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { fetchCuisines, fetchRestaurants } from "../api";
import {
  CardSkeleton, CuisineVisual, EmptyState, ErrorState, Loading, Verdict,
} from "../components/ui";
import { radius, spacing, useColors } from "../theme";
import { distance, verdict } from "../lib/display";

const RAYONS = [
  { value: 400, label: "5 min" },
  { value: 800, label: "10 min" },
  { value: 1500, label: "20 min" },
  { value: 3000, label: "Quartier" },
];

// Zone d'évaluation, utilisée si la géolocalisation est refusée. On ne bloque
// jamais l'écran sur un message d'erreur de permission.
const ZONE_PAR_DEFAUT = { lat: 48.8462, lng: 2.3456 };

function Carte({ item, onOpen, isDark }) {
  const colors = useColors();
  const v = verdict(item.local_signal, item.confidence);
  const dist = distance(item.distance_m);
  const raison = item.reasons?.[0];

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${v.label}`}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] },
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
  );
}

export default function DiscoverScreen({ onOpen }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [position, setPosition] = useState(null);
  const [denied, setDenied] = useState(false);
  const [radiusM, setRadiusM] = useState(800);
  const [cuisine, setCuisine] = useState(null);
  const [options, setOptions] = useState([]);

  const [restaurants, setRestaurants] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({});
          if (!cancelled) {
            setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            return;
          }
        }
      } catch {
        // Géolocalisation indisponible : on continue sur la zone par défaut.
      }
      if (!cancelled) { setPosition(ZONE_PAR_DEFAUT); setDenied(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchCuisines()
      .then((o) => setOptions(o.slice(0, 12)))
      .catch(() => setOptions([]));
  }, []);

  const load = useCallback(() => {
    if (!position) return;
    setStatus("loading");
    setError(null);

    fetchRestaurants({
      lat: position.lat,
      lng: position.lng,
      radius: radiusM,
      cuisines: cuisine ? [cuisine] : undefined,
      limit: 30,
    })
      .then((data) => { setRestaurants(data.restaurants ?? []); setStatus("ready"); })
      .catch((e) => { setError(e.message); setStatus("error"); });
  }, [position, radiusM, cuisine]);

  useEffect(() => { load(); }, [load]);

  const entete = (
    <View style={s.header}>
      <Text style={[s.title, { color: colors.text }]}>Autour de vous</Text>
      <Text style={[s.lede, { color: colors.textMuted }]}>
        {denied
          ? "Position indisponible. Résultats pour le Quartier latin."
          : "Les restaurants de quartier, pas les plus visibles."}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
      >
        {RAYONS.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => setRadiusM(r.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: radiusM === r.value }}
            style={[
              s.chip,
              { borderColor: colors.borderStrong, backgroundColor: colors.surface },
              radiusM === r.value && { backgroundColor: colors.brand, borderColor: colors.brand },
            ]}
          >
            <Text
              style={[
                s.chipText,
                { color: radiusM === r.value ? colors.onBrand : colors.textMuted },
              ]}
            >
              {r.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {options.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          <Pressable
            onPress={() => setCuisine(null)}
            style={[
              s.chip,
              { borderColor: colors.borderStrong, backgroundColor: colors.surface },
              cuisine === null && { backgroundColor: colors.brand, borderColor: colors.brand },
            ]}
          >
            <Text
              style={[s.chipText, { color: cuisine === null ? colors.onBrand : colors.textMuted }]}
            >
              Toutes
            </Text>
          </Pressable>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => setCuisine(cuisine === o.value ? null : o.value)}
              style={[
                s.chip,
                { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                cuisine === o.value && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text
                style={[s.chipText, { color: cuisine === o.value ? colors.onBrand : colors.textMuted }]}
              >
                {o.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {status === "ready" && (
        <Text style={[s.count, { color: colors.textFaint }]}>
          {restaurants.length} restaurant{restaurants.length > 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );

  if (!position) return <Loading label="Recherche de votre position" />;

  if (status === "error") {
    return (
      <ScrollView>
        {entete}
        <ErrorState message={error} onRetry={load} />
      </ScrollView>
    );
  }

  if (status === "loading") {
    return (
      <ScrollView contentContainerStyle={s.list}>
        {entete}
        <View style={{ gap: spacing.md }}>
          {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={restaurants}
      keyExtractor={(r) => r.id}
      contentContainerStyle={s.list}
      ListHeaderComponent={entete}
      ListEmptyComponent={<EmptyState onReset={() => { setCuisine(null); setRadiusM(3000); }} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      renderItem={({ item }) => (
        <Carte item={item} onOpen={onOpen} isDark={isDark} />
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  lede: { fontSize: 15, marginTop: 4, lineHeight: 21 },

  chips: { gap: 8, paddingVertical: spacing.md },
  chip: {
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: "500" },

  count: { fontSize: 13, marginTop: 4 },

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
