// apps/web/src/pages/Signup.jsx
//
// Formulaire d'inscription. Mêmes conventions que Reserve.jsx et Login.jsx.

import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";

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
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Créer un compte</h1>

      <form className="form" onSubmit={soumettre} style={{ marginTop: 28 }} noValidate>
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

        <button type="button" className="linkbtn" onClick={onGoToLogin} style={{ marginTop: 12 }}>
          Déjà un compte ? Se connecter
        </button>
      </form>
    </>
  );
}
