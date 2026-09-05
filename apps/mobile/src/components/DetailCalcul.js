// apps/mobile/src/components/DetailCalcul.js
//
// Décomposition chiffrée du Local Signal, indicateur par indicateur (D-034).
// Miroir de `apps/web/src/components/DetailCalcul.jsx`.
//
// CE PANNEAU N'EST PAS DESTINÉ À L'UTILISATEUR FINAL. D-009 impose de ne
// montrer aucun score par défaut : un voyageur veut une liste de restaurants,
// pas un tableau de bord. Il sert à vérifier le calcul pendant le
// développement et à instruire le mémoire — d'où son repli et son intitulé
// sans ambiguïté.
//
// Ce qu'il montre et qu'aucune phrase d'explication ne peut rendre :
//   - la contribution en points de chaque indicateur ;
//   - le poids EFFECTIF après redistribution, qui diffère du poids déclaré dès
//     qu'un indicateur manque (D-012) ;
//   - les observations brutes qui ont produit la note ;
//   - la vérification que la somme des contributions égale le Local Signal.
//
// Pas de tableau à cinq colonnes comme en web : il serait illisible sur un
// écran de téléphone. Chaque indicateur occupe un bloc, la valeur chiffrée
// reste entière.

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radius, spacing, useColors } from "../theme";

const LIBELLE = {
  menu: "Carte",
  language: "Langue des avis",
  price: "Prix",
  tourist_zone: "Pression touristique",
};

/** Rend lisible une observation brute sans en masquer la valeur. */
function lisible(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (Array.isArray(valeur)) return valeur.length ? valeur.join(", ") : "aucune";
  if (typeof valeur === "number") {
    return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(3);
  }
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  if (typeof valeur === "object") return null;
  return String(valeur);
}

function Indicateur({ i }) {
  const colors = useColors();

  return (
    <View style={[s.ligne, { borderTopColor: colors.border }]}>
      <View style={s.ligneHaut}>
        <Text style={[s.nom, { color: i.disponible ? colors.text : colors.textFaint }]}>
          {LIBELLE[i.indicateur] ?? i.indicateur}
          {!i.disponible ? "  indisponible" : ""}
        </Text>
        <Text style={[s.points, { color: i.disponible ? colors.text : colors.textFaint }]}>
          {i.disponible ? `${i.contribution.toFixed(2)} pts` : "—"}
        </Text>
      </View>

      <Text style={[s.calc, { color: colors.textMuted }]}>
        {i.disponible
          ? `valeur ${i.valeur.toFixed(3)}  ×  poids ${i.poids_effectif.toFixed(3)}` +
            (Math.abs(i.poids_effectif - i.poids_declare) > 0.001
              ? `  (déclaré ${i.poids_declare.toFixed(2)}, redistribué)`
              : "")
          : `poids déclaré ${i.poids_declare.toFixed(2)}, redistribué sur les autres`}
      </Text>

      {i.disponible && Object.keys(i.details ?? {}).length > 0 && (
        <View style={s.obs}>
          {Object.entries(i.details).map(([k, v]) => {
            const rendu = lisible(v);
            return rendu === null ? null : (
              <Text key={k} style={[s.obsLigne, { color: colors.textFaint }]}>
                {k} : {rendu}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function DetailCalcul({ detail }) {
  const colors = useColors();
  const [ouvert, setOuvert] = useState(false);

  if (!detail?.disponible) return null;

  const somme = detail.indicateurs.reduce((t, i) => t + i.contribution, 0);
  // Contrôle d'intégrité affiché : si la somme ne retombe pas sur le score,
  // c'est le calcul qu'il faut regarder, pas l'affichage.
  const coherent = Math.abs(somme - detail.local_signal) < 0.05;

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
        <Text style={[s.basculeText, { color: colors.text }]}>Détail du calcul</Text>
        <Text style={[s.badge, { color: colors.textFaint, backgroundColor: colors.surfaceSunken }]}>
          vue technique
        </Text>
      </Pressable>

      {ouvert && (
        <View style={s.corps}>
          <Text style={[s.entete, { color: colors.textMuted }]}>
            Local Signal {detail.local_signal?.toFixed(2)} · confiance{" "}
            {detail.confiance?.toFixed(2)} · poids disponible{" "}
            {(detail.poids_disponible_total * 100).toFixed(0)} %
          </Text>

          {detail.indicateurs.map((i) => (
            <Indicateur key={i.indicateur} i={i} />
          ))}

          <View style={[s.ligne, { borderTopColor: colors.border }]}>
            <View style={s.ligneHaut}>
              <Text style={[s.nom, { color: colors.text }]}>Somme des contributions</Text>
              <Text style={[s.points, { color: colors.text }]}>
                {somme.toFixed(2)} pts {coherent ? "✓" : "⚠ écart"}
              </Text>
            </View>
          </View>

          {detail.indicateurs_manquants?.length > 0 && (
            <Text style={[s.note, { color: colors.textMuted }]}>
              Indicateurs indisponibles : {detail.indicateurs_manquants.join(", ")}.
              Leur poids est redistribué sur les autres — l'absence réduit la
              confiance, elle ne pénalise pas le score.
            </Text>
          )}

          {!detail.ponderations_calibrees && (
            <Text
              style={[s.note, s.alerte, { color: colors.text, backgroundColor: colors.touristSoft }]}
            >
              Pondérations provisoires, non calibrées sur un jeu labellisé. Ces
              chiffres ne sont pas encore défendables tels quels.
            </Text>
          )}
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
  bascule: { flexDirection: "row", alignItems: "center", gap: 7, padding: spacing.sm },
  basculeText: { fontSize: 14, fontWeight: "500", flex: 1 },
  badge: {
    fontSize: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  corps: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  entete: { fontSize: 12, marginBottom: spacing.sm },
  ligne: { borderTopWidth: 1, paddingVertical: 8, gap: 3 },
  ligneHaut: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  nom: { fontSize: 13, fontWeight: "500", flex: 1 },
  // Chiffres alignés : on compare des contributions d'une ligne à l'autre.
  points: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  calc: { fontSize: 11, fontVariant: ["tabular-nums"] },
  obs: { marginTop: 3, gap: 1 },
  obsLigne: { fontSize: 11, fontVariant: ["tabular-nums"] },
  note: { fontSize: 11, lineHeight: 15, marginTop: spacing.sm },
  alerte: { padding: spacing.sm, borderRadius: radius.sm },
});
