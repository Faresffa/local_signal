// apps/mobile/src/components/ChoixLieu.js
//
// Choix du point de départ : position, adresse saisie, ou point sur la carte
// (D-037). Pendant mobile de `LocationPicker` côté web.
//
// POURQUOI CE COMPOSANT EXISTE. Le mobile avait un onglet « Chercher » séparé,
// dédié au choix du lieu, alors que le web fait tout depuis sa page unique.
// Deux interfaces pour le même produit, avec des parcours différents : passer
// de l'une à l'autre demandait de réapprendre. Le choix du lieu rejoint donc
// la page de découverte, et l'onglet séparé disparaît.
//
// TROIS VOIES, PARCE QUE CHACUNE ÉCHOUE SEULE. Le GPS ne sert à rien à qui
// prépare un voyage ; la saisie d'adresse suppose qu'on sache l'écrire ; la
// carte suppose qu'on reconnaisse l'endroit. Les trois ensemble couvrent les
// cas réels, et aucune n'est imposée.

import { useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import MapPicker from "./MapPicker";
import { radius, spacing, useColors } from "../theme";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Au-delà, on cesse d'attendre le GPS : un écran bloqué sans explication est
// pire qu'un repli annoncé.
const DELAI_GPS_MS = 8000;

// Nominatim est un service communautaire, gratuit et sans contrepartie. On ne
// l'interroge pas à chaque frappe : une pause après la dernière touche suffit,
// et c'est la moindre des politesses envers une ressource offerte.
const PAUSE_SAISIE_MS = 400;

export default function ChoixLieu({ valeur, onChange, onGps }) {
  const colors = useColors();

  const [ouvert, setOuvert] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [cherche, setCherche] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (adresse.trim().length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let annule = false;
    setCherche(true);
    const minuteur = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}?format=json&limit=6&q=${encodeURIComponent(adresse)}`
        );
        const data = await res.json();
        if (!annule) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!annule) setSuggestions([]);
      } finally {
        if (!annule) setCherche(false);
      }
    }, PAUSE_SAISIE_MS);

    return () => { annule = true; clearTimeout(minuteur); };
  }, [adresse]);

  const choisir = (lat, lng, label) => {
    onChange({ lat, lng, label });
    setAdresse("");
    setSuggestions([]);
    setErreur(null);
    setOuvert(false);
  };

  async function utiliserGps() {
    setErreur(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setErreur("Position refusée. Saisissez une adresse ou posez un point.");
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({}),
        new Promise((_, rejeter) =>
          setTimeout(() => rejeter(new Error("timeout")), DELAI_GPS_MS)
        ),
      ]);
      onGps?.();
      choisir(pos.coords.latitude, pos.coords.longitude, "Autour de moi");
    } catch {
      setErreur("Position indisponible. Saisissez une adresse ou posez un point.");
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOuvert(true)}
        accessibilityRole="button"
        accessibilityLabel="Choisir le lieu de recherche"
        style={[s.champ, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
      >
        <Feather name="map-pin" size={15} color={colors.brand} />
        <Text style={[s.champTexte, { color: colors.text }]} numberOfLines={1}>
          {valeur?.label || "Autour de moi"}
        </Text>
        <Feather name="chevron-down" size={15} color={colors.textFaint} />
      </Pressable>

      <Modal visible={ouvert} animationType="slide" transparent onRequestClose={() => setOuvert(false)}>
        <Pressable
          style={[s.fond, { backgroundColor: colors.overlay }]}
          onPress={() => setOuvert(false)}
        />

        <View style={[s.feuille, { backgroundColor: colors.surface }]}>
          <View style={s.poignee}>
            <View style={[s.trait, { backgroundColor: colors.borderStrong }]} />
          </View>

          <Text style={[s.titre, { color: colors.text }]}>Où cherchez-vous ?</Text>

          <View style={[s.recherche, { borderColor: colors.borderStrong }]}>
            <Feather name="search" size={14} color={colors.textFaint} />
            <TextInput
              value={adresse}
              onChangeText={setAdresse}
              placeholder="Une ville, un quartier, une adresse"
              placeholderTextColor={colors.textFaint}
              style={[s.rechercheInput, { color: colors.text }]}
              autoCorrect={false}
              autoFocus
            />
            {cherche ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
          </View>

          <ScrollView style={s.liste} keyboardShouldPersistTaps="handled">
            <Pressable onPress={utiliserGps} style={s.action}>
              <Feather name="crosshair" size={16} color={colors.brand} />
              <Text style={[s.actionTexte, { color: colors.brand }]}>Autour de moi</Text>
            </Pressable>

            <Pressable onPress={() => setCarteOuverte(true)} style={s.action}>
              <Feather name="map" size={16} color={colors.brand} />
              <Text style={[s.actionTexte, { color: colors.brand }]}>
                Choisir un point sur la carte
              </Text>
            </Pressable>

            {erreur ? (
              <Text style={[s.erreur, { color: colors.tourist }]}>{erreur}</Text>
            ) : null}

            {suggestions.map((sug) => (
              <Pressable
                key={`${sug.place_id}`}
                onPress={() =>
                  choisir(
                    parseFloat(sug.lat),
                    parseFloat(sug.lon),
                    // Le nom complet de Nominatim tient sur trois lignes : on
                    // garde les deux premiers termes, qui suffisent a situer.
                    sug.display_name.split(",").slice(0, 2).join(",").trim()
                  )
                }
                style={[s.suggestion, { borderBottomColor: colors.border }]}
              >
                <Feather name="map-pin" size={14} color={colors.textFaint} />
                <Text style={[s.suggestionTexte, { color: colors.text }]} numberOfLines={2}>
                  {sug.display_name}
                </Text>
              </Pressable>
            ))}

            {adresse.trim().length >= 3 && !cherche && suggestions.length === 0 && (
              <Text style={[s.erreur, { color: colors.textFaint }]}>
                Aucun lieu ne correspond.
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={carteOuverte}
        animationType="slide"
        onRequestClose={() => setCarteOuverte(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Pressable onPress={() => setCarteOuverte(false)} style={s.fermerCarte}>
            <Feather name="arrow-left" size={18} color={colors.brand} />
            <Text style={[s.actionTexte, { color: colors.brand }]}>Retour</Text>
          </Pressable>
          <MapPicker
            value={valeur}
            onChange={(p) => {
              setCarteOuverte(false);
              choisir(p.lat, p.lng, p.label || "Point choisi sur la carte");
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  champ: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  champTexte: { flex: 1, fontSize: 14, fontWeight: "500" },

  fond: { ...StyleSheet.absoluteFillObject },
  feuille: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "84%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
  },
  poignee: { alignItems: "center", paddingVertical: 9 },
  trait: { width: 38, height: 4, borderRadius: 2 },
  titre: {
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  recherche: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: spacing.lg,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  rechercheInput: { flex: 1, fontSize: 14, padding: 0 },
  liste: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },

  action: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 12 },
  actionTexte: { fontSize: 14, fontWeight: "500" },

  suggestion: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  suggestionTexte: { flex: 1, fontSize: 13, lineHeight: 18 },

  erreur: { fontSize: 12, lineHeight: 17, paddingVertical: 8 },
  fermerCarte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: spacing.md,
  },
});
