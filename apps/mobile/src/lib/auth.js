// apps/mobile/src/lib/auth.js
//
// État de connexion. Miroir de apps/web/src/lib/auth.js, à une différence
// près : le web n'a rien à restaurer — son cookie part tout seul à chaque
// requête. Le mobile doit d'abord relire son jeton dans le stockage sécurisé
// avant de pouvoir demander qui il est (LS-40).
//
// D'où le `loading` initial, qui compte ici : afficher « se connecter » à
// quelqu'un qui a une session valide, le temps d'un aller-retour, le pousse à
// se reconnecter pour rien.

import { useCallback, useEffect, useState } from "react";

import {
  fetchMe, login as apiLogin, logout as apiLogout,
  restaurerSession, signup as apiSignup,
} from "../api";

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      await restaurerSession();
      const u = await fetchMe();
      if (!annule) { setUser(u); setLoading(false); }
    })();
    return () => { annule = true; };
  }, []);

  const login = useCallback(async (identifiants) => {
    const u = await apiLogin(identifiants);
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (champs) => {
    const u = await apiSignup(champs);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return { user, loading, login, signup, logout };
}
