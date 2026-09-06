// apps/mobile/src/components/Budget.js
//
// Fourchette de budget, à deux poignées (D-037). Pendant mobile de
// `apps/web/src/components/Budget.jsx`.
//
// POURQUOI UNE GLISSIÈRE ÉCRITE À LA MAIN. React Native ne fournit pas de
// glissière à deux poignées, et `@react-native-community/slider` n'en propose
// qu'une. Plutôt que d'ajouter une dépendance pour un seul écran, les deux
// poignées se déplacent au geste : `PanResponder` est dans le cœur de React
// Native, il n'a rien à installer, et le comportement reste sous notre
// contrôle.
//
// LES DEUX POIGNÉES NE PEUVENT PAS SE CROISER. Sans cette contrainte, on
// obtient un minimum supérieur au maximum, donc une requête qui ne renvoie
// jamais rien et que l'utilisateur ne sait pas défaire.
//
// L'ACCESSIBILITÉ N'EST PAS EN OPTION. Chaque poignée est déclarée comme
// `adjustable` avec ses valeurs min/max/actuelle et répond aux actions
// d'incrément et de décrément : sans cela, un utilisateur de VoiceOver ou de
// TalkBack ne peut pas régler son budget du tout.

import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { radius, spacing, useColors } from "../theme";
import { BUDGET_MAX, BUDGET_MIN, BUDGET_PAS, budgetSansPlafond } from "../lib/filtres";

const TAILLE_POIGNEE = 22;

