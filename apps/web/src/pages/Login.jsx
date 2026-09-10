// apps/web/src/pages/Login.jsx
//
// Formulaire de connexion. Mêmes conventions que Reserve.jsx : étiquette
// au-dessus du champ, erreur en dessous, validation manuelle.

import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";

export default function Login({ onLogin, onGoToSignup, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
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
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Se connecter</h1>

      <form className="form" onSubmit={soumettre} style={{ marginTop: 28 }} noValidate>
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

        <button type="button" className="linkbtn" onClick={onGoToSignup} style={{ marginTop: 12 }}>
          Pas encore de compte ? Créer un compte
        </button>
      </form>
    </>
  );
}
