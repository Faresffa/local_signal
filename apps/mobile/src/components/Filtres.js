// apps/mobile/src/components/Filtres.js
//
// Barre de filtres (D-034, refondue D-035). Miroir de la version web, adapté
// aux contraintes d'un téléphone.
//
// FORME : une seule ligne de pastilles qui défile, et un bouton « Tous les
// filtres » portant le nombre de filtres actifs. Le panneau empilé précédent
// mangeait la moitié de l'écran — on filtrait sans voir ce qu'on filtrait.
//
// FEUILLE MODALE PLUTÔT QUE MENU DÉROULANT. Sur téléphone, un menu ancré sous
// une pastille sortirait de l'écran ou couvrirait la pastille elle-même. Une
// feuille qui monte du bas laisse le pouce l'atteindre et se ferme d'un geste
// naturel. C'est la seule divergence assumée avec le web, et elle tient à la
// taille de l'écran, pas au goût.
//
// LA FEUILLE AFFICHE SON EFFET AVANT QU'ON VALIDE : « Voir N restaurants »,
// recalculé à chaque changement. Sans ça, on coche à l'aveugle et on découvre
// une liste vide après coup.
//
// CE QUI N'EST PAS PROPOSÉ, ET POURQUOI. Aucun filtre sur la note ni sur le
// nombre d'avis, bien que les deux soient en base. Écarter « les restaurants
// sous 4 étoiles » ferait refaire le tri par popularité que le projet existe
// pour éviter (D-001, D-007).
//
// UNE DONNÉE MANQUANTE N'EXCLUT JAMAIS — même règle que D-012 côté scoring.
// Seul « carte analysée » exclut, parce qu'il porte sur la présence même.

import { useMemo, useState } from "react";
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import Budget from "./Budget";
import { radius, spacing, useColors } from "../theme";
import {
  BUDGET_MAX, BUDGET_MIN, budgetActif, compterFiltres, FILTRES_VIDES, libelleBudget,
} from "../lib/filtres";

