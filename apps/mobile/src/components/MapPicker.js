// apps/mobile/src/components/MapPicker.js
//
// Choix d'un point sur une carte. Pendant mobile de la carte du web.
//
// C'est la seule voie qui ne demande ni permission de localisation ni
// vocabulaire : un utilisateur qui ne sait pas nommer le quartier qu'il vise
// peut toujours le désigner du doigt.
//
// `react-native-maps` s'appuie sur le fournisseur de cartes du système —
// Apple Maps sur iOS, Google Maps sur Android. Aucune clé n'est requise dans
// Expo Go, et aucune donnée n'est envoyée à un service tiers du projet.

import { useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";

import { Button } from "./ui";
import { radius, spacing, useColors } from "../theme";

const REVERSE = "https://nominatim.openstreetmap.org/reverse";

/** Trois premiers segments d'une adresse Nominatim ; le reste est du bruit. */
function libelleCourt(nom) {
  return (nom || "").split(",").slice(0, 3).join(",").trim();
}

export default function MapPicker({ visible, centre, onValider, onFermer }) {
  const colors = useColors();
  const [point, setPoint] = useState(centre);
  const [nommage, setNommage] = useState(false);

  async function valider() {
    setNommage(true);
    // Nom lisible du point posé. S'il est introuvable, on garde les
    // coordonnées : un point sans nom reste un point valide.
    let label = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    try {
      const res = await fetch(
        `${REVERSE}?format=json&zoom=14&lat=${point.lat}&lon=${point.lng}`,
      );
      const data = await res.json();
      if (data?.display_name) label = libelleCourt(data.display_name);
    } catch {
      // Géocodage inverse indisponible : les coordonnées font l'affaire.
    }
    setNommage(false);
    onValider({ ...point, label });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onFermer}
    >
      <View style={[s.page, { backgroundColor: colors.background }]}>
        <View style={s.head}>
          <Text style={[s.title, { color: colors.text }]}>Choisissez un point</Text>
          <Pressable
            onPress={onFermer}
            accessibilityRole="button"
            accessibilityLabel="Fermer la carte"
            style={[s.close, { backgroundColor: colors.surfaceSunken }]}
          >
            <Feather name="x" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={[s.hint, { color: colors.textMuted }]}>
          Touchez la carte, ou déplacez le repère.
        </Text>

        <MapView
          style={s.map}
          initialRegion={{
            latitude: centre.lat,
            longitude: centre.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            setPoint({ lat: latitude, lng: longitude });
          }}
        >
          <Marker
            coordinate={{ latitude: point.lat, longitude: point.lng }}
            draggable
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setPoint({ lat: latitude, lng: longitude });
            }}
            pinColor={colors.brand}
          />
        </MapView>

        <View style={s.foot}>
          <Text style={[s.coords, { color: colors.textFaint }]}>
            {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
          </Text>
          {nommage ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Button title="Chercher ici" onPress={valider} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontSize: 14 },
  map: { flex: 1, borderRadius: radius.md, overflow: "hidden" },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  coords: { fontSize: 13, fontVariant: ["tabular-nums"] },
});
