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
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { useCurrentUser } from "./lib/auth";

export default function App() {
  const [page, setPage] = useState("discover");
  const [selected, setSelected] = useState(null);
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

  return (
    <div className="app">
      <Nav page={page} onNavigate={setPage} user={user} onLogout={logout} />

      <main className="page-main">
        <div className="shell">
          {page === "discover" && <Discover onOpen={openDetail} />}

          {page === "detail" && selected && (
            <Detail
              restaurant={selected}
              onBack={() => setPage("discover")}
              onReserve={openReserve}
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
              onLogin={async (credentials) => { await login(credentials); setPage("discover"); }}
              onGoToSignup={() => setPage("signup")}
              onBack={() => setPage("discover")}
            />
          )}

          {page === "signup" && (
            <Signup
              onSignup={async (fields) => { await signup(fields); setPage("discover"); }}
              onGoToLogin={() => setPage("login")}
              onBack={() => setPage("discover")}
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
