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
import Pricing from "./pages/Pricing";
import Profile from "./pages/Profile";
import Favoris from "./pages/Favoris";
import Restaurateur from "./pages/Restaurateur";
import SignupRestaurateur from "./pages/SignupRestaurateur";
import PourLesRestaurateurs from "./pages/PourLesRestaurateurs";
import Settings from "./pages/Settings";
import CGU from "./pages/CGU";
import Confidentialite from "./pages/Confidentialite";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Dons from "./pages/Dons";
import CookieBanner from "./components/CookieBanner";
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

// Retour d'échec de /api/auth/google/callback (backend/main.py) : une vraie
// redirection de page, donc une erreur qui n'a pas d'autre moyen d'arriver
// jusqu'à React qu'un paramètre d'URL. Lu une seule fois, au chargement du
// module — avant le premier rendu, donc `page` et `erreurGoogle` démarrent
// déjà dans le bon état sans passer par un effet.
const erreurGoogleInitiale =
  new URLSearchParams(window.location.search).get("erreur") === "google";

export default function App() {
  const [page, setPage] = useState(erreurGoogleInitiale ? "login" : "discover");
  const [selected, setSelected] = useState(null);
  // L'écran Discover est démonté pendant la consultation d'une fiche. Cet état
  // vit donc ici afin que le retour retrouve exactement la recherche en cours.
  const [filtres, setFiltres] = useState(() => ({ ...FILTRES_VIDES }));
  const [radius, setRadius] = useState(RAYON_DEFAUT);
  const [lieu, setLieu] = useState(null);
  // OÙ REVENIR APRÈS S'ÊTRE CONNECTÉ. Quelqu'un qui clique « ajouter aux
  // favoris » depuis une fiche veut revenir à cette fiche, pas être renvoyé à la liste :
  // sinon il doit refaire sa recherche, retrouver le restaurant, et le geste
  // qu'il voulait faire est oublié en chemin.
  const [retour, setRetour] = useState("discover");
  const {
    user, login, signup, signupRestaurateur, logout, subscribe, unsubscribe,
    supprimerCompte,
  } = useCurrentUser();

  // Chaque changement d'écran repart du haut : sans cela on arrive au milieu
  // d'une fiche après avoir fait défiler une longue liste.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);

  // UN COMPTE RESTAURATEUR N'A PAS DE PAGE D'ACCUEIL CLIENT (D-055 v2) :
  // « Découvrir » suppose un rôle qui n'est plus le sien depuis que les
  // comptes sont séparés à l'inscription. Ce garde-fou joue à la connexion
  // ET au rechargement d'une session existante — `page` ne bouge que s'il
  // est resté sur la valeur par défaut, pour ne jamais écraser une
  // navigation volontaire (settings, CGU…) déjà en cours.
  useEffect(() => {
    if (user?.role === "restaurateur" && page === "discover") {
      setPage("restaurateur");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Ne change plus après le montage (rien ne la remet à jour) : un `const`
  // suffit, pas besoin d'un état React pour une valeur figée au chargement.
  const erreurGoogle = erreurGoogleInitiale;
  // Seul effet de bord restant : nettoyer l'URL pour qu'un rechargement de
  // page ne réaffiche pas l'erreur indéfiniment. `page` et `erreurGoogle`
  // sont déjà dans le bon état dès le premier rendu (voir ci-dessus).
  useEffect(() => {
    if (erreurGoogleInitiale) {
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

  // Pages légales : accessibles depuis n'importe où (pied de page, case à
  // cocher de l'inscription), avec un vrai retour à l'écran d'origine —
  // pas systématiquement l'accueil.
  function ouvrirLegal(nom) {
    withTransition(() => {
      setRetour(page);
      setPage(nom);
    });
  }

  function naviguer(nextPage) {
    withTransition(() => setPage(nextPage));
  }

  // Un visiteur non connecté doit d'abord créer un compte ; un compte déjà
  // connecté sans Pass n'a plus besoin que de ça — inutile de lui
  // redemander un compte qu'il a déjà (la limite se lève avec un Pass
  // Voyageur, D-063, plus à la simple connexion).
  function demanderDeverrouillage() {
    setRetour(page);
    naviguer(user ? "pricing" : "signup");
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
              onUnlock={demanderDeverrouillage}
            />
          )}

          {page === "detail" && selected && (
            <Detail
              restaurant={selected}
              onBack={() => naviguer("discover")}
              onReserve={openReserve}
              user={user}
              onSeConnecter={demanderConnexion}
              onUnlock={demanderDeverrouillage}
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
              onLogin={async (credentials) => {
                const u = await login(credentials);
                naviguer(u.role === "restaurateur" ? "restaurateur" : retour);
              }}
              onGoToSignup={() => naviguer("signup")}
              onGoToSignupRestaurateur={() => naviguer("signup-restaurateur")}
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
              onGoToSignupRestaurateur={() => naviguer("signup-restaurateur")}
              onBack={() => naviguer(retour)}
              onGoToCGU={() => ouvrirLegal("cgu")}
              onGoToConfidentialite={() => ouvrirLegal("confidentialite")}
            />
          )}

          {page === "signup-restaurateur" && (
            <SignupRestaurateur
              onSignup={async (fields) => { await signupRestaurateur(fields); naviguer("restaurateur"); }}
              onGoToLogin={() => naviguer("login")}
              onBack={() => naviguer(retour)}
              onGoToCGU={() => ouvrirLegal("cgu")}
              onGoToConfidentialite={() => ouvrirLegal("confidentialite")}
            />
          )}

          {page === "admin" && (
            <Admin user={user} onBack={() => naviguer("discover")} />
          )}

          {page === "pricing" && (
            <Pricing
              user={user}
              onAbonner={async () => { await subscribe(); naviguer(retour); }}
              onBack={() => naviguer(retour)}
            />
          )}

          {page === "pour-restaurateurs" && (
            <PourLesRestaurateurs
              user={user}
              onGoToSignupRestaurateur={() => naviguer("signup-restaurateur")}
              onGoToEspace={() => naviguer("restaurateur")}
              onBack={() => naviguer(retour)}
            />
          )}

          {page === "profil" && user && (
            <Profile
              user={user}
              onBack={() => naviguer("discover")}
              onGoToSettings={() => naviguer("settings")}
            />
          )}

          {page === "favoris" && (
            <Favoris user={user} onOpen={openDetail} onUnlock={demanderDeverrouillage} />
          )}

          {page === "restaurateur" && (
            <Restaurateur onSeConnecter={demanderConnexion} />
          )}

          {page === "settings" && user && (
            <Settings
              user={user}
              onBack={() => naviguer(user.role === "restaurateur" ? "restaurateur" : "discover")}
              onGoToPricing={() => naviguer("pricing")}
              onUnsubscribe={unsubscribe}
              onDeleteAccount={async () => {
                await supprimerCompte();
                naviguer("discover");
              }}
            />
          )}

          {page === "cgu" && (
            <CGU
              onBack={() => naviguer(retour)}
              onGoToConfidentialite={() => naviguer("confidentialite")}
            />
          )}

          {page === "confidentialite" && (
            <Confidentialite
              onBack={() => naviguer(retour)}
              onGoToCGU={() => naviguer("cgu")}
            />
          )}

          {page === "about" && <About onBack={() => naviguer(retour)} />}
          {page === "contact" && <Contact onBack={() => naviguer(retour)} />}
          {page === "dons" && <Dons onBack={() => naviguer(retour)} />}
        </div>
      </main>

      <footer className="foot shell">
        <span>Local Signal</span>
        <span className="foot__liens">
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("about")}>
            À propos
          </button>
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("pour-restaurateurs")}>
            Restaurateurs
          </button>
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("contact")}>
            Contact
          </button>
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("dons")}>
            Faire un don
          </button>
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("cgu")}>
            CGU
          </button>
          <button type="button" className="linkbtn" onClick={() => ouvrirLegal("confidentialite")}>
            Confidentialité
          </button>
          <span>Données des lieux : OpenStreetMap</span>
        </span>
      </footer>

      <CookieBanner onOpenConfidentialite={() => ouvrirLegal("confidentialite")} />
    </div>
  );
}
