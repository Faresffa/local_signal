// apps/web/src/pages/Restaurateur.jsx
//
// Tableau de bord restaurateur (D-055 v2). Un compte restaurateur est créé
// directement comme tel, avec sa demande jointe (SignupRestaurateur.jsx) —
// il n'existe plus de chemin où un compte client « devient » restaurateur
// depuis cette page. Elle ne fait donc plus que refléter l'état de LA
// demande créée à l'inscription : en attente, refusée, ou validée (et alors
// le tableau de bord).
//
// PAS DE MENU MODIFIABLE ICI (délibéré). Seuls les champs de contact
// (téléphone, réservation, horaires) sont éditables par le restaurateur — un
// menu auto-déclaré contredirait D-014 (le modèle observe, il ne juge pas ;
// laisser la fiche s'auto-décrire romprait la même garantie pour un humain).
// Cette limite reste à rouvrir explicitement, pas à contourner ici.

import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Camera, ChartLineUp, Clock, ForkKnife, Link as LinkIcon, MapPin, Phone, Storefront,
} from "@phosphor-icons/react";

import {
  deposerPhotoRestaurant, envoyerCarte, fetchCartes, fetchMonRestaurant, fetchStatutRestaurateur,
  modifierMonRestaurant,
} from "../api";
import DashboardRestaurateur from "../components/DashboardRestaurateur";
import PhotoRestaurant from "../components/PhotoRestaurant";
import { ErrorState, ResultsSkeleton } from "../components/States";

const MO = 1024 * 1024;
const TAILLE_MAX = 10 * MO;
const TYPES_PHOTO = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];

const STATUT_LABEL = {
  en_attente: "En attente de validation",
  valide: "Validée",
  refuse: "Refusée",
};

