// apps/mobile/src/components/Filtres.js
//
// Filtres de recherche (D-034). Miroir de `apps/web/src/components/Filtres.jsx`.
//
// CE QUI N'EST PAS PROPOSÉ, ET POURQUOI. Aucun filtre sur la note ni sur le
// nombre d'avis, bien que les deux soient en base. Laisser l'utilisateur
// écarter « les restaurants sous 4 étoiles » lui ferait refaire le tri par
// popularité que le projet existe pour éviter (D-001, D-007) : le restaurant
// de quartier, avec ses trois avis, disparaîtrait de sa liste.
//
// UNE DONNÉE MANQUANTE N'EXCLUT JAMAIS. Un restaurant sans prix connu reste
// visible sous un filtre de budget, un restaurant sans horaires reste visible
// sous « ouvert maintenant ». Même règle que D-012 côté scoring. Le seul
// filtre où l'absence exclut est « carte analysée », qui porte sur la
// présence même.
//
// PAS DE GROUPE « CUISINE » ICI : l'écran en propose déjà la liste, et deux
// contrôles pour un seul critère désorientent.
//
// Chaque groupe défile horizontalement plutôt que de passer à la ligne : sur
// un téléphone, un panneau de filtres qui grandit repousse les résultats hors
// de l'écran, et l'utilisateur ne voit plus ce qu'il filtre.

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";
import { TRANCHES } from "../lib/filtres";

function Pastille({ label, actif, onPress, hint }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityHint={hint}
      style={[
        s.chip,
        { borderColor: colors.borderStrong, backgroundColor: colors.surface },
        actif && { backgroundColor: colors.brand, borderColor: colors.brand },
      ]}
    >
      <Text style={[s.chipText, { color: actif ? colors.onBrand : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Groupe({ icone, titre, children }) {
  const colors = useColors();
  return (
    <View style={s.groupe}>
      <View style={s.titreLigne}>
        <Feather name={icone} size={12} color={colors.textFaint} />
        <Text style={[s.titre, { color: colors.textFaint }]}>{titre}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rangee}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export default function Filtres({ valeurs, onChange }) {
  const colors = useColors();
  const { tranchePrix, ouvert, reservation, avecCarte, cuisine } = valeurs;

  const basculer = (cle, val) => onChange({ ...valeurs, [cle]: val });

  const actifs =
    (tranchePrix ? 1 : 0) + (ouvert ? 1 : 0) + (reservation ? 1 : 0) +
    (avecCarte ? 1 : 0) + (cuisine ? 1 : 0);

  return (
    <View style={s.bloc}>
      <Groupe icone="dollar-sign" titre="BUDGET">
        {TRANCHES.map((t) => (
          <Pastille
            key={t.cle}
            label={t.label}
            actif={tranchePrix === t.cle}
            onPress={() => basculer("tranchePrix", tranchePrix === t.cle ? null : t.cle)}
          />
        ))}
      </Groupe>

      <Groupe icone="clock" titre="DISPONIBILITÉ">
        <Pastille
          label="Ouvert maintenant"
          actif={ouvert}
          onPress={() => basculer("ouvert", !ouvert)}
        />
        <Pastille
          label="Réservation"
          actif={reservation}
          onPress={() => basculer("reservation", !reservation)}
        />
      </Groupe>

      <Groupe icone="book-open" titre="INFORMATION">
        <Pastille
          label="Carte analysée"
          actif={avecCarte}
          hint="Restaurants dont la carte a été lue et analysée"
          onPress={() => basculer("avecCarte", !avecCarte)}
        />
      </Groupe>

      {actifs > 0 && (
        <Pressable
          onPress={() => onChange({ ...valeurs, tranchePrix: null, ouvert: false,
                                   reservation: false, avecCarte: false, cuisine: null })}
          accessibilityRole="button"
          style={s.reset}
        >
          <Feather name="x" size={12} color={colors.textMuted} />
          <Text style={[s.resetText, { color: colors.textMuted }]}>
            Effacer {actifs} filtre{actifs > 1 ? "s" : ""}
          </Text>
        </Pressable>
      )}

      <Text style={[s.note, { color: colors.textFaint }]}>
        Un restaurant dont l'information manque reste affiché : l'absence de
        donnée ne l'écarte pas.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { gap: spacing.sm, marginTop: spacing.md },
  groupe: { gap: 4 },
  titreLigne: { flexDirection: "row", alignItems: "center", gap: 5 },
  titre: { fontSize: 10, fontWeight: "600", letterSpacing: 0.7 },
  rangee: { gap: 7, paddingVertical: 2, paddingRight: spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 13, fontWeight: "500" },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  resetText: { fontSize: 13 },
  note: { fontSize: 11, lineHeight: 15 },
});
