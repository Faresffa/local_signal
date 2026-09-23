// apps/web/src/pages/Login.jsx
//
// Formulaire de connexion. Mêmes conventions que Reserve.jsx : étiquette
// au-dessus du champ, erreur en dessous, validation manuelle.

import { useState } from "react";
import { ArrowLeft, ForkKnife } from "@phosphor-icons/react";

import { API_BASE } from "../api";
import GoogleG from "../components/GoogleG";

export default function Login({ onLogin, onGoToSignup, onBack, erreurInitiale }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState(
    erreurInitiale ? { global: erreurInitiale } : {},
  );
  const [status, setStatus] = useState("idle");

  function valider() {
    const e = {};
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    if (!password) e.password = "Mot de passe requis.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre(event) {
    event.preventDefault();
    if (!valider()) return;

    setStatus("sending");
    try {
      await onLogin({ email: email.trim(), password });
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

        <h1 className="authcard__title">Se connecter</h1>
        <p className="authcard__lede">
          Retrouvez vos avis, vos cartes contribuées, et les restaurants que
          vous avez repérés.
        </p>

        {/* Vraie navigation de page, pas un `fetch` : Google doit rediriger
            le NAVIGATEUR vers son écran de consentement, un appel API ne
            peut pas faire ça. */}
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
            <label htmlFor="login-email">Adresse électronique</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="formfield__error">{errors.email}</span>}
          </div>

          <div className="formfield">
            <label htmlFor="login-password">Mot de passe</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
            />
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
            {status === "sending" ? "Connexion en cours" : "Se connecter"}
          </button>

          <button type="button" className="linkbtn" onClick={onGoToSignup} style={{ marginTop: 4 }}>
            Pas encore de compte ? Créer un compte
          </button>
        </form>
      </div>
    </div>
  );
}
