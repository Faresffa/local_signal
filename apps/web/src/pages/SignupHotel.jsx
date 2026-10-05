// apps/web/src/pages/SignupHotel.jsx
//
// Inscription d'un hôtel ou d'une conciergerie (D-067). Un compte à part,
// comme le compte restaurateur (D-055 v2) : la fiche de l'hôtel est créée dans
// le même geste que le compte, jamais après.
//
// La POSITION est la seule donnée indispensable : c'est autour d'elle que la
// page « Où manger autour de l'hôtel » affichera le classement.

import { useState } from "react";
import { ArrowLeft, Bed } from "@phosphor-icons/react";

import LocationPicker from "../components/LocationPicker";

export default function SignupHotel({
  onSignup, onGoToLogin, onBack, onGoToCGU, onGoToConfidentialite,
}) {
  const [nomHotel, setNomHotel] = useState("");
  const [lieu, setLieu] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  function valider() {
    const e = {};
    if (!nomHotel.trim()) e.nomHotel = "Le nom de l'hôtel est requis.";
    if (!lieu) e.lieu = "Indiquez l'adresse de l'hôtel.";
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    if (password.length < 8) e.password = "8 caractères minimum.";
    if (!accepteConditions) e.conditions = "Vous devez accepter les CGU et la politique de confidentialité.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre(event) {
    event.preventDefault();
    if (!valider()) return;
    setStatus("sending");
    try {
      await onSignup({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        accepted_terms: accepteConditions,
        nom: nomHotel.trim(),
        adresse: lieu.label,
        lat: lieu.lat,
        lng: lieu.lng,
      });
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
          <Bed size={20} weight="fill" />
        </div>
        <h1 className="authcard__title">Créer un compte hôtel</h1>
        <p className="authcard__lede">
          Offrez à vos clients une page « Où manger autour de l'hôtel » à vos
          couleurs, avec un QR code à poser en chambre. 49 € HT par mois,
          premier mois offert.
        </p>

        <form className="form" onSubmit={soumettre} noValidate style={{ marginTop: 20 }}>
          <div className="formfield">
            <label htmlFor="signup-hotel-nom">Nom de l'hôtel ou de la conciergerie</label>
            <input
              id="signup-hotel-nom"
              value={nomHotel}
              onChange={(e) => setNomHotel(e.target.value)}
              aria-invalid={Boolean(errors.nomHotel)}
            />
            {errors.nomHotel && <span className="formfield__error">{errors.nomHotel}</span>}
          </div>

          <LocationPicker value={lieu} onChange={setLieu} onUseGps={() => {}} />
          {errors.lieu && <span className="formfield__error">{errors.lieu}</span>}

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          <div className="formfield">
            <label htmlFor="signup-hotel-name">Votre nom (facultatif)</label>
            <input
              id="signup-hotel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="formfield">
            <label htmlFor="signup-hotel-email">Adresse électronique</label>
            <input
              id="signup-hotel-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="formfield__error">{errors.email}</span>}
          </div>

          <div className="formfield">
            <label htmlFor="signup-hotel-password">Mot de passe</label>
            <input
              id="signup-hotel-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
            />
            <span className="formfield__hint">8 caractères minimum.</span>
            {errors.password && <span className="formfield__error">{errors.password}</span>}
          </div>

          <label className="signup__conditions">
            <input
              type="checkbox"
              checked={accepteConditions}
              onChange={(e) => setAccepteConditions(e.target.checked)}
              aria-invalid={Boolean(errors.conditions)}
            />
            <span>
              J'accepte les{" "}
              <button type="button" className="linkbtn" onClick={onGoToCGU}>
                conditions générales d'utilisation
              </button>{" "}
              et la{" "}
              <button type="button" className="linkbtn" onClick={onGoToConfidentialite}>
                politique de confidentialité
              </button>.
            </span>
          </label>
          {errors.conditions && <span className="formfield__error">{errors.conditions}</span>}

          {errors.global && <p className="formfield__error" role="alert">{errors.global}</p>}

          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Création en cours" : "Créer mon compte hôtel"}
          </button>

          <button type="button" className="linkbtn" onClick={onGoToLogin} style={{ marginTop: 4 }}>
            Déjà un compte ? Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
