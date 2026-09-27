// apps/web/src/pages/Profile.jsx
//
// Fiche du compte connecté (LS-refonte, menu déroulant de Nav.jsx). Lecture
// seule — toute modification (mot de passe, Pass Voyageur) se fait dans
// Settings.jsx, pas ici : deux pages, deux gestes différents.

import { ArrowLeft, EnvelopeSimple, User } from "@phosphor-icons/react";

const ROLE_LABEL = {
  admin: "Administrateur",
  subscriber: "Pass Voyageur actif",
  user: "Compte gratuit",
};

export default function Profile({ user, onBack, onGoToSettings }) {
  return (
    <div className="authpage">
      <div className="authcard enter" style={{ "--enter-delay": "0ms" }}>
        <button className="linkbtn" onClick={onBack} style={{ marginBottom: 16 }}>
          <ArrowLeft size={15} weight="bold" />
          Retour
        </button>

        <div className="authcard__mark" aria-hidden="true">
          <User size={20} weight="fill" />
        </div>

        <h1 className="authcard__title">{user.name || "Votre profil"}</h1>
        <p className="authcard__lede">
          <EnvelopeSimple
            size={15}
            weight="light"
            style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
          />
          {user.email}
        </p>

        <span className={`nav__role nav__role--${user.role}`} style={{ marginTop: 16 }}>
          {ROLE_LABEL[user.role] || ROLE_LABEL.user}
        </span>

        <button
          type="button"
          className="btn btn--ghost btn--block"
          style={{ marginTop: 28 }}
          onClick={onGoToSettings}
        >
          Modifier mes paramètres
        </button>
      </div>
    </div>
  );
}
