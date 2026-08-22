// Écran « autour de moi » — recherche géolocalisée.
//
// Règle d'affichage (D-009) : aucun score visible par défaut. L'utilisateur
// veut une liste de restaurants, pas un tableau de bord. Le détail est derrière
// « pourquoi ? » sur la fiche.

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";

import { fetchRestaurants, photoUrl } from "./api";
import { copy, fallbackLocation } from "../../../packages/shared/content.js";
import { colors, radius, spacing } from "./theme";

/**
 * Zone de démonstration — la seule où la base contient des restaurants scorés.
 *
 * Sans ce repli, l'écran est vide pour quiconque n'est pas physiquement dans le
 * 5ᵉ arrondissement : la géolocalisation fonctionne parfaitement, renvoie la
 * vraie position, et le backend répond honnêtement « aucun restaurant ». Rien
 * n'est cassé, mais l'application paraît morte.
 *
 * Vient de packages/shared/content.js : dupliquer la valeur ici, c'était
 * accepter qu'elle finisse par diverger de celle du web (D-026).
 */
const DEMO_LOCATION = fallbackLocation;

/** Au-delà, on cesse d'attendre le GPS et on affiche la zone de démonstration. */
const GEOLOCATION_TIMEOUT_MS = 7000;

/** Cuisine principale — OSM sépare les valeurs multiples par « ; ». */
function cuisineOf(item) {
  const raw = (item.cuisine || item.type || "").split(";")[0].trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

/**
 * Ligne d'information : uniquement les champs renseignés.
 * OSM ne porte ni prix ni ambiance de façon fiable — les afficher vides
 * produisait « · €/pers » et donnait l'impression d'une fiche cassée.
 */
function metaLine(item) {
  const distance = item.scoring?.relevance?.distance_m;
  return [
    cuisineOf(item),
    item.price != null && `${item.price} €/pers`,
    distance != null &&
      (distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`),
  ]
    .filter(Boolean)
    .join(" · ");
}

function RestaurantCard({ item }) {
  const [showWhy, setShowWhy] = useState(false);
  const [noPhoto, setNoPhoto] = useState(false);
  const raisons = item.scoring?.reasons ?? [];
  const confiance = item.scoring?.confidence ?? 0;
  const meta = metaLine(item);

  return (
    <View style={styles.card}>
      {/* Photo réelle du restaurant (D-025). En son absence, l'endpoint répond
          404 : on retire simplement la zone image plutôt que d'afficher un
          visuel générique qui ne représente pas l'établissement. */}
      {!noPhoto && (
        <Image
          source={{ uri: photoUrl(item.id) }}
          style={styles.photo}
          resizeMode="cover"
          onError={() => setNoPhoto(true)}
        />
      )}
      <Text style={styles.name}>{item.name}</Text>
      {!!meta && <Text style={styles.meta}>{meta}</Text>}
      {!!item.address && <Text style={styles.address}>{item.address}</Text>}

      {/* Signal d'incertitude plutôt qu'un faux chiffre précis (D-003, D-009) */}
      {confiance < 0.4 && (
        <Text style={styles.provisional}>{copy.provisional}</Text>
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
  const [origin, setOrigin] = useState(null); // 'gps' | 'demo' | 'refus'

  useEffect(() => {
    (async () => {
      let coords = null;
      let source = "refus";

      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (granted) {
          // Course contre une limite de temps : sur un appareil sans fix GPS
          // récent, `getCurrentPositionAsync` peut ne jamais se résoudre et
          // laisse l'écran en chargement indéfini.
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({}),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), GEOLOCATION_TIMEOUT_MS)
            ),
          ]);
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          source = "gps";
        }
      } catch {
        // Géolocalisation indisponible : on bascule sur la zone de démonstration
        // plutôt que d'afficher un écran vide sans explication.
      }

      try {
        let data = coords
          ? await fetchRestaurants(coords)
          : { restaurants: [] };

        // La position réelle a marché, mais la base ne couvre que Paris : zéro
        // résultat n'est PAS une panne, c'est une absence de données. On le dit,
        // et on retombe sur la zone de démonstration — sinon l'écran reste vide
        // sans que personne comprenne pourquoi.
        if (!data.restaurants?.length) {
          data = await fetchRestaurants(DEMO_LOCATION);
          source = source === "gps" ? "demo" : "refus";
        }

        setRestaurants(data.restaurants ?? []);
        setOrigin(source);
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
          <Text style={styles.title}>{copy.recommendationsTitle}</Text>
          <Text style={styles.subtitle}>
            {restaurants.length} adresse{restaurants.length > 1 ? "s" : ""} · {copy.recommendationsHint}
          </Text>
          {/* La provenance de la position est toujours affichée : sans elle,
              impossible de distinguer « la géolocalisation a marché » de
              « on est retombé sur la zone de démonstration ». */}
          {origin === "gps" && (
            <Text style={styles.locationNote}>Autour de votre position actuelle</Text>
          )}
          {origin === "demo" && (
            <Text style={styles.locationFallback}>
              Aucun restaurant en base près de vous — affichage de {DEMO_LOCATION.label}
            </Text>
          )}
          {origin === "refus" && (
            <Text style={styles.locationFallback}>
              Position indisponible — affichage de {DEMO_LOCATION.label}
            </Text>
          )}
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
  address: { fontSize: 13, color: colors.textFaint },
  // Format paysage large : la photo domine la carte, comme sur le web (D-022).
  photo: {
    width: "100%",
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
  },
  locationNote: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  locationFallback: {
    fontSize: 13,
    color: colors.mixed,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  provisional: { fontSize: 12, color: colors.mixed, fontStyle: "italic" },
  link: { color: colors.brand, fontWeight: "600", fontSize: 14, marginTop: spacing.xs },
  why: { gap: spacing.xs, marginTop: spacing.xs },
  reason: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
