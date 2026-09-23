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
  restaurerSession, signup as apiSignup, subscribe as apiSubscribe,
  supprimerCompte as apiSupprimerCompte, unsubscribe as apiUnsubscribe,
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

  // Démonstration, pas un paiement réel (voir backend/main.py) : bascule le
  // rôle, rien de plus — même mécanisme que le web (lib/auth.js).
  const subscribe = useCallback(async () => {
    const u = await apiSubscribe();
    setUser(u);
    return u;
  }, []);

  const unsubscribe = useCallback(async () => {
    const u = await apiUnsubscribe();
    setUser(u);
    return u;
  }, []);

  // Droit à l'effacement (RGPD, LS-39) — le jeton est déjà retiré par
  // `apiSupprimerCompte`, inutile d'appeler `logout` en plus.
  const supprimerCompte = useCallback(async () => {
    await apiSupprimerCompte();
    setUser(null);
  }, []);

  return {
    user, loading, login, signup, logout, subscribe, unsubscribe, supprimerCompte,
  };
}
