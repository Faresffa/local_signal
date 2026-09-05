// apps/mobile/src/components/CartePhotos.js
//
// Photos de carte d'un restaurant (D-034). Miroir du composant web.
//
// CE QUI EST AFFICHÉ N'EST PAS CE QUI EST STOCKÉ. La base ne conserve que des
// URL et le texte relevé ; les images restent chez leur hébergeur et ne
// transitent jamais par nos serveurs. Même posture que D-021 et D-025 : on
// analyse puis on jette, on ne redistribue pas l'œuvre.
//
// Replié par défaut, pour deux raisons. Ces photos appartiennent à ceux qui
// les ont prises et n'ont pas à s'imposer à l'écran. Et la fiche doit d'abord
// répondre à « ce restaurant est-il local ? » — la carte est une pièce
// justificative, pas l'argument.

import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";

export default function CartePhotos({ urls, motif }) {
  const colors = useColors();
  const [ouvert, setOuvert] = useState(false);
  const [cassees, setCassees] = useState([]);

  const liste = Array.isArray(urls) ? urls : [];
  if (liste.length === 0) return null;

  const visibles = liste.filter((u) => !cassees.includes(u));

  return (
    <View style={[s.bloc, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <Pressable
        onPress={() => setOuvert((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        style={s.bascule}
      >
        <Feather
          name={ouvert ? "chevron-down" : "chevron-right"}
          size={15}
          color={colors.textMuted}
        />
        <Text style={[s.basculeText, { color: colors.text }]}>
          Voir la carte ({liste.length} {liste.length > 1 ? "pages" : "page"})
        </Text>
      </Pressable>

      {ouvert && (
        <View style={s.corps}>
          {motif ? <Text style={[s.note, { color: colors.textFaint }]}>{motif}</Text> : null}

          {/* Défilement horizontal plutôt qu'une grille : sur téléphone, des
              vignettes en grille sont trop petites pour qu'on lise une carte. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.rangee}
          >
            {visibles.map((u, i) => (
              <Image
                key={u}
                source={{ uri: u }}
                accessibilityLabel={`Page ${i + 1} de la carte`}
                resizeMode="cover"
                style={[s.vignette, { backgroundColor: colors.skeleton }]}
                // Une URL d'hébergeur peut expirer. On retire la vignette
                // plutôt que de laisser un cadre vide à l'écran.
                onError={() => setCassees((c) => (c.includes(u) ? c : [...c, u]))}
              />
            ))}
          </ScrollView>

          {visibles.length === 0 && (
            <Text style={[s.note, { color: colors.textFaint }]}>
              Les images ne sont plus accessibles chez leur hébergeur. Les
              observations qui en ont été tirées restent valides.
            </Text>
          )}

          <Text style={[s.note, { color: colors.textFaint }]}>
            Photos hébergées par leur plateforme d'origine et publiées par leurs
            auteurs. Elles ne sont pas conservées par Local Signal : seules les
            observations extraites le sont.
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bloc: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  bascule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: spacing.sm,
  },
  basculeText: { fontSize: 14, fontWeight: "500" },
  corps: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  rangee: { gap: spacing.sm, paddingRight: spacing.sm },
  vignette: { width: 150, height: 200, borderRadius: radius.sm },
  note: { fontSize: 11, lineHeight: 15 },
});
