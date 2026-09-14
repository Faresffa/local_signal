// Local Signal — application mobile (Expo / React Native).
//
// Navigation par état plutôt que par bibliothèque : deux onglets et deux
// écrans empilés. react-navigation sera introduit quand il faudra des liens
// profonds ou une pile plus profonde, pas avant.
//
// Le thème suit le réglage système, comme le web. Toutes les couleurs viennent
// de packages/shared : les deux interfaces ne peuvent pas diverger (D-022).

import { useEffect, useRef, useState } from "react";
import {
  Animated, Pressable, SafeAreaView, StatusBar, StyleSheet, Text,
  useColorScheme, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import CompteScreen from "./src/screens/CompteScreen";
import DetailScreen from "./src/screens/DetailScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import ReserveScreen from "./src/screens/ReserveScreen";
import ScanScreen from "./src/screens/ScanScreen";
import { useCurrentUser } from "./src/lib/auth";
import { spacing, useColors } from "./src/theme";

// Transition d'écran.
//
// Composant à part, et volontairement remonté à chaque changement de `key` :
// il naît avec une valeur animée neuve à 0. On ne réinitialise jamais une
// valeur existante pour rejouer l'animation — sous react-native-web, remettre
// à zéro une valeur déjà pilotée par le driver natif la laisse bloquée là, et
// l'écran reste invisible. Remonter le composant est la seule façon fiable de
// repartir.
function Transition({ decalage, duree, children }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duree,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, duree]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [decalage, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// « Découvrir » dépend du GPS ; « Chercher » ne l'exige pas. Les deux sont
// nécessaires : la base ne couvre qu'un quartier, et un utilisateur qui n'y
// est pas doit quand même pouvoir explorer (D-026).
// DEUX ONGLETS, PAS TROIS (D-037).
//
// « Chercher » etait un ecran a part, dedie au choix du point de depart,
// alors que le web fait tout depuis sa page unique. Deux interfaces pour le
// meme produit, avec des parcours differents : passer de l'une a l'autre
// obligeait a reapprendre. Le choix du lieu est desormais dans la page de
// decouverte, comme sur le web, et l'onglet separe disparait.
//
// Reste ce qui est reellement une autre activite : scanner une carte.
const ONGLETS = [
  { key: "discover", label: "Découvrir", icon: "compass" },
  { key: "scan", label: "Scanner", icon: "camera" },
];

export default function App() {
  const colors = useColors();
  const isDark = useColorScheme() === "dark";

  const [tab, setTab] = useState("discover");
  const [stack, setStack] = useState(null); // { screen, restaurant }
  const { user, login, signup, logout } = useCurrentUser();

  function ouvrirFiche(restaurant) {
    setStack({ screen: "detail", restaurant });
  }

  function ouvrirReservation(restaurant) {
    setStack({ screen: "reserve", restaurant });
  }

  // LE COMPTE N'EST PAS UN TROISIÈME ONGLET (D-037). Deux onglets, et deux
  // seulement : « Découvrir » et « Scanner » sont deux activités, se connecter
  // n'en est pas une — c'est un détour qu'on fait pour revenir à ce qu'on
  // faisait. D'où un écran empilé, et un retour qui ramène exactement d'où
  // l'on vient, fiche comprise.
  function ouvrirCompte(depuis = null, motif = null) {
    setStack({ screen: "compte", depuis, motif });
  }

  function fermerCompte() {
    // Revenir à la fiche d'où venait la demande de connexion, plutôt qu'à la
    // liste : sinon il faut refaire la recherche, retrouver le restaurant, et
    // le geste qu'on voulait faire est oublié en chemin.
    setStack(stack?.depuis ? { screen: "detail", restaurant: stack.depuis } : null);
  }

  // Un écran empilé recouvre les onglets : on ne mélange pas une fiche et une
  // barre de navigation qui suggère qu'on est ailleurs.
  const contenu = stack ? (
    stack.screen === "compte" ? (
      <CompteScreen
        user={user}
        motif={stack.motif}
        onLogin={async (identifiants) => { await login(identifiants); fermerCompte(); }}
        onSignup={async (champs) => { await signup(champs); fermerCompte(); }}
        onLogout={async () => { await logout(); setStack(null); }}
        onBack={fermerCompte}
      />
    ) : stack.screen === "detail" ? (
      <DetailScreen
        restaurant={stack.restaurant}
        onBack={() => setStack(null)}
        onReserve={ouvrirReservation}
        user={user}
        onSeConnecter={() => ouvrirCompte(
          stack.restaurant,
          "Un compte permet de laisser un avis, et de le modifier ou le retirer quand vous voulez.",
        )}
      />
    ) : (
      <ReserveScreen
        restaurant={stack.restaurant}
        onBack={() => setStack({ screen: "detail", restaurant: stack.restaurant })}
        onDone={() => setStack(null)}
      />
    )
  ) : tab === "discover" ? (
    <DiscoverScreen onOpen={ouvrirFiche} user={user} onCompte={() => ouvrirCompte()} />
  ) : (
    <ScanScreen />
  );

  // Le mouvement dit ce qui vient de se passer : un écran empilé glisse depuis
  // la droite (on s'enfonce dans une pile), un changement d'onglet se substitue
  // en fondu (on se déplace latéralement).
  const cle = stack ? `${stack.screen}-${stack.restaurant?.id ?? "moi"}` : tab;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <Transition key={cle} decalage={stack ? 34 : 0} duree={stack ? 260 : 200}>
        {contenu}
      </Transition>

      {!stack && (
        <View
          style={[
            s.tabBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          {ONGLETS.map((o) => {
            const actif = o.key === tab;
            return (
              <Pressable
                key={o.key}
                onPress={() => setTab(o.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: actif }}
                accessibilityLabel={o.label}
                style={s.tab}
              >
                <Feather
                  name={o.icon}
                  size={21}
                  color={actif ? colors.brand : colors.textMuted}
                />
                <Text
                  style={[
                    s.tabLabel,
                    { color: actif ? colors.brand : colors.textMuted },
                    actif && s.tabLabelActive,
                  ]}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: 1 },
  // 56 points minimum : la cible tactile doit rester confortable au pouce.
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: spacing.sm,
  },
  tabLabel: { fontSize: 11, fontWeight: "500" },
  tabLabelActive: { fontWeight: "700" },
});
