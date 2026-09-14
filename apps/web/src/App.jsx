// apps/web/src/App.jsx
//
// Racine de l'application web.
//
// Navigation par état plutôt que par routeur : trois écrans, aucun lien
// profond à partager pour l'instant. React Router sera introduit quand une
// URL de fiche devra être partageable, pas avant.

import { useEffect, useState } from "react";

import Nav from "./components/Nav";
import Discover from "./pages/Discover";
import Detail from "./pages/Detail";
import Reserve from "./pages/Reserve";
import { FILTRES_VIDES, RAYON_DEFAUT } from "./lib/filtres";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { useCurrentUser } from "./lib/auth";

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

  function openDetail(restaurant) {
    setSelected(restaurant);
    setPage("detail");
  }

  function openReserve(restaurant) {
    setSelected(restaurant);
    setPage("reserve");
  }

  function demanderConnexion() {
    setRetour(page);
    setPage("login");
  }

  return (
    <div className="app">
      <Nav page={page} onNavigate={setPage} user={user} onLogout={logout} />

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
              onUnlock={() => setPage("signup")}
            />
          )}

          {page === "detail" && selected && (
            <Detail
              restaurant={selected}
              onBack={() => setPage("discover")}
              onReserve={openReserve}
              user={user}
              onSeConnecter={demanderConnexion}
            />
          )}

          {page === "reserve" && selected && (
            <Reserve
              restaurant={selected}
              onBack={() => setPage("detail")}
              onDone={() => setPage("discover")}
            />
          )}

          {page === "login" && (
            <Login
              onLogin={async (credentials) => { await login(credentials); setPage(retour); }}
              onGoToSignup={() => setPage("signup")}
              onBack={() => setPage(retour)}
            />
          )}

          {page === "signup" && (
            <Signup
              onSignup={async (fields) => { await signup(fields); setPage(retour); }}
              onGoToLogin={() => setPage("login")}
              onBack={() => setPage(retour)}
            />
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
