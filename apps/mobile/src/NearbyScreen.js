// Écran « autour de moi » — recherche géolocalisée.
//
// Règle d'affichage (D-009) : aucun score visible par défaut. L'utilisateur
// veut une liste de restaurants, pas un tableau de bord. Le détail est derrière
// « pourquoi ? » sur la fiche.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";

import { fetchRestaurants } from "./api";
import { colors, radius, spacing } from "./theme";

function RestaurantCard({ item }) {
  const [showWhy, setShowWhy] = useState(false);
  const distance = item.scoring?.relevance?.distance_m;
  const raisons = item.scoring?.reasons ?? [];
  const confiance = item.scoring?.confidence ?? 0;

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.meta}>
        {item.type} · {item.price} €/pers
        {distance != null && ` · ${(distance / 1000).toFixed(1)} km`}
      </Text>

      {/* Signal d'incertitude plutôt qu'un faux chiffre précis (D-003, D-009) */}
      {confiance < 0.4 && (
        <Text style={styles.provisional}>Information limitée — évaluation provisoire</Text>
      )}

      <Pressable onPress={() => setShowWhy((s) => !s)}>
        <Text style={styles.link}>{showWhy ? "Masquer" : "Pourquoi ?"}</Text>
      </Pressable>

      {showWhy && (
        <View style={styles.why}>
          {raisons.map((r, i) => (
            <Text key={i} style={styles.reason}>
              • {r}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function NearbyScreen() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      let coords;
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({});
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        // Géolocalisation indisponible : on laisse le backend appliquer
        // ses coordonnées par défaut plutôt que de bloquer l'écran.
      }

      try {
        const data = await fetchRestaurants(coords);
        setRestaurants(data.restaurants ?? []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.muted}>Recherche autour de vous…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.muted}>Le backend est-il démarré ?</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={restaurants}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Autour de vous</Text>
          <Text style={styles.subtitle}>
            {restaurants.length} restaurant{restaurants.length > 1 ? "s" : ""}
          </Text>
        </View>
      }
      renderItem={({ item }) => <RestaurantCard item={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.brandDark, fontSize: 15, fontWeight: "500" },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  name: { fontSize: 17, fontWeight: "600", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  provisional: { fontSize: 12, color: colors.mixed, fontStyle: "italic" },
  link: { color: colors.brand, fontWeight: "600", fontSize: 14, marginTop: spacing.xs },
  why: { gap: spacing.xs, marginTop: spacing.xs },
  reason: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
