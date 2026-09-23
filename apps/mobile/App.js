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

import AboutScreen from "./src/screens/AboutScreen";
import CGUScreen from "./src/screens/CGUScreen";
import CompteScreen from "./src/screens/CompteScreen";
import ConfidentialiteScreen from "./src/screens/ConfidentialiteScreen";
import ContactScreen from "./src/screens/ContactScreen";
import DonsScreen from "./src/screens/DonsScreen";
import DetailScreen from "./src/screens/DetailScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import PricingScreen from "./src/screens/PricingScreen";
import ReserveScreen from "./src/screens/ReserveScreen";
import ScanScreen from "./src/screens/ScanScreen";
import MotifCouverts from "./src/components/MotifCouverts";
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
  const { user, login, signup, logout, unsubscribe, supprimerCompte } = useCurrentUser();

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

  // Pages légales : n'existent aujourd'hui que depuis la case à cocher de
  // l'inscription (CompteScreen). Le retour rouvre le compte en gardant le
  // mode « inscription » — sans `modeDepart`, CompteScreen repartirait sur
  // « connexion » et l'utilisateur perdrait ce qu'il avait commencé à remplir.
  function ouvrirLegal(page) {
    setStack({ screen: page });
  }

  function ouvrirPricing() {
    setStack({ screen: "pricing" });
  }

  // Filtre premium verrouillé (D-050) : un compte déjà connecté va direct à
  // l'abonnement, un visiteur doit d'abord créer un compte — même logique
  // que `demanderDeverrouillage` côté web (App.jsx).
  function demanderDeverrouillage() {
    if (user) {
      ouvrirPricing();
    } else {
      setStack({
        screen: "compte",
        modeDepart: "signup",
        motif: "Un abonnement débloque le filtre de score et les restaurants favoris.",
      });
    }
  }

  // Un écran empilé recouvre les onglets : on ne mélange pas une fiche et une
  // barre de navigation qui suggère qu'on est ailleurs.
  const contenu = stack ? (
    stack.screen === "compte" ? (
      <CompteScreen
        user={user}
        motif={stack.motif}
        modeDepart={stack.modeDepart}
        onLogin={async (identifiants) => { await login(identifiants); fermerCompte(); }}
        onSignup={async (champs) => { await signup(champs); fermerCompte(); }}
        onLogout={async () => { await logout(); setStack(null); }}
        onBack={fermerCompte}
        onGoToCGU={() => ouvrirLegal("cgu")}
        onGoToConfidentialite={() => ouvrirLegal("confidentialite")}
        onGoToPricing={ouvrirPricing}
        onUnsubscribe={unsubscribe}
        onDeleteAccount={async () => { await supprimerCompte(); setStack(null); }}
        onGoToAbout={() => ouvrirLegal("about")}
        onGoToContact={() => ouvrirLegal("contact")}
        onGoToDons={() => ouvrirLegal("dons")}
      />
    ) : stack.screen === "cgu" ? (
      <CGUScreen
        onBack={() => setStack({ screen: "compte", modeDepart: "signup" })}
        onGoToConfidentialite={() => ouvrirLegal("confidentialite")}
      />
    ) : stack.screen === "confidentialite" ? (
      <ConfidentialiteScreen
        onBack={() => setStack({ screen: "compte", modeDepart: "signup" })}
        onGoToCGU={() => ouvrirLegal("cgu")}
      />
    ) : stack.screen === "pricing" ? (
      <PricingScreen user={user} onBack={() => setStack({ screen: "compte" })} />
    ) : stack.screen === "about" ? (
      <AboutScreen onBack={() => setStack({ screen: "compte" })} />
    ) : stack.screen === "contact" ? (
      <ContactScreen onBack={() => setStack({ screen: "compte" })} />
    ) : stack.screen === "dons" ? (
      <DonsScreen onBack={() => setStack({ screen: "compte" })} />
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
    <DiscoverScreen
      onOpen={ouvrirFiche}
      user={user}
      onCompte={() => ouvrirCompte()}
      onUnlock={demanderDeverrouillage}
    />
  ) : (
    <ScanScreen user={user} />
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

      {/* EN AVANT-PLAN, PAS EN ARRIÈRE-PLAN (retour utilisateur) : rendu en
          dernier plutôt qu'en premier, le motif peint par-dessus tout —
          écrans, onglets compris — au lieu de disparaître derrière les cartes
          et photos opaques. `pointerEvents="none"` : il ne intercepte jamais
          un appui. Noir en clair, rouge de marque en sombre. */}
      <MotifCouverts color={isDark ? colors.brand : "#17140f"} />
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
