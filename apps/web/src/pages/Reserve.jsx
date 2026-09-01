// apps/web/src/pages/Reserve.jsx
//
// Formulaire de réservation.
//
// Étiquette au-dessus du champ, aide et erreur en dessous. Jamais de
// marque-place tenant lieu d'étiquette : il disparaît dès que l'utilisateur
// tape, et personne ne se souvient de ce qu'il demandait.

import { useState } from "react";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react";

import { createReservation } from "../api";

const CRENEAUX = ["12:00", "12:30", "13:00", "19:00", "19:30", "20:00", "20:30", "21:00"];

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reserve({ restaurant, onBack, onDone }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [personnes, setPersonnes] = useState(2);
  const [date, setDate] = useState(aujourdhui());
  const [creneau, setCreneau] = useState(null);

  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [confirmation, setConfirmation] = useState(null);

  function valider() {
    const e = {};
    if (!nom.trim()) e.nom = "Indiquez le nom de la réservation.";
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    if (!creneau) e.creneau = "Choisissez une heure.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre(event) {
    event.preventDefault();
    if (!valider()) return;

    setStatus("sending");
    try {
      const res = await createReservation({
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        user_name: nom.trim(),
        user_email: email.trim(),
        num_persons: personnes,
        date,
        time_slot: creneau,
      });
      setConfirmation(res);
      setStatus("done");
    } catch (err) {
      setErrors({ global: err.message });
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="state">
        <CheckCircle size={44} weight="light" style={{ color: "var(--color-local)" }} />
        <h1 className="state__title">Réservation confirmée</h1>
        <p className="state__text">
          {confirmation?.message || `Table réservée chez ${restaurant.name}.`}
        </p>
        <button className="btn btn--primary" onClick={onDone}>
          Retour aux restaurants
        </button>
      </div>
    );
  }

  return (
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour à la fiche
      </button>

      <h1 className="detail__title">Réserver</h1>
      <p className="detail__meta">{restaurant.name}</p>

      <form className="form" onSubmit={soumettre} style={{ marginTop: 28 }} noValidate>
        <div className="formfield">
          <label htmlFor="nom">Nom de la réservation</label>
          <input
            id="nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(errors.nom)}
          />
          {errors.nom && <span className="formfield__error">{errors.nom}</span>}
        </div>

        <div className="formfield">
          <label htmlFor="email">Adresse électronique</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
          />
          <span className="formfield__hint">
            Sert uniquement à vous envoyer la confirmation.
          </span>
          {errors.email && <span className="formfield__error">{errors.email}</span>}
        </div>

        <div className="formfield">
          <label htmlFor="personnes">Nombre de personnes</label>
          <select
            id="personnes"
            value={personnes}
            onChange={(e) => setPersonnes(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="formfield">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={date}
            min={aujourdhui()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <fieldset className="formfield" style={{ border: "none" }}>
          <legend
            style={{
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              marginBottom: 8,
            }}
          >
            Heure
          </legend>
          <div className="slots">
            {CRENEAUX.map((h) => (
              <button
                key={h}
                type="button"
                className="slot"
                aria-pressed={creneau === h}
                onClick={() => setCreneau(h)}
              >
                {h}
              </button>
            ))}
          </div>
          {errors.creneau && <span className="formfield__error">{errors.creneau}</span>}
        </fieldset>

        {errors.global && (
          <p className="formfield__error" role="alert">{errors.global}</p>
        )}

        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Envoi en cours" : "Confirmer la réservation"}
        </button>
      </form>
    </>
  );
}
