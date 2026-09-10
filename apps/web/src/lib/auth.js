// apps/web/src/lib/auth.js
//
// État de connexion. La session vit dans un cookie httpOnly posé par l'API :
// il n'y a rien à lire ni écrire côté client, `/api/auth/me` suffit à
// restaurer l'état de connexion à chaque chargement de page.

import { useCallback, useEffect, useState } from "react";

import { fetchMe, login as apiLogin, logout as apiLogout, signup as apiSignup } from "../api";

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

  return { user, loading, login, signup, logout };
}
