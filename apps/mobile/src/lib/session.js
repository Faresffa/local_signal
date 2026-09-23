// apps/mobile/src/lib/session.js
//
// OÙ VIT LE JETON DE SESSION SUR MOBILE (LS-40).
//
// Le web reçoit un cookie `httpOnly` : aucun script de la page ne peut le
// lire, c'est la meilleure défense contre le vol de session. React Native n'a
// pas cet outil — son bocal à cookies dépend de la plateforme, se vide à la
// réinstallation, et n'existe pas du tout dans certaines configurations. Une
// session qui disparaît au hasard est pire qu'une session absente : on ne sait
// pas quoi en dire à l'utilisateur.
//
// L'application garde donc le jeton elle-même, dans l'endroit prévu pour les
// secrets par le système : le Keychain sur iOS, le Keystore sur Android. C'est
// chiffré par l'OS, lié à l'application, et cela survit au redémarrage sans
// survivre à la désinstallation.
//
// C'EST LE MÊME JETON QUE CELUI DU COOKIE WEB, dans la même table, avec la
// même expiration. Il n'y a pas deux authentifications à maintenir — seulement
// deux façons de présenter la même preuve. Un compte créé sur le web ouvre
// l'application mobile.
//
// SUR LE WEB (react-native-web, le mode de développement), SecureStore
// n'existe pas. On retombe sur `localStorage`, ce qui est moins sûr et ne doit
// jamais devenir le mode de production d'un vrai téléphone. Le repli existe
// pour que `npm run web` fonctionne, pas pour être livré.

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const CLE = "local_signal_session";

const web = Platform.OS === "web";

export async function lireJeton() {
  try {
    if (web) return globalThis.localStorage?.getItem(CLE) ?? null;
    return await SecureStore.getItemAsync(CLE);
  } catch {
    // Un stockage indisponible se lit comme « pas de session ». On ne fait
    // jamais échouer le démarrage de l'application pour ça : l'utilisateur
    // arrive simplement déconnecté.
    return null;
  }
}

export async function ecrireJeton(jeton) {
  try {
    if (web) { globalThis.localStorage?.setItem(CLE, jeton); return; }
    await SecureStore.setItemAsync(CLE, jeton);
  } catch {
    // Session vivante en mémoire, perdue au prochain lancement. C'est
    // dégradé, pas cassé — mieux vaut ça qu'un échec de connexion.
  }
}

export async function effacerJeton() {
  try {
    if (web) { globalThis.localStorage?.removeItem(CLE); return; }
    await SecureStore.deleteItemAsync(CLE);
  } catch {
    // Rien à faire : le jeton est de toute façon révoqué côté serveur.
  }
}
