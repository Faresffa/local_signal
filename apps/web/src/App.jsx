// apps/web/src/App.jsx
//
// Racine de l'application web.
//
// Navigation par état plutôt que par routeur : trois écrans, aucun lien
// profond à partager pour l'instant. React Router sera introduit quand une
// URL de fiche devra être partageable, pas avant.

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import Nav from "./components/Nav";
import Discover from "./pages/Discover";
import Detail from "./pages/Detail";
import Reserve from "./pages/Reserve";
import { FILTRES_VIDES, RAYON_DEFAUT } from "./lib/filtres";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import { useCurrentUser } from "./lib/auth";

// Transition de vue native (Chromium/Safari récents) entre deux écrans de
// l'application. Dégrade sans rien casser là où l'API n'existe pas — c'est
// une amélioration progressive, jamais une dépendance.
//
// `flushSync` force React à committer AVANT que l'API ne capture le nouvel
// état du DOM : sans lui, `startViewTransition` photographierait l'ancien
// écran des deux côtés, puisque son callback doit être synchrone.
function withTransition(update) {
  if (typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(update));
  // Une transition qu'un navigateur interrompt (navigation trop rapprochée,
  // onglet caché) rejette `.ready`/`.finished` — le DOM est déjà à jour via
  // `flushSync`, seule l'animation manque. Sans ce `catch`, cette rejection
  // remonte comme une erreur non gérée alors que rien n'est cassé.
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}

export default function App() {
  const [page, setPage] = useState("discover");
  const [selected, setSelected] = useState(null);
  // L'écran Discover est démonté pendant la consultation d'une fiche. Cet état
  // vit donc ici afin que le retour retrouve exactement la recherche en cours.
  const [filtres, setFiltres] = useState(() => ({ ...FILTRES_VIDES }));
  const [radius, setRadius] = useState(RAYON_DEFAUT);
  const [lieu, setLieu] = useState(null);
  // OÙ REVENIR APRÈS S'ÊTRE CONNECTÉ. Quelqu'un qui clique « laisser un avis »
  // depuis une fiche veut revenir à cette fiche, pas être renvoyé à la liste :
  // sinon il doit refaire sa recherche, retrouver le restaurant, et le geste
  // qu'il voulait faire est oublié en chemin.
  const [retour, setRetour] = useState("discover");
  const { user, login, signup, logout } = useCurrentUser();

  // Chaque changement d'écran repart du haut : sans cela on arrive au milieu
  // d'une fiche après avoir fait défiler une longue liste.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);

  // Retour d'échec de /api/auth/google/callback (backend/main.py) : une vraie
  // redirection de page, donc une erreur qui n'a pas d'autre moyen d'arriver
  // jusqu'à React qu'un paramètre d'URL. Nettoyé immédiatement pour qu'un
  // rechargement de page ne réaffiche pas l'erreur indéfiniment.
  const [erreurGoogle, setErreurGoogle] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("erreur") === "google") {
      setErreurGoogle(true);
      setPage("login");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function openDetail(restaurant) {
    withTransition(() => {
      setSelected(restaurant);
      setPage("detail");
    });
  }

  function openReserve(restaurant) {
    withTransition(() => {
      setSelected(restaurant);
      setPage("reserve");
    });
  }

  function demanderConnexion() {
    withTransition(() => {
      setRetour(page);
      setPage("login");
    });
  }

  function naviguer(nextPage) {
    withTransition(() => setPage(nextPage));
  }

  return (
    <div className="app">
      <Nav page={page} onNavigate={naviguer} user={user} onLogout={logout} />

      <main className="page-main">
        <div className="shell">
          {page === "discover" && (
            <Discover
              onOpen={openDetail}
              filtres={filtres}
              onFiltresChange={setFiltres}
              radius={radius}
              onRadiusChange={setRadius}
              lieu={lieu}
              onLieuChange={setLieu}
              user={user}
              onUnlock={() => naviguer("signup")}
            />
          )}

          {page === "detail" && selected && (
            <Detail
              restaurant={selected}
              onBack={() => naviguer("discover")}
              onReserve={openReserve}
              user={user}
              onSeConnecter={demanderConnexion}
            />
          )}

          {page === "reserve" && selected && (
            <Reserve
              restaurant={selected}
              onBack={() => naviguer("detail")}
              onDone={() => naviguer("discover")}
            />
          )}

          {page === "login" && (
            <Login
              onLogin={async (credentials) => { await login(credentials); naviguer(retour); }}
              onGoToSignup={() => naviguer("signup")}
              onBack={() => naviguer(retour)}
              erreurInitiale={
                erreurGoogle
                  ? "La connexion avec Google a échoué. Réessayez, ou utilisez votre mot de passe."
                  : null
              }
            />
          )}

          {page === "signup" && (
            <Signup
              onSignup={async (fields) => { await signup(fields); naviguer(retour); }}
              onGoToLogin={() => naviguer("login")}
              onBack={() => naviguer(retour)}
            />
          )}

          {page === "admin" && (
            <Admin user={user} onBack={() => naviguer("discover")} />
          )}
        </div>
      </main>

      <footer className="foot shell">
        <span>Local Signal, mémoire HETIC</span>
        <span>Données des lieux : OpenStreetMap</span>
      </footer>
    </div>
  );
}