function Pastille({ label, icone, actif, onPress, hint }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityHint={hint}
      style={[
        s.pastille,
        { borderColor: colors.borderStrong, backgroundColor: colors.surface },
        // Contour et texte de marque, pas un remplissage plein : la barre en
        // compterait trop et deviendrait un mur de couleur.
        actif && { borderColor: colors.brand, backgroundColor: colors.brandSoft },
      ]}
    >
      {icone ? (
        <Feather name={icone} size={13} color={actif ? colors.brand : colors.textMuted} />
      ) : null}
      <Text style={[s.pastilleText, { color: actif ? colors.brand : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Case({ coche, onChange, label, aide }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => onChange(!coche)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: coche }}
      style={s.case}
    >
      <View
        style={[
          s.coche,
          { borderColor: coche ? colors.brand : colors.borderStrong },
          coche && { backgroundColor: colors.brand },
        ]}
      >
        {coche ? <Feather name="check" size={12} color={colors.onBrand} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.caseText, { color: colors.text }]}>{label}</Text>
        {aide ? <Text style={[s.aide, { color: colors.textFaint }]}>{aide}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function Filtres({
  valeurs, onChange, cuisines = [], nbResultats = null, chargement = false,
}) {
  const colors = useColors();
  const { budgetMin, budgetMax, ouvert, reservation, avecCarte, cuisine } = valeurs;

  // `null` = fermée ; "tous" = panneau complet ; "cuisine" = liste des
  // cuisines ; "budget" = fourchette de prix.
  const [feuille, setFeuille] = useState(null);
  const [recherche, setRecherche] = useState("");

  const modifier = (cle, val) => onChange({ ...valeurs, [cle]: val });

  // Le compte vit dans `lib/filtres` : il est identique au web, et une regle
  // de comptage dupliquee finit toujours par diverger.
  const actifs = compterFiltres(valeurs);

  const changerBudget = (bas, haut) =>
    onChange({ ...valeurs, budgetMin: bas, budgetMax: haut });

  const cuisineLabel = cuisines.find((c) => c.value === cuisine)?.label;

  // La liste dépasse les deux cents entrées : sans champ de recherche, trouver
  // sa cuisine demande de faire défiler une colonne interminable.
  const cuisinesVues = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return terme
      ? cuisines.filter((c) => c.label.toLowerCase().includes(terme))
      : cuisines;
  }, [cuisines, recherche]);

  const libelleValidation = chargement
    ? "Calcul…"
    : nbResultats === null
      ? "Voir les résultats"
      : `Voir ${nbResultats} restaurant${nbResultats > 1 ? "s" : ""}`;

  const fermer = () => { setFeuille(null); setRecherche(""); };

  return (
    <View style={s.bloc}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.ligne}
      >
        <Pressable
          onPress={() => setFeuille("tous")}
          accessibilityRole="button"
          style={[s.tous, { backgroundColor: colors.text }]}
        >
          <Feather name="sliders" size={13} color={colors.background} />
          <Text style={[s.tousText, { color: colors.background }]}>Tous les filtres</Text>
          {actifs > 0 && (
            <View style={[s.compteur, { backgroundColor: colors.brand }]}>
              <Text style={[s.compteurText, { color: colors.onBrand }]}>{actifs}</Text>
            </View>
          )}
        </Pressable>

        <Pastille
          icone="dollar-sign"
          label={libelleBudget(budgetMin, budgetMax)}
          actif={budgetActif(valeurs)}
          onPress={() => setFeuille("budget")}
        />
        <Pastille
          icone="chevron-down"
          label={cuisineLabel || "Type de cuisine"}
          actif={Boolean(cuisine)}
          onPress={() => setFeuille("cuisine")}
        />
        <Pastille
          icone="clock"
          label="Ouvert maintenant"
          actif={ouvert}
          onPress={() => modifier("ouvert", !ouvert)}
        />
        <Pastille
          label="Réservation"
          actif={reservation}
          onPress={() => modifier("reservation", !reservation)}
        />
        <Pastille
          icone="book-open"
          label="Carte analysée"
          actif={avecCarte}
          hint="Restaurants dont la carte a été lue et analysée"
          onPress={() => modifier("avecCarte", !avecCarte)}
        />
      </ScrollView>

      <Modal
        visible={feuille !== null}
        animationType="slide"
        transparent
        onRequestClose={fermer}
      >
        {/* Le fond referme la feuille : sur téléphone, c'est le geste attendu. */}
        <Pressable style={[s.fond, { backgroundColor: colors.overlay }]} onPress={fermer} />

        <View style={[s.feuille, { backgroundColor: colors.surface }]}>
          <View style={s.poignee}>
            <View style={[s.trait, { backgroundColor: colors.borderStrong }]} />
          </View>

          {feuille === "budget" ? (
            <>
              <Text style={[s.titre, { color: colors.text }]}>Budget</Text>
              <View style={{ paddingHorizontal: spacing.lg }}>
                <Budget min={budgetMin} max={budgetMax} onChange={changerBudget} />
              </View>
              <View style={[s.pied, { borderTopColor: colors.border }]}>
                <Pressable
                  onPress={() => changerBudget(BUDGET_MIN, BUDGET_MAX)}
                  disabled={!budgetActif(valeurs)}
                  accessibilityRole="button"
                  style={s.effacer}
                >
                  <Text
                    style={[
                      s.effacerText,
                      { color: colors.textMuted, opacity: budgetActif(valeurs) ? 1 : 0.4 },
                    ]}
                  >
                    Tout budget
                  </Text>
                </Pressable>
                <Pressable
                  onPress={fermer}
                  accessibilityRole="button"
                  style={[s.valider, { backgroundColor: colors.brand }]}
                >
                  <Text style={[s.validerText, { color: colors.onBrand }]}>
                    {libelleValidation}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : feuille === "cuisine" ? (
            <>
              <Text style={[s.titre, { color: colors.text }]}>Type de cuisine</Text>

              <View style={[s.recherche, { borderColor: colors.borderStrong }]}>
                <Feather name="search" size={14} color={colors.textFaint} />
                <TextInput
                  value={recherche}
                  onChangeText={setRecherche}
                  placeholder="Chercher une cuisine"
                  placeholderTextColor={colors.textFaint}
                  style={[s.rechercheInput, { color: colors.text }]}
                  autoCorrect={false}
                />
              </View>

              <ScrollView style={s.liste} keyboardShouldPersistTaps="handled">
                <Pressable
                  onPress={() => { modifier("cuisine", null); fermer(); }}
                  style={s.option}
                >
                  <Text style={[s.optionText, { color: colors.text }]}>
                    Toutes les cuisines
                  </Text>
                  {!cuisine ? <Feather name="check" size={15} color={colors.brand} /> : null}
                </Pressable>

                {cuisinesVues.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => {
                      modifier("cuisine", cuisine === c.value ? null : c.value);
                      fermer();
                    }}
                    style={s.option}
                  >
                    <Text style={[s.optionText, { color: colors.text }]}>{c.label}</Text>
                    {cuisine === c.value ? (
                      <Feather name="check" size={15} color={colors.brand} />
                    ) : null}
                  </Pressable>
                ))}

                {cuisinesVues.length === 0 && (
                  <Text style={[s.aide, { color: colors.textFaint, padding: spacing.sm }]}>
                    Aucune cuisine ne correspond.
                  </Text>
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={[s.titre, { color: colors.text }]}>Tous les filtres</Text>

              <ScrollView style={s.liste}>
                <Text style={[s.groupe, { color: colors.textFaint }]}>BUDGET</Text>
                <Budget min={budgetMin} max={budgetMax} onChange={changerBudget} />

                <Text style={[s.groupe, { color: colors.textFaint }]}>DISPONIBILITÉ</Text>
                <Case
                  coche={ouvert}
                  onChange={(v) => modifier("ouvert", v)}
                  label="Ouvert maintenant"
                />
                <Case
                  coche={reservation}
                  onChange={(v) => modifier("reservation", v)}
                  label="Réservation possible"
                />

                <Text style={[s.groupe, { color: colors.textFaint }]}>INFORMATION</Text>
                <Case
                  coche={avecCarte}
                  onChange={(v) => modifier("avecCarte", v)}
                  label="Carte analysée"
                  aide="C'est le seul filtre où l'absence d'information écarte — parce qu'il porte justement sur cette présence."
                />

                <Text style={[s.note, { color: colors.textFaint }]}>
                  Pas de filtre sur la note ni le nombre d'avis : ce serait
                  refaire le tri par popularité que ce produit existe pour
                  éviter.
                </Text>
              </ScrollView>

              <View style={[s.pied, { borderTopColor: colors.border }]}>
                <Pressable
                  onPress={() => onChange(FILTRES_VIDES)}
                  disabled={actifs === 0}
                  accessibilityRole="button"
                  style={s.effacer}
                >
                  <Text
                    style={[
                      s.effacerText,
                      { color: colors.textMuted, opacity: actifs === 0 ? 0.4 : 1 },
                    ]}
                  >
                    Tout effacer
                  </Text>
                </Pressable>

                <Pressable
                  onPress={fermer}
                  accessibilityRole="button"
                  style={[s.valider, { backgroundColor: colors.brand }]}
                >
                  <Text style={[s.validerText, { color: colors.onBrand }]}>
                    {libelleValidation}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { marginTop: spacing.sm },
  ligne: { gap: 7, paddingVertical: 4, paddingRight: spacing.md },

  pastille: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  pastilleText: { fontSize: 13, fontWeight: "500" },

  tous: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  tousText: { fontSize: 13, fontWeight: "700" },
  compteur: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  compteurText: { fontSize: 10, fontWeight: "700" },

  fond: { ...StyleSheet.absoluteFillObject },
  feuille: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
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
  liste: { paddingHorizontal: spacing.lg },

  recherche: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  rechercheInput: { flex: 1, fontSize: 14, padding: 0 },

  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
  },
  optionText: { fontSize: 14 },

  groupe: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.7,
    marginTop: spacing.md,
    marginBottom: 7,
  },
  pastilles: { flexDirection: "row", flexWrap: "wrap", gap: 7 },

  case: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  coche: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  caseText: { fontSize: 14 },
  aide: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  note: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  pied: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  effacer: { paddingVertical: 11, paddingHorizontal: 4 },
  effacerText: { fontSize: 14 },
  valider: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  validerText: { fontSize: 15, fontWeight: "600" },
});