export default function Budget({ min, max, onChange }) {
  const colors = useColors();
  const [largeur, setLargeur] = useState(0);

  // Les valeurs vivent aussi dans une référence : `PanResponder` capture son
  // état à la création, et lirait sinon éternellement les valeurs du premier
  // rendu.
  const courant = useRef({ min, max });
  courant.current = { min, max };

  const etendue = BUDGET_MAX - BUDGET_MIN;

  // POSITION EN POURCENTAGE, PAS EN PIXELS, POUR LE RENDU.
  //
  // Tout le placement dependait de `largeur`, mesuree par `onLayout`. Dans une
  // feuille modale, cette mesure revient a 0 au premier rendu : les poignees
  // n'etaient donc jamais montees, et la portion retenue avait une largeur
  // nulle. La glissiere s'affichait vide.
  //
  // Le pourcentage ne depend d'aucune mesure et rend correctement des le
  // premier passage. `largeur` ne sert plus qu'a convertir un geste en valeur,
  // ce qui n'a de sens qu'apres la mesure de toute facon.
  const versPourcent = (v) => ((v - BUDGET_MIN) / etendue) * 100;

  // MESURE IMPÉRATIVE, AU MOMENT OÙ LE GESTE COMMENCE.
  //
  // `onLayout` ne se déclenche pas sur une vue montée dans une feuille modale
  // sous react-native-web : `largeur` restait à 0, et comme `versValeur`
  // divise par elle, la moindre amorce de geste envoyait la valeur à une
  // borne. Deux mesures indépendantes l'ont confirmé — la poignée sautait à
  // 5 €, puis, une fois le geste protégé, ne bougeait plus du tout.
  //
  // On mesure donc la piste à `onPanResponderGrant`, c'est-à-dire au premier
  // contact et avant tout déplacement. `getBoundingClientRect` couvre le web,
  // `measure` le natif : les deux chemins sont là parce que ce composant tourne
  // sur les deux. `onLayout` reste en place, il alimente le cas natif où il
  // fonctionne — la mesure impérative n'est qu'un filet.
  const largeurRef = useRef(0);
  largeurRef.current = largeur;
  const pisteRef = useRef(null);

  const mesurer = () => {
    const noeud = pisteRef.current;
    if (!noeud) return;
    if (typeof noeud.getBoundingClientRect === "function") {
      const l = noeud.getBoundingClientRect().width;
      if (l > 0) { largeurRef.current = l; setLargeur(l); }
    } else if (typeof noeud.measure === "function") {
      noeud.measure((_x, _y, l) => {
        if (l > 0) { largeurRef.current = l; setLargeur(l); }
      });
    }
  };

  const faireResponder = (cible) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: mesurer,
      onPanResponderMove: (_e, gesture) => {
        if (largeurRef.current <= 0) return;
        const { min: bas, max: haut } = courant.current;
        const l = largeurRef.current;
        const enPixels = (v) => ((v - BUDGET_MIN) / etendue) * l;
        const depart = cible === "min" ? enPixels(bas) : enPixels(haut);
        const brut = BUDGET_MIN + ((depart + gesture.dx) / l) * etendue;
        const cale = Math.round(brut / BUDGET_PAS) * BUDGET_PAS;
        const valeur = Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, cale));
        if (cible === "min") onChange(Math.min(valeur, haut), haut);
        else onChange(bas, Math.max(valeur, bas));
      },
    });

  const responderMin = useRef(faireResponder("min")).current;
  const responderMax = useRef(faireResponder("max")).current;

  const gauche = versPourcent(min);
  const droite = versPourcent(max);

  const poignee = (cible, position, responder, valeur) => (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={
        cible === "min" ? "Budget minimum, en euros" : "Budget maximum, en euros"
      }
      accessibilityValue={{ min: BUDGET_MIN, max: BUDGET_MAX, now: valeur }}
      onAccessibilityAction={({ nativeEvent }) => {
        const pas = nativeEvent.actionName === "increment" ? BUDGET_PAS : -BUDGET_PAS;
        const v = Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, valeur + pas));
        if (cible === "min") onChange(Math.min(v, max), max);
        else onChange(min, Math.max(v, min));
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      style={[
        s.poignee,
        {
          left: `${position}%`,
          // Le decalage recentre la poignee sur sa position : sans lui, elle
          // depasserait d'une demi-largeur a chaque extremite.
          marginLeft: -TAILLE_POIGNEE / 2,
          backgroundColor: colors.surface,
          borderColor: colors.brand,
        },
      ]}
    />
  );

  return (
    <View
      style={s.bloc}
      // MESURE SUR LE CONTENEUR, PAS SUR LA PISTE. Dans une feuille modale,
      // `onLayout` ne s'est jamais déclenché sur la piste : `largeur` restait
      // à 0 et le moindre geste envoyait la valeur à une borne. Le conteneur
      // est un bloc de flux ordinaire, sa mesure arrive toujours — et la piste
      // occupe exactement sa largeur, les deux valeurs sont donc égales.
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
    >
      <View style={s.valeurs}>
        <Text style={[s.valeur, { color: colors.text }]}>
          {min <= BUDGET_MIN ? `${BUDGET_MIN} €` : `${min} €`}
        </Text>
        <Text style={[s.valeur, { color: colors.text }]}>
          {budgetSansPlafond(max) ? `${BUDGET_MAX} € et plus` : `${max} €`}
        </Text>
      </View>

      <View ref={pisteRef} style={s.piste}>
        <View style={[s.rail, { backgroundColor: colors.surfaceSunken }]} />
        <View
          style={[
            s.retenu,
            {
              left: `${gauche}%`,
              width: `${Math.max(0, droite - gauche)}%`,
              backgroundColor: colors.brand,
            },
          ]}
        />
        {poignee("min", gauche, responderMin, min)}
        {poignee("max", droite, responderMax, max)}
      </View>

      <Text style={[s.note, { color: colors.textFaint }]}>
        Prix médian d'un plat. Un restaurant dont le prix est inconnu reste
        affiché : l'absence d'information ne l'écarte pas.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { gap: 9 },
  valeurs: { flexDirection: "row", justifyContent: "space-between" },
  valeur: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  piste: { height: 30, justifyContent: "center" },
  rail: { position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2 },
  retenu: { position: "absolute", height: 4, borderRadius: 2 },
  poignee: {
    position: "absolute",
    width: TAILLE_POIGNEE,
    height: TAILLE_POIGNEE,
    borderRadius: TAILLE_POIGNEE / 2,
    borderWidth: 2,
  },
  note: { fontSize: 11, lineHeight: 15 },
});
