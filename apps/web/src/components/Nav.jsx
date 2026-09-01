// apps/web/src/components/Nav.jsx
//
// Barre de navigation. Une seule ligne au desktop, hauteur fixe.
// Les libellés secondaires disparaissent en dessous de 640 px plutôt que de
// passer sur deux lignes.

import { ForkKnife, Moon, Sun } from "@phosphor-icons/react";

import { useTheme } from "../lib/hooks";

export default function Nav({ page, onNavigate }) {
  const { isDark, toggle } = useTheme();

  return (
    <header className="nav">
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

        <button
          className="nav__theme"
          onClick={toggle}
          aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
          title={isDark ? "Thème clair" : "Thème sombre"}
        >
          {isDark ? <Sun size={19} weight="light" /> : <Moon size={19} weight="light" />}
        </button>
      </nav>
    </header>
  );
}
