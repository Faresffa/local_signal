// apps/mobile/src/screens/DiscoverScreen.js
//
// Écran « autour de moi » : géolocalisation, filtres, liste de résultats.
//
// Règle d'affichage (D-009) : aucun score visible par défaut. L'utilisateur
// voit un verdict lisible et la première raison en français ; le détail du
// calcul est sur la fiche, derrière « pourquoi ? ».

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, FlatList, Pressable, ScrollView, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { fetchCuisines, fetchRestaurants } from "../api";
import {
  CardSkeleton, EmptyState, ErrorState, Loading, Verdict,
} from "../components/ui";
import PhotoRestaurant from "../components/PhotoRestaurant";
import ChoixLieu from "../components/ChoixLieu";
import Filtres from "../components/Filtres";
import { radius, spacing, useColors } from "../theme";
import { distance, verdict } from "../lib/display";
import { FILTRES_VIDES, RAYON_DEFAUT, RAYONS } from "../lib/filtres";

// Zone d'évaluation, utilisée si la géolocalisation est refusée. On ne bloque
// jamais l'écran sur un message d'erreur de permission.
const ZONE_PAR_DEFAUT = { lat: 48.8462, lng: 2.3456 };

function Carte({ item, onOpen, isDark, index }) {
  const colors = useColors();
  const v = verdict(item.local_signal, item.confidence);
  const dist = distance(item.distance_m);
  const raison = item.scoring?.reasons?.[0];

  // Entrée échelonnée : les cartes arrivent dans l'ordre de lecture plutôt que
  // d'un bloc. Le décalage est plafonné pour que le bas de la première page ne
  // se fasse pas attendre. `useNativeDriver` déporte l'animation hors du fil
  // JavaScript, sinon elle saccade dès que la liste défile.
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
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            }),
          },
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
        <PhotoRestaurant
          id={item.id}
          cuisine={item.cuisine}
          photoUrl={item.photo_url}
          isDark={isDark}
        />
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

export default function DiscoverScreen({ onOpen }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [position, setPosition] = useState(null);
  const [denied, setDenied] = useState(false);
  // Un lieu choisi a la main prime sur le GPS : sans cela, la position
  // contredirait le choix explicite de l'utilisateur des la prochaine
  // mise a jour. Meme regle que sur le web.
  const [lieu, setLieu] = useState(null);
  const origine = lieu ?? position;
  const [radiusM, setRadiusM] = useState(RAYON_DEFAUT);

  // Tous les filtres dans un seul objet : ils partent ensemble a l'API, et un
  // seul effet suffit a les surveiller. La cuisine en fait partie bien qu'elle
  // ait ses propres pastilles — c'est le meme critere, pas deux.
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const cuisine = filtres.cuisine;

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
      // Liste COMPLETE, et non plus tronquee a 12. La troncature datait de la
      // rangee de pastilles, qui devenait illisible au-dela ; le menu est
      // desormais recherchable (D-035), et couper la liste rendait le champ de
      // recherche inutile en cachant 255 cuisines sur 267.
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const load = useCallback(() => {
    if (!origine) return;
    setStatus("loading");
    setError(null);

    fetchRestaurants({
      lat: origine.lat,
      lng: origine.lng,
      radius: radiusM,
      cuisines: filtres.cuisine ? [filtres.cuisine] : undefined,
      budgetMin: filtres.budgetMin,
      budgetMax: filtres.budgetMax,
      ouvert: filtres.ouvert,
      reservation: filtres.reservation,
      avecCarte: filtres.avecCarte,
      limit: 30,
    })
      .then((data) => { setRestaurants(data.restaurants ?? []); setStatus("ready"); })
      .catch((e) => { setError(e.message); setStatus("error"); });
  }, [origine, radiusM, filtres]);

  useEffect(() => { load(); }, [load]);

  const entete = (
    <View style={s.header}>
      <Text style={[s.title, { color: colors.text }]}>
        {lieu ? `Autour de ${lieu.label}` : "Autour de vous"}
      </Text>
      <Text style={[s.lede, { color: colors.textMuted }]}>
        {denied && !lieu
          ? "Position indisponible. Résultats pour le Quartier latin."
          : "Les restaurants de quartier, pas les plus visibles."}
      </Text>

      <View style={{ marginTop: spacing.md }}>
        <ChoixLieu
          value={lieu ?? (position && {
            ...position,
            label: denied ? "Quartier latin, Paris" : "Autour de moi",
          })}
          onChange={setLieu}
        />
      </View>

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

      {/* La rangee de pastilles de cuisine a ete retiree (D-035) : la cuisine
          se choisit desormais dans la feuille de filtres, avec un champ de
          recherche. Une rangee de 267 pastilles n'etait pas navigable, et la
          tronquer cachait l'essentiel de la liste. */}

      <Filtres
        valeurs={filtres}
        onChange={setFiltres}
        cuisines={options}
        nbResultats={status === "ready" ? restaurants.length : null}
        chargement={status === "loading"}
      />

      {status === "ready" && (
        <Text style={[s.count, { color: colors.textFaint }]}>
          {restaurants.length} restaurant{restaurants.length > 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );

  if (!origine) return <Loading label="Recherche de votre position" />;

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
      ListEmptyComponent={
        // « Aucun resultat » vient souvent d'un filtre, pas du quartier :
        // ne relacher que la cuisine laissait l'utilisateur devant une liste
        // vide sans comprendre pourquoi. On efface tout et on elargit.
        <EmptyState onReset={() => { setFiltres(FILTRES_VIDES); setRadiusM(3000); }} />
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      renderItem={({ item, index }) => (
        <Carte item={item} onOpen={onOpen} isDark={isDark} index={index} />
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
