// apps/web/src/pages/SignupRestaurateur.jsx
//
// Inscription restaurateur (D-055 v2). COMPTE SÉPARÉ DU COMPTE CLIENT, dès
// la création — retour utilisateur explicite : « il faut séparer les deux
// comptes [...] un compte, quand il est créé, il est créé directement en
// tant que restaurateur », pas un compte client qui demande ensuite à le
// devenir. Ce formulaire fait donc les deux choses dans le même geste :
// créer le compte (role="restaurateur" dès l'INSERT, backend/main.py) ET
// déposer la demande de revendication ou de création de fiche — jamais
// l'un sans l'autre.
//
// La fiche visée reste inchangée tant qu'un admin n'a pas validé la
// demande (Admin.jsx, onglet « Demandes restaurateur ») : ce formulaire ne
// fait que la déposer, comme avant.

import { useEffect, useState } from "react";
import { ArrowLeft, MagnifyingGlass, Storefront } from "@phosphor-icons/react";

import { rechercherRestaurants } from "../api";
import LocationPicker from "../components/LocationPicker";

/** Recherche d'un restaurant par nom, mêmes conventions que ScanScreen (mobile). */
function RechercheRestaurant({ onChoisir }) {
  const [saisie, setSaisie] = useState("");
  const [resultats, setResultats] = useState([]);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const requete = saisie.trim();
    if (requete.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultats([]);
      return undefined;
    }
    let annule = false;
    setEnCours(true);
    const minuteur = setTimeout(() => {
      rechercherRestaurants(requete)
        .then((d) => { if (!annule) setResultats(d.restaurants ?? []); })
        .finally(() => { if (!annule) setEnCours(false); });
    }, 300);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  return (
    <div className="formfield">
      <label htmlFor="signup-resto-recherche">Nom du restaurant</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MagnifyingGlass size={16} />
        <input
          id="signup-resto-recherche"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Commencez à taper le nom…"
          autoComplete="off"
        />
      </div>

      {enCours && <p className="formfield__hint">Recherche…</p>}

      {resultats.length > 0 && (
        <ul className="why__list" style={{ marginTop: 10 }}>
          {resultats.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="linkbtn"
                onClick={() => { onChoisir(r); setSaisie(""); setResultats([]); }}
              >
                <strong>{r.name}</strong>
                {r.address && ` — ${r.address}`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!enCours && saisie.trim().length >= 2 && resultats.length === 0 && (
        <p className="formfield__hint">Aucun restaurant de ce nom en base — proposez-le ci-dessous.</p>
      )}
    </div>
  );
}

export default function SignupRestaurateur({ onSignup, onGoToLogin, onBack, onGoToCGU, onGoToConfidentialite }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepteConditions, setAccepteConditions] = useState(false);

  const [restaurantChoisi, setRestaurantChoisi] = useState(null);
  const [proposerNouveau, setProposerNouveau] = useState(false);
  const [nomResto, setNomResto] = useState("");
  const [lieu, setLieu] = useState(null);
  const [cuisine, setCuisine] = useState("");
  const [telephone, setTelephone] = useState("");
  const [message, setMessage] = useState("");

  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  const pretARevendiquer = !!restaurantChoisi;
  const pretAProposer = proposerNouveau && nomResto.trim() && lieu;
  const restaurantPret = pretARevendiquer || pretAProposer;

  function valider() {
    const e = {};
    if (!name.trim()) e.name = "Le nom d'utilisateur est requis.";
    if (!email.includes("@")) e.email = "Adresse électronique invalide.";
    if (password.length < 8) e.password = "8 caractères minimum.";
    if (!accepteConditions) e.conditions = "Vous devez accepter les CGU et la politique de confidentialité.";
    if (!restaurantPret) e.restaurant = "Choisissez votre restaurant, ou proposez-le s'il n'existe pas encore.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function soumettre(event) {
    event.preventDefault();
    if (!valider()) return;

    setStatus("sending");
    try {
      await onSignup({
        email: email.trim(), password, name: name.trim(), acceptedTerms: accepteConditions,
        restaurantId: restaurantChoisi?.id,
        proposedName: proposerNouveau ? nomResto.trim() : undefined,
        proposedAddress: proposerNouveau ? lieu?.label : undefined,
        proposedLat: proposerNouveau ? lieu?.lat : undefined,
        proposedLng: proposerNouveau ? lieu?.lng : undefined,
        proposedCuisine: proposerNouveau ? cuisine.trim() || undefined : undefined,
        proposedPhone: proposerNouveau ? telephone.trim() || undefined : undefined,
        message: message.trim() || undefined,
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
          <Storefront size={20} weight="fill" />
        </div>

        <h1 className="authcard__title">Créer un compte restaurateur</h1>
        <p className="authcard__lede">
          Un compte à part, pour gérer votre restaurant : coordonnées,
          fréquentation, offres de visibilité. La fiche est gratuite ;
          Visibilité (29 €) et Visibilité+ (59 €) sont facultatives.
        </p>

        <form className="form" onSubmit={soumettre} noValidate style={{ marginTop: 20 }}>
          <div className="formfield">
            <label htmlFor="signup-resto-name">Votre nom</label>
            <input
              id="signup-resto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="formfield__error">{errors.name}</span>}
          </div>

          <div className="formfield">
            <label htmlFor="signup-resto-email">Adresse électronique</label>
            <input
              id="signup-resto-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="formfield__error">{errors.email}</span>}
          </div>

          <div className="formfield">
            <label htmlFor="signup-resto-password">Mot de passe</label>
            <input
              id="signup-resto-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
            />
            <span className="formfield__hint">8 caractères minimum.</span>
            {errors.password && <span className="formfield__error">{errors.password}</span>}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />

          {!proposerNouveau && (
            <>
              {restaurantChoisi ? (
                <div className="fact">
                  <span className="fact__label">Restaurant choisi</span>
                  <span className="fact__value">
                    {restaurantChoisi.name}
                    {" "}
                    <button type="button" className="linkbtn" onClick={() => setRestaurantChoisi(null)}>
                      Changer
                    </button>
                  </span>
                </div>
              ) : (
                <RechercheRestaurant onChoisir={setRestaurantChoisi} />
              )}

              <button
                type="button"
                className="linkbtn"
                onClick={() => { setProposerNouveau(true); setRestaurantChoisi(null); }}
                style={{ justifySelf: "start" }}
              >
                Le restaurant n'existe pas encore dans notre base — le proposer
              </button>
            </>
          )}

          {proposerNouveau && (
            <>
              <div className="formfield">
                <label htmlFor="signup-resto-nom-propose">Nom du restaurant</label>
                <input id="signup-resto-nom-propose" value={nomResto} onChange={(e) => setNomResto(e.target.value)} />
              </div>

              <LocationPicker value={lieu} onChange={setLieu} onUseGps={() => {}} />

              <div className="formfield">
                <label htmlFor="signup-resto-cuisine">Type de cuisine</label>
                <input
                  id="signup-resto-cuisine"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  placeholder="italian, japanese…"
                />
              </div>

              <div className="formfield">
                <label htmlFor="signup-resto-tel">Téléphone</label>
                <input id="signup-resto-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
              </div>

              <button
                type="button"
                className="linkbtn"
                onClick={() => setProposerNouveau(false)}
                style={{ justifySelf: "start" }}
              >
                Revendiquer une fiche déjà existante à la place
              </button>
            </>
          )}

          {errors.restaurant && <span className="formfield__error">{errors.restaurant}</span>}

          <div className="formfield">
            <label htmlFor="signup-resto-message">Message pour l'équipe (facultatif)</label>
            <textarea
              id="signup-resto-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tout ce qui aide à vérifier que vous êtes bien ce restaurant."
            />
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

          {errors.global && (
            <p className="formfield__error" role="alert">{errors.global}</p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Création en cours" : "Créer mon compte restaurateur"}
          </button>

          <p className="formfield__hint">
            Une personne de l'équipe valide chaque demande à la main avant
            que l'accès ne s'ouvre.
          </p>

          <button type="button" className="linkbtn" onClick={onGoToLogin} style={{ marginTop: 4 }}>
            Déjà un compte restaurateur ? Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
