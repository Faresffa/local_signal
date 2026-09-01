// apps/mobile/src/screens/DetailScreen.js
//
// Fiche restaurant.
//
// Seul endroit où le détail du calcul est accessible, et encore : il est
// replié derrière « pourquoi ? » (D-009).

import { useEffect, useState } from "react";
import {
  Linking, Pressable, ScrollView, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { fetchRestaurant } from "../api";
import { Button, CuisineVisual, ErrorState, Verdict } from "../components/ui";
import { radius, spacing, useColors } from "../theme";
import { distance, hours, verdict } from "../lib/display";

const LIBELLES = {
  menu: "Carte du restaurant",
  language: "Langue des avis",
  price: "Prix face au quartier",
  tourist_zone: "Hors zone touristique",
};

function Fait({ icon, label, value, onPress }) {
  const colors = useColors();
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper onPress={onPress} style={[s.fait, { borderBottomColor: colors.border }]}>
      <Feather name={icon} size={15} color={colors.textMuted} style={s.faitIcon} />
      <View style={{ flex: 1 }}>
        <Text style={[s.faitLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[s.faitValue, { color: onPress ? colors.brand : colors.text }]}>
          {value}
        </Text>
      </View>
    </Wrapper>
  );
}

export default function DetailScreen({ restaurant, onBack, onReserve }) {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [full, setFull] = useState(restaurant);
  const [error, setError] = useState(null);
  const [openDetail, setOpenDetail] = useState(false);

  // La liste ne porte pas tout : on recharge les champs complets en gardant
  // l'objet de la liste comme affichage immédiat.
  useEffect(() => {
    let cancelled = false;
    fetchRestaurant(restaurant.id)
      .then((d) => { if (!cancelled) setFull({ ...restaurant, ...d }); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [restaurant]);

  if (error) return <ErrorState message={error} onRetry={onBack} />;

  const v = verdict(full.local_signal, full.confidence);
  const horaires = hours(full.opening_hours);
  const dist = distance(full.distance_m);
  const raisons = full.scoring?.reasons ?? [];
  const signals = full.signals ?? {};

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Feather name="arrow-left" size={17} color={colors.brand} />
        <Text style={[s.backText, { color: colors.brand }]}>Retour</Text>
      </Pressable>

      <View style={{ borderRadius: radius.lg, overflow: "hidden" }}>
        <CuisineVisual
          id={full.id}
          cuisine={full.cuisine}
          height={200}
          iconSize={54}
          isDark={isDark}
        />
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Verdict tone={v.tone} label={v.label} size="lg" />
        <Text style={[s.title, { color: colors.text }]}>{full.name}</Text>
        <Text style={[s.meta, { color: colors.textMuted }]}>
          {full.cuisine_label || "Restaurant"}
          {dist ? `  ·  à ${dist}` : ""}
        </Text>
      </View>

      <View style={[s.faits, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {full.address && <Fait icon="map-pin" label="Adresse" value={full.address} />}
        {horaires && <Fait icon="clock" label="Horaires" value={horaires} />}
        {full.phone && (
          <Fait
            icon="phone"
            label="Téléphone"
            value={full.phone}
            onPress={() => Linking.openURL(`tel:${full.phone}`)}
          />
        )}
        {full.website && (
          <Fait
            icon="globe"
            label="Site"
            value={full.website.replace(/^https?:\/\//, "")}
            onPress={() => Linking.openURL(full.website)}
          />
        )}
      </View>

      {/* Explication (D-009) : raisons en français, détail chiffré replié. */}
      {(raisons.length > 0 || Object.keys(signals).length > 0) && (
        <View style={[s.why, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Text style={[s.whyTitle, { color: colors.text }]}>
            Pourquoi ce restaurant
          </Text>

          {raisons.map((r) => (
            <View key={r} style={s.whyRow}>
              <View style={[s.dot, { backgroundColor: colors.brand }]} />
              <Text style={[s.whyText, { color: colors.text }]}>{r}</Text>
            </View>
          ))}

          <Pressable
            onPress={() => setOpenDetail((o) => !o)}
            accessibilityRole="button"
            style={{ marginTop: spacing.sm }}
          >
            <Text style={[s.link, { color: colors.brand }]}>
              {openDetail ? "Masquer le détail" : "Voir le détail du calcul"}
            </Text>
          </Pressable>

          {openDetail && (
            <View style={[s.whyDetail, { borderTopColor: colors.border }]}>
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.textMuted }]}>
                  Local Signal
                </Text>
                <Text style={[s.detailValue, { color: colors.text }]}>
                  {Math.round(full.local_signal ?? 0)} / 100
                </Text>
              </View>

              {Object.entries(signals).map(([name, signal]) => (
                <View style={s.detailRow} key={name}>
                  <Text style={[s.detailLabel, { color: colors.textMuted }]}>
                    {LIBELLES[name] ?? name}
                  </Text>
                  <Text style={[s.detailValue, { color: colors.text }]}>
                    {signal.value == null
                      ? "non disponible"
                      : `${Math.round(signal.value * 100)} %`}
                  </Text>
                </View>
              ))}

              <Text style={[s.note, { color: colors.textFaint }]}>
                Confiance : {Math.round((full.confidence ?? 0) * 100)} %. Les
                pondérations sont provisoires. Elles seront dérivées d'un jeu de
                données labellisé, pas choisies à la main.
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title="Réserver une table"
          icon="calendar"
          onPress={() => onReserve(full)}
        />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: "600" },

  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  meta: { fontSize: 15 },

  faits: { marginTop: spacing.lg, borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  fait: { flexDirection: "row", padding: spacing.md, gap: 12, borderBottomWidth: 1 },
  faitIcon: { marginTop: 2 },
  faitLabel: { fontSize: 12, marginBottom: 2 },
  faitValue: { fontSize: 14, lineHeight: 19 },

  why: { marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  whyTitle: { fontSize: 16, fontWeight: "600", marginBottom: spacing.sm },
  whyRow: { flexDirection: "row", gap: 9, marginBottom: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  whyText: { flex: 1, fontSize: 14, lineHeight: 19 },
  link: { fontSize: 14, fontWeight: "600" },

  whyDetail: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, gap: 7 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600" },
  note: { fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
});
