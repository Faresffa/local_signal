// apps/web/src/components/CookieBanner.jsx
//
// Bannière cookies — un choix standard, accepter ou refuser, comme sur
// n'importe quel site (retour utilisateur explicite : pas d'explication à
// rallonge, juste le choix). Le cookie de session reste nécessaire dans les
// deux cas ; le choix stocké ici sert de porte pour tout ce qui sera ajouté
// plus tard (analytics — voir Confidentialite.jsx §4) : ce code-là devra lire
// `ls-cookies-consent` avant de s'activer, pas avant.

import { useEffect, useState } from "react";
import { Cookie } from "@phosphor-icons/react";

const CLE_STOCKAGE = "ls-cookies-consent";

export default function CookieBanner({ onOpenConfidentialite }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLE_STOCKAGE)) setVisible(true);
    } catch {
      // Stockage indisponible (navigation privée stricte) : on montre la
      // bannière sans pouvoir mémoriser le choix, plutôt que de la cacher.
      setVisible(true);
    }
  }, []);

  function choisir(valeur) {
    setVisible(false);
    try {
      localStorage.setItem(CLE_STOCKAGE, valeur);
    } catch {
      // Rien à faire : la bannière réapparaîtra à la prochaine visite.
    }
  }

  if (!visible) return null;

  return (
    <div className="cookiebar" role="dialog" aria-label="Gestion des cookies">
      <div className="cookiebar__contenu">
        <Cookie size={20} weight="light" className="cookiebar__icone" />
        <p>
          Ce site utilise des cookies.{" "}
          <button type="button" className="linkbtn" onClick={onOpenConfidentialite}>
            En savoir plus
          </button>
        </p>
      </div>
      <div className="cookiebar__boutons">
        <button type="button" className="btn btn--ghost" onClick={() => choisir("refuse")}>
          Refuser
        </button>
        <button type="button" className="btn btn--primary" onClick={() => choisir("accepte")}>
          Accepter
        </button>
      </div>
    </div>
  );
}