/** Champs de contact, seuls modifiables par le restaurateur (D-014). */
function ContactEdit({ restaurant, onSauve }) {
  const [telephone, setTelephone] = useState(restaurant.phone || "");
  const [reservation, setReservation] = useState(restaurant.reservation_url || "");
  const [horaires, setHoraires] = useState(restaurant.opening_hours || "");
  const [statut, setStatut] = useState("idle");
  const [erreur, setErreur] = useState(null);

  const modifie = telephone !== (restaurant.phone || "")
    || reservation !== (restaurant.reservation_url || "")
    || horaires !== (restaurant.opening_hours || "");

  async function sauvegarder() {
    setStatut("sending");
    setErreur(null);
    try {
      const maj = await modifierMonRestaurant({
        phone: telephone, reservation_url: reservation, opening_hours: horaires,
      });
      onSauve(maj);
      setStatut("idle");
    } catch (e) {
      setErreur(e.message);
      setStatut("idle");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <div className="formfield">
        <label htmlFor="restaurateur-c-tel">Téléphone</label>
        <input id="restaurateur-c-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
      </div>
      <div className="formfield">
        <label htmlFor="restaurateur-c-resa">Lien de réservation</label>
        <input id="restaurateur-c-resa" value={reservation} onChange={(e) => setReservation(e.target.value)} placeholder="https://…" />
      </div>
      <div className="formfield">
        <label htmlFor="restaurateur-c-horaires">Horaires d'ouverture</label>
        <input id="restaurateur-c-horaires" value={horaires} onChange={(e) => setHoraires(e.target.value)} placeholder="Mo-Su 11:00-23:00" />
        <span className="formfield__hint">Syntaxe OpenStreetMap (jours abrégés, plages séparées par des virgules).</span>
      </div>
      {erreur && <p className="formfield__error">{erreur}</p>}
      <button type="button" className="btn btn--primary" disabled={!modifie || statut === "sending"} onClick={sauvegarder} style={{ justifySelf: "start" }}>
        {statut === "sending" ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}

/** Photo de vitrine, seule image que le restaurateur peut déposer (D-059). */
function PhotoEdit({ restaurant, onSauve }) {
  const champ = useRef(null);
  const [statut, setStatut] = useState("idle");
  const [erreur, setErreur] = useState(null);

  function choisir(fichier) {
    setErreur(null);
    if (!fichier) return;
    // Même contrôle que AjouterCarte.jsx : évite d'envoyer un fichier que
    // le serveur refuserait de toute façon, pas une mesure de sécurité.
    if (!TYPES_PHOTO.includes(fichier.type)) {
      setErreur("Format non accepté. Envoyez une photo JPEG, PNG, WebP ou HEIC.");
      return;
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur(`Photo trop lourde (${(fichier.size / MO).toFixed(1)} Mo, maximum 10 Mo).`);
      return;
    }
    envoyer(fichier);
  }

  async function envoyer(fichier) {
    setStatut("sending");
    setErreur(null);
    try {
      const maj = await deposerPhotoRestaurant(fichier);
      onSauve(maj);
      setStatut("idle");
    } catch (e) {
      setErreur(e.message);
      setStatut("idle");
    }
  }

  return (
    <div className="restaurateur__media">
      <div className="detail__media">
        <PhotoRestaurant
          id={restaurant.id}
          cuisine={restaurant.cuisine}
          photoUrl={restaurant.photo_url}
          photoKey={restaurant.photo_key}
          nom={restaurant.name}
          size={92}
        />
      </div>

      <input
        ref={champ}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => choisir(e.target.files?.[0])}
      />
      <button
        type="button"
        className="restaurateur__photoBtn"
        onClick={() => champ.current?.click()}
        disabled={statut === "sending"}
      >
        <Camera size={15} weight="bold" />
        {statut === "sending"
          ? "Envoi…"
          : restaurant.photo_key ? "Changer la photo" : "Ajouter une photo"}
      </button>

      {erreur && <p className="formfield__error" style={{ marginTop: 8 }}>{erreur}</p>}
    </div>
  );
}

const FACT_ICON = { display: "inline", verticalAlign: "-2px", marginRight: 6 };

/**
 * Photo de la carte (D-068). Le restaurateur envoie la photo de SA carte ; elle
 * passe par la même lecture que les cartes envoyées par les voyageurs : le
 * modèle de vision OBSERVE (plats, langues, prix), le score est calculé par
 * du code (D-014). Ce n'est donc pas un menu auto-déclaré.
 *
 * GRATUIT POUR TOUS, VOLONTAIREMENT : la carte alimente le score. La réserver
 * aux abonnés donnerait un meilleur accès au score à ceux qui paient — c'est
 * exactement ce que la règle de neutralité interdit (D-067).
 *
 * L'image rejoint le corpus interne, jamais republié (D-038).
 */
function MaCarte({ restaurantId, menu }) {
  const [cartes, setCartes] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const champ = useRef(null);

  function charger() {
    fetchCartes(restaurantId).then(setCartes).catch(() => setCartes({ nombre: 0, cartes: [] }));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function envoyer(fichier) {
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX) {
      setErreur("Image trop lourde (10 Mo maximum).");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await envoyerCarte(restaurantId, fichier);
      setResultat(r);
      charger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  }

  const plats = menu?.dishes?.length ?? menu?.observations?.dishes?.length;

  return (
    <div>
      <p className="card__reason">
        Envoyez une photo de votre carte, lisible, en entier. Elle est lue
        automatiquement : plats, langues et prix. Gratuit pour tous les
        restaurants.
      </p>
      {menu && (
        <p className="card__reason" style={{ marginTop: 8 }}>
          Dernière carte lue{plats ? ` : ${plats} plats relevés` : ""}.
        </p>
      )}
      <input
        ref={champ}
        type="file"
        accept={TYPES_PHOTO.join(",")}
        style={{ display: "none" }}
        onChange={(e) => envoyer(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn btn--primary"
        style={{ marginTop: 12 }}
        disabled={envoi}
        onClick={() => champ.current?.click()}
      >
        <BookOpen size={15} weight="bold" />
        {envoi ? "Lecture de la carte…" : "Ajouter la photo de ma carte"}
      </button>

      {resultat && (
        <p className="card__reason" style={{ marginTop: 10 }}>
          {resultat.analysee
            ? resultat.analyse?.readable === false
              ? "Carte reçue, mais difficile à lire : essayez une photo plus nette, prise de face."
              : "Carte reçue et lue. Le score sera mis à jour au prochain recalcul."
            : "Carte reçue et conservée. La lecture automatique n'a pas pu se faire tout de suite : elle sera refaite plus tard."}
        </p>
      )}
      {erreur && <p className="formfield__error" style={{ marginTop: 8 }}>{erreur}</p>}

      {cartes && cartes.nombre > 0 && (
        <table className="dash__table" style={{ marginTop: 14 }}>
          <thead><tr><th>Carte envoyée le</th><th>Lecture</th></tr></thead>
          <tbody>
            {cartes.cartes.slice(0, 5).map((c) => (
              <tr key={c.id}>
                <td>{new Date(String(c.soumise_le).replace(" ", "T")).toLocaleDateString("fr-FR")}</td>
                <td>{c.lue ? "Lue" : "En attente"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MaFiche({ restaurantId }) {
  const [restaurant, setRestaurant] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    fetchMonRestaurant()
      .then((d) => { if (!annule) setRestaurant(d); })
      .catch((e) => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [restaurantId]);

  if (erreur) return <ErrorState message={erreur} onRetry={() => {}} />;
  if (!restaurant) return <ResultsSkeleton count={1} />;

  const puce = { size: 14, weight: "light", style: FACT_ICON };

  // TOUS LES DÉTAILS, PAS SEULEMENT CEUX QUI SE MODIFIENT (retour
  // utilisateur explicite) — l'adresse et la cuisine viennent de la
  // demande d'origine et ne sont pas éditables ici (D-014), mais un
  // restaurateur doit voir sa fiche telle qu'un client la voit, en entier,
  // pas seulement le formulaire de ce qu'il peut changer.
  const facts = [
    restaurant.address && { icon: <MapPin {...puce} />, label: "Adresse", value: restaurant.address },
    restaurant.opening_hours && { icon: <Clock {...puce} />, label: "Horaires", value: restaurant.opening_hours },
    restaurant.phone && { icon: <Phone {...puce} />, label: "Téléphone", value: restaurant.phone },
    restaurant.reservation_url && {
      icon: <LinkIcon {...puce} />, label: "Réservation", value: restaurant.reservation_url,
    },
  ].filter(Boolean);

  return (
    <div>
      <div className="detail">
        <PhotoEdit restaurant={restaurant} onSauve={setRestaurant} />

        <div>
          <h1 className="detail__title">{restaurant.name}</h1>
          <p className="detail__meta">
            <ForkKnife size={15} weight="light" style={FACT_ICON} />
            {restaurant.cuisine_label || "Restaurant"}
          </p>

          {facts.length > 0 && (
            <div className="factlist">
              {facts.map(({ icon, label, value }) => (
                <div className="fact" key={label}>
                  <span className="fact__label">{icon}{label}</span>
                  <span className="fact__value">
                    {label === "Réservation" ? (
                      <a href={value} target="_blank" rel="noreferrer noopener">
                        {value.replace(/^https?:\/\//, "")}
                      </a>
                    ) : value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="calcul" style={{ marginTop: 16 }}>
        <div className="calcul__corps" style={{ display: "block" }}>
          <h2 className="why__title" style={{ marginBottom: 12 }}>
            <BookOpen size={16} weight="bold" style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Ma carte
          </h2>
          <MaCarte restaurantId={restaurant.id} menu={restaurant.menu} />
        </div>
      </section>

      <section className="calcul" style={{ marginTop: 16 }}>
        <div className="calcul__corps" style={{ display: "block" }}>
          <h2 className="why__title" style={{ marginBottom: 12 }}>Modifier les coordonnées</h2>
          <ContactEdit restaurant={restaurant} onSauve={setRestaurant} />
        </div>
      </section>
    </div>
  );
}

/**
 * Espace d'une fiche validée (D-068) : deux onglets. Le tableau de bord
 * d'abord — c'est ce qu'un restaurateur ouvre chaque jour — puis la fiche.
 * L'abonnement a sa propre page (AbonnementRestaurateur.jsx).
 */
function Espace({ restaurantId, onGoToAbonnement }) {
  const [onglet, setOnglet] = useState("dashboard");
  return (
    <div>
      <div className="dash__onglets" role="tablist">
        <button
          type="button" role="tab" aria-selected={onglet === "dashboard"}
          className={`dash__onglet${onglet === "dashboard" ? " is-actif" : ""}`}
          onClick={() => setOnglet("dashboard")}
        >
          <ChartLineUp size={16} weight="bold" /> Tableau de bord
        </button>
        <button
          type="button" role="tab" aria-selected={onglet === "fiche"}
          className={`dash__onglet${onglet === "fiche" ? " is-actif" : ""}`}
          onClick={() => setOnglet("fiche")}
        >
          <Storefront size={16} weight="bold" /> Ma fiche
        </button>
      </div>
      {onglet === "dashboard"
        ? <DashboardRestaurateur onGoToAbonnement={onGoToAbonnement} />
        : <MaFiche restaurantId={restaurantId} />}
    </div>
  );
}

export default function Restaurateur({ onSeConnecter, onGoToAbonnement }) {
  const [statut, setStatut] = useState("loading");
  const [claim, setClaim] = useState(null);

  function charger() {
    setStatut("loading");
    fetchStatutRestaurateur()
      .then((d) => { setClaim(d.claim); setStatut("ready"); })
      .catch(() => setStatut("error"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
  }, []);

  if (statut === "loading") return <ResultsSkeleton count={1} />;
  if (statut === "error") {
    return <ErrorState message="Impossible de charger votre espace restaurateur." onRetry={charger} />;
  }

  // Ne devrait pas arriver — un compte restaurateur a toujours une demande,
  // créée dans le même geste que le compte (SignupRestaurateur.jsx). Filet
  // de sécurité plutôt qu'un formulaire dupliqué : si ça arrive, c'est une
  // anomalie à signaler, pas un parcours normal à outiller.
  if (!claim) {
    return (
      <div className="state">
        <Storefront size={40} weight="light" className="state__icon" />
        <h2 className="state__title">Aucune demande trouvée</h2>
        <p className="state__text">
          Contactez-nous à{" "}
          <a href="mailto:fareshafianepro@gmail.com">fareshafianepro@gmail.com</a>{" "}
          pour régulariser votre compte.
        </p>
        <button className="btn btn--ghost" onClick={onSeConnecter}>Se connecter</button>
      </div>
    );
  }

  if (claim.status === "en_attente") {
    return (
      <div className="state">
        <Storefront size={40} weight="light" className="state__icon" />
        <h2 className="state__title">{STATUT_LABEL.en_attente}</h2>
        <p className="state__text">
          Votre demande {claim.proposed_name ? `pour « ${claim.proposed_name} » ` : ""}
          a bien été reçue. Une personne de l'équipe la valide à la main —
          revenez un peu plus tard.
        </p>
      </div>
    );
  }

  if (claim.status === "refuse") {
    return (
      <div className="state">
        <Storefront size={40} weight="light" className="state__icon" />
        <h2 className="state__title">{STATUT_LABEL.refuse}</h2>
        <p className="state__text">
          Votre demande n'a pas été validée. Pour en savoir plus ou déposer
          une nouvelle demande, contactez-nous à{" "}
          <a href="mailto:fareshafianepro@gmail.com">fareshafianepro@gmail.com</a>.
        </p>
      </div>
    );
  }

  return <Espace restaurantId={claim.restaurant_id} onGoToAbonnement={onGoToAbonnement} />;
}
