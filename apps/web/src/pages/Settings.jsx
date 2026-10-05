// apps/web/src/pages/Settings.jsx
//
// Paramètres du compte (LS-refonte, menu déroulant de Nav.jsx) : apparence,
// formule, données, mot de passe. Des blocs indépendants plutôt que des pages —
// aucun n'a assez de contenu pour justifier son propre écran.

import { useState } from "react";
import {
  ArrowLeft, CreditCard, DownloadSimple, Gear, Lock, Moon, Sun, Trash,
} from "@phosphor-icons/react";

import { changerMotDePasse, fetchMesDonnees } from "../api";
import { useTheme } from "../lib/hooks";

export default function Settings({
  user, onBack, onGoToEspacePro, onDeleteAccount,
}) {
  const { isDark, toggle } = useTheme();

  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [erreurMdp, setErreurMdp] = useState(null);
  const [statutMdp, setStatutMdp] = useState("idle");
  const [statutExport, setStatutExport] = useState("idle");
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [statutSuppression, setStatutSuppression] = useState("idle");
  const [erreurSuppression, setErreurSuppression] = useState(null);

  async function telechargerDonnees() {
    setStatutExport("sending");
    try {
      const donnees = await fetchMesDonnees();
      // Téléchargement côté navigateur, sans passer par le serveur une
      // deuxième fois : l'URL objet pointe directement sur le JSON déjà reçu.
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "local-signal-mes-donnees.json";
      lien.click();
      URL.revokeObjectURL(url);
    } finally {
      setStatutExport("idle");
    }
  }

  async function confirmerEtSupprimer() {
    setErreurSuppression(null);
    setStatutSuppression("sending");
    try {
      await onDeleteAccount();
      // Pas de `finally` ici : en cas de succès, ce composant est démonté
      // dans la foulée (retour à l'accueil) — remettre `statutSuppression`
      // à "idle" sur un composant qui n'existe plus déclencherait un
      // avertissement React pour rien.
    } catch (err) {
      setErreurSuppression(err.message);
      setStatutSuppression("idle");
    }
  }

  async function soumettreMdp(event) {
    event.preventDefault();
    setErreurMdp(null);
    // Même seuil que côté serveur (backend/main.py::changer_mot_de_passe).
    if (nouveau.length < 8) {
      setErreurMdp("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setStatutMdp("sending");
    try {
      await changerMotDePasse(actuel, nouveau);
      setActuel("");
      setNouveau("");
      setStatutMdp("done");
    } catch (err) {
      setErreurMdp(err.message);
      setStatutMdp("idle");
    }
  }

  const estPro = user.role === "restaurateur" || user.role === "hotel";

  return (
    <div className="authpage">
      <div className="authcard enter" style={{ "--enter-delay": "0ms", maxWidth: 480 }}>
        <button className="linkbtn" onClick={onBack} style={{ marginBottom: 16 }}>
          <ArrowLeft size={15} weight="bold" />
          Retour
        </button>

        <div className="authcard__mark" aria-hidden="true">
          <Gear size={20} weight="fill" />
        </div>
        <h1 className="authcard__title">Paramètres</h1>

        <section style={{ marginTop: 28 }}>
          <h2 className="settings__section">Apparence</h2>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={toggle}
            style={{ marginTop: 8 }}
          >
            {isDark ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
            {isDark ? "Passer en thème clair" : "Passer en thème sombre"}
          </button>
        </section>

        {/* FORMULE (D-067) : le voyageur ne paie rien. Seuls les comptes
            pro ont une offre, gérée depuis leur espace. */}
        {user.role !== "admin" && (
          <section style={{ marginTop: 28 }}>
            <h2 className="settings__section">Formule</h2>
            {estPro ? (
              <>
                <p className="card__reason" style={{ marginTop: 8 }}>
                  Votre offre (essai, souscription, résiliation) se gère depuis
                  votre espace professionnel.
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  style={{ marginTop: 8 }}
                  onClick={onGoToEspacePro}
                >
                  <CreditCard size={16} weight="bold" />
                  Gérer mon offre
                </button>
              </>
            ) : (
              <p className="card__reason" style={{ marginTop: 8 }}>
                Compte voyageur gratuit : toutes les fonctionnalités sont
                incluses, sans abonnement.
              </p>
            )}
          </section>
        )}

        {/* Droits RGPD (LS-29, LS-39) : accès/portabilité et effacement.
            L'API les exposait déjà (backend/main.py) sans qu'aucune
            interface ne les relie — un droit qu'on ne peut exercer qu'en
            ligne de commande n'est pas vraiment exerçable. */}
        <section style={{ marginTop: 28 }}>
          <h2 className="settings__section">Vos données</h2>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={telechargerDonnees}
            disabled={statutExport === "sending"}
            style={{ marginTop: 8 }}
          >
            <DownloadSimple size={16} weight="bold" />
            {statutExport === "sending" ? "Préparation…" : "Télécharger mes données"}
          </button>
          <p className="formfield__hint" style={{ marginTop: 6 }}>
            Compte, sessions, réservations et avis laissés par le passé — au format JSON,
            pour les consulter ou les transporter ailleurs.
          </p>

          {!confirmerSuppression ? (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => setConfirmerSuppression(true)}
              style={{ marginTop: 12 }}
            >
              <Trash size={16} weight="bold" />
              Supprimer mon compte
            </button>
          ) : (
            <div className="settings__facturation" style={{ marginTop: 12 }}>
              <p className="formfield__error" role="alert" style={{ marginBottom: 10 }}>
                Suppression définitive et immédiate : compte, avis, réservations.
                Impossible à annuler.
              </p>
              {erreurSuppression && (
                <p className="formfield__error" role="alert">{erreurSuppression}</p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmerSuppression(false)}
                  disabled={statutSuppression === "sending"}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  onClick={confirmerEtSupprimer}
                  disabled={statutSuppression === "sending"}
                >
                  {statutSuppression === "sending" ? "Suppression…" : "Oui, supprimer"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 className="settings__section">Mot de passe</h2>
          <form className="form" onSubmit={soumettreMdp} style={{ marginTop: 8 }}>
            <div className="formfield">
              <label htmlFor="settings-mdp-actuel">Mot de passe actuel</label>
              <input
                id="settings-mdp-actuel"
                type="password"
                value={actuel}
                onChange={(e) => setActuel(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="formfield">
              <label htmlFor="settings-mdp-nouveau">Nouveau mot de passe</label>
              <input
                id="settings-mdp-nouveau"
                type="password"
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                autoComplete="new-password"
              />
              <span className="formfield__hint">8 caractères minimum.</span>
            </div>

            {erreurMdp && <p className="formfield__error" role="alert">{erreurMdp}</p>}
            {statutMdp === "done" && (
              <p className="card__reason">Mot de passe modifié.</p>
            )}

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={statutMdp === "sending"}
            >
              <Lock size={16} weight="bold" />
              {statutMdp === "sending" ? "Enregistrement…" : "Changer mon mot de passe"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
