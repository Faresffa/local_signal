// apps/web/src/pages/Signup.jsx
//
// Formulaire d'inscription. Mêmes conventions que Reserve.jsx et Login.jsx.

import { useState } from "react";
import { ArrowLeft, ForkKnife } from "@phosphor-icons/react";

import { API_BASE } from "../api";
import GoogleG from "../components/GoogleG";

export default function Signup({ onSignup, onGoToLogin, onBack }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  function valider() {
    const e = {};
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    // Même seuil que côté serveur : autant prévenir l'utilisateur avant l'envoi.
    if (password.length < 8) e.password = "8 caractères minimum.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre(event) {
    event.preventDefault();
    if (!valider()) return;

    setStatus("sending");
    try {
      await onSignup({ email: email.trim(), password, name: name.trim() || undefined });
    } catch (err) {
      setErrors({ global: err.message });
      setStatus("idle");
    }
  }

  return (
    <div className="authpage">
      <div className="authcard enter" style={{ "--enter-delay": "0ms" }}>
        <button className="linkbtn" onClick={onBack} style={{ marginBottom: 16 }}>
          <ArrowLeft size={15} weight="bold" />
          Retour
        </button>

        <div className="authcard__mark" aria-hidden="true">
          <ForkKnife size={20} weight="fill" />
        </div>

        <h1 className="authcard__title">Créer un compte</h1>
        <p className="authcard__lede">
          Laissez un avis, contribuez une carte, et retrouvez tout ça sur le
          site comme dans l'application — c'est le même compte.
        </p>

        <a
          className="btn btn--ghost btn--block authcard__google"
          href={`${API_BASE}/api/auth/google/login`}
          style={{ marginTop: 24 }}
        >
          <GoogleG />
          Continuer avec Google
        </a>

        <div className="authcard__separateur">
          <span>ou avec un mot de passe</span>
        </div>

        <form className="form" onSubmit={soumettre} noValidate>
          <div className="formfield">
            <label htmlFor="signup-name">Nom (facultatif)</label>
            <input
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="formfield">
            <label htmlFor="signup-email">Adresse électronique</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="formfield__error">{errors.email}</span>}
          </div>

          <div className="formfield">
            <label htmlFor="signup-password">Mot de passe</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
            />
            <span className="formfield__hint">8 caractères minimum.</span>
            {errors.password && <span className="formfield__error">{errors.password}</span>}
          </div>

          {errors.global && (
            <p className="formfield__error" role="alert">{errors.global}</p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Création en cours" : "Créer mon compte"}
          </button>

          <button type="button" className="linkbtn" onClick={onGoToLogin} style={{ marginTop: 4 }}>
            Déjà un compte ? Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
