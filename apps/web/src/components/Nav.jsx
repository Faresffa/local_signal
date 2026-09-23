// apps/web/src/components/Nav.jsx
//
// Barre de navigation. Une seule ligne au desktop, hauteur fixe.
// Les libellés secondaires disparaissent en dessous de 640 px plutôt que de
// passer sur deux lignes.

import { useEffect, useRef, useState } from "react";
import {
  CaretDown, ForkKnife, Gear, Heart, Moon, SignOut, Sun, User,
} from "@phosphor-icons/react";

import { useTheme } from "../lib/hooks";

// Le rôle s'affiche partout où le compte s'affiche (retour utilisateur :
// "ça affiche s'il est abonné ou pas") — jamais un chiffre, jamais l'e-mail.
const ROLE_LABEL = {
  admin: "Admin",
  subscriber: "Abonné",
  user: "Compte gratuit",
};

export default function Nav({ page, onNavigate, user, onLogout }) {
  const { isDark, toggle } = useTheme();
  const [stuck, setStuck] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const menuRef = useRef(null);

  // La bordure de la barre n'apparaît qu'une fois la page défilée. Un
  // IntersectionObserver sur une sentinelle plutôt qu'un écouteur de scroll,
  // qui se déclencherait à chaque image.
  useEffect(() => {
    const sentinel = document.createElement("div");
    sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
    document.body.prepend(sentinel);

    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);

    return () => { observer.disconnect(); sentinel.remove(); };
  }, []);

  // Ferme le menu déroulant au clic extérieur — un menu qui reste ouvert
  // pendant qu'on regarde le reste de la page gêne plus qu'il n'aide.
  useEffect(() => {
    if (!menuOuvert) return undefined;
    function surClicExterieur(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOuvert(false);
      }
    }
    document.addEventListener("mousedown", surClicExterieur);
    return () => document.removeEventListener("mousedown", surClicExterieur);
  }, [menuOuvert]);

  function aller(cible) {
    setMenuOuvert(false);
    onNavigate(cible);
  }

  return (
    <header className={`nav${stuck ? " is-stuck" : ""}`}>
      <nav className="shell nav__inner" aria-label="Navigation principale">
        <button
          className="nav__brand"
          onClick={() => onNavigate("discover")}
          aria-label="Local Signal, retour à l'accueil"
        >
          <span className="nav__mark" aria-hidden="true">
            <ForkKnife size={17} weight="fill" />
          </span>
          Local Signal
        </button>

        <button
          className="nav__link"
          aria-current={page === "discover" ? "page" : undefined}
          onClick={() => onNavigate("discover")}
        >
          Découvrir
        </button>

        {/* Réservé aux comptes admin — l'API refuse de toute façon (403) à
            quiconque d'autre, ce lien n'est que du confort de navigation. */}
        {user?.role === "admin" && (
          <button
            className="nav__link"
            aria-current={page === "admin" ? "page" : undefined}
            onClick={() => onNavigate("admin")}
          >
            Administration
          </button>
        )}

        {/* Connecté mais pas encore abonné : c'est précisément à cet
            endroit-là qu'il manque quelque chose (LS-refonte). Invisible pour
            un abonné ou un admin, qui n'ont rien à débloquer. */}
        {user && user.role === "user" && (
          <button
            className="nav__link"
            aria-current={page === "pricing" ? "page" : undefined}
            onClick={() => onNavigate("pricing")}
          >
            S'abonner
          </button>
        )}

        <button
          className="nav__theme"
          onClick={toggle}
          aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
          title={isDark ? "Thème clair" : "Thème sombre"}
        >
          {isDark ? <Sun size={19} weight="light" /> : <Moon size={19} weight="light" />}
        </button>

        {user ? (
          <div className="nav__profile" ref={menuRef}>
            <button
              type="button"
              className="nav__profileBtn"
              onClick={() => setMenuOuvert((o) => !o)}
              aria-expanded={menuOuvert}
              aria-haspopup="menu"
            >
              <User size={16} weight="bold" />
              <span className="nav__profileName">{user.name || user.email}</span>
              <span className={`nav__role nav__role--${user.role}`}>
                {ROLE_LABEL[user.role] || ROLE_LABEL.user}
              </span>
              <CaretDown size={11} weight="bold" className="nav__profileCaret" />
            </button>

            {menuOuvert && (
              <div className="nav__dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="nav__dropdownItem"
                  onClick={() => aller("profil")}
                >
                  <User size={16} weight="light" />
                  Profil
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="nav__dropdownItem"
                  onClick={() => aller("favoris")}
                >
                  <Heart size={16} weight="light" />
                  Restaurants favoris
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="nav__dropdownItem"
                  onClick={() => aller("settings")}
                >
                  <Gear size={16} weight="light" />
                  Paramètres
                </button>
                <div className="nav__dropdownSep" role="none" />
                <button
                  type="button"
                  role="menuitem"
                  className="nav__dropdownItem nav__dropdownItem--danger"
                  onClick={() => { setMenuOuvert(false); onLogout(); }}
                >
                  <SignOut size={16} weight="light" />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className="nav__link"
            aria-current={page === "login" ? "page" : undefined}
            onClick={() => onNavigate("login")}
          >
            Se connecter
          </button>
        )}
      </nav>
    </header>
  );
}
