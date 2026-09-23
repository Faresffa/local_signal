// apps/web/src/lib/auth.js
//
// État de connexion. La session vit dans un cookie httpOnly posé par l'API :
// il n'y a rien à lire ni écrire côté client, `/api/auth/me` suffit à
// restaurer l'état de connexion à chaque chargement de page.

import { useCallback, useEffect, useState } from "react";

import {
  fetchMe, login as apiLogin, logout as apiLogout, signup as apiSignup,
  subscribe as apiSubscribe, supprimerCompte as apiSupprimerCompte,
  unsubscribe as apiUnsubscribe,
} from "../api";

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((u) => { if (!cancelled) { setUser(u); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (credentials) => {
    const u = await apiLogin(credentials);
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (fields) => {
    const u = await apiSignup(fields);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  // Démonstration, pas un paiement (voir backend/main.py) : bascule le rôle,
  // rien de plus.
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

  // Droit à l'effacement (RGPD, LS-39) — le cookie est déjà retiré côté
  // serveur par la route de suppression, inutile d'appeler `logout` en plus.
  const supprimerCompte = useCallback(async () => {
    await apiSupprimerCompte();
    setUser(null);
  }, []);

  return {
    user, loading, login, signup, logout, subscribe, unsubscribe, supprimerCompte,
  };
}
