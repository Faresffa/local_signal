// apps/web/src/pages/EspaceHotel.jsx
//
// Espace d'un hôtel partenaire (D-067) : son offre, sa page publique, son QR
// code, et combien de clients l'ont ouverte.
//
// L'HÔTEL NE CHOISIT PAS LES RESTAURANTS. Il personnalise l'emballage (nom,
// couleur, mot d'accueil) ; le contenu de la page est le classement Local
// Signal autour de l'hôtel, le même que pour n'importe quel voyageur.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Bed, DownloadSimple, LinkSimple, QrCode } from "@phosphor-icons/react";

import { fetchMonHotel, resilierOffre, souscrireOffre, updateMonHotel } from "../api";
import { ErrorState } from "../components/States";

function lienPageHotel(slug) {
  return `${window.location.origin}/hotel/${slug}`;
}

function libelleAbonnement(abonnement) {
  if (!abonnement) return "Aucune offre en cours : votre page n'est pas visible.";
  if (abonnement.statut === "essai") {
    const fin = abonnement.fin_essai ? new Date(abonnement.fin_essai).toLocaleDateString("fr-FR") : null;
    return `Mois d'essai gratuit${fin ? ` jusqu'au ${fin}` : ""}, puis 49 € HT par mois.`;
  }
  return "Offre hôtel active : 49 € HT par mois.";
}

export default function EspaceHotel({ onOuvrirPage }) {
  const [hotel, setHotel] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [qr, setQr] = useState(null);
  const [champs, setChamps] = useState({ nom: "", couleur: "#1a5c3e", message: "" });
  const [statut, setStatut] = useState("idle");
  const [copie, setCopie] = useState(false);

  function charger() {
    setErreur(null);
    fetchMonHotel()
      .then((h) => {
        setHotel(h);
        setChamps({ nom: h.nom || "", couleur: h.couleur || "#1a5c3e", message: h.message || "" });
      })
      .catch((e) => setErreur(e.message));
  }

  useEffect(charger, []);

  // Le QR code pointe vers la page publique ; il se génère dans le
  // navigateur, aucune image ne transite par le serveur.
  useEffect(() => {
    if (!hotel?.slug) return;
    QRCode.toDataURL(lienPageHotel(hotel.slug), { width: 480, margin: 2 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [hotel?.slug]);

  async function enregistrer(event) {
    event.preventDefault();
    setStatut("sending");
    try {
      const h = await updateMonHotel(champs);
      setHotel(h);
      setStatut("done");
    } catch (e) {
      setErreur(e.message);
      setStatut("idle");
    }
  }

  async function changerOffre(souscrire) {
    setStatut("sending");
    try {
      if (souscrire) await souscrireOffre("hotel");
      else await resilierOffre();
      charger();
    } finally {
      setStatut("idle");
    }
  }

  if (erreur && !hotel) return <ErrorState message={erreur} onRetry={charger} />;
  if (!hotel) return <p className="card__reason">Chargement…</p>;

  const lien = lienPageHotel(hotel.slug);
  const actif = Boolean(hotel.abonnement);

  return (
    <>
      <h1 className="detail__title">
        <Bed size={26} weight="bold" style={{ verticalAlign: "-3px", marginRight: 8 }} />
        {hotel.nom}
      </h1>
      <p className="detail__meta" style={{ marginBottom: 24 }}>{hotel.adresse}</p>

      <div className="pricing__grid" style={{ maxWidth: 900 }}>
        <section className="pricing__carte">
          <h2 className="pricing__nom">Votre offre</h2>
          <p className="card__reason">{libelleAbonnement(hotel.abonnement)}</p>
          {actif ? (
            <button
              className="btn btn--ghost btn--block"
              onClick={() => changerOffre(false)}
              disabled={statut === "sending"}
            >
              Résilier
            </button>
          ) : (
            <button
              className="btn btn--primary btn--block"
              onClick={() => changerOffre(true)}
              disabled={statut === "sending"}
            >
              Activer l'offre hôtel (premier mois offert)
            </button>
          )}
          <p className="formfield__hint">Démonstration : aucun paiement n'est encaissé.</p>
          <p className="card__reason" style={{ marginTop: 12 }}>
            <strong>{hotel.visites}</strong> ouverture{hotel.visites > 1 ? "s" : ""} de votre page
          </p>
        </section>

        <section className="pricing__carte">
          <h2 className="pricing__nom"><QrCode size={18} weight="bold" /> Votre QR code</h2>
          {qr && (
            <img
              src={qr}
              alt={`QR code vers la page de ${hotel.nom}`}
              style={{ width: 200, height: 200, alignSelf: "center", borderRadius: 8, background: "#fff" }}
            />
          )}
          {qr && (
            <a className="btn btn--ghost btn--block" href={qr} download={`qr-${hotel.slug}.png`}>
              <DownloadSimple size={16} weight="bold" />
              Télécharger pour impression
            </a>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => {
              navigator.clipboard?.writeText(lien);
              setCopie(true);
            }}
          >
            <LinkSimple size={16} weight="bold" />
            {copie ? "Lien copié" : "Copier le lien pour le livret d'accueil"}
          </button>
          {actif ? (
            <button type="button" className="linkbtn" onClick={() => onOuvrirPage(hotel.slug)}>
              Voir la page comme un client
            </button>
          ) : (
            <p className="formfield__hint">La page sera visible dès l'offre activée.</p>
          )}
        </section>
      </div>

      <form className="form pricing__carte" onSubmit={enregistrer} style={{ maxWidth: 560, marginTop: 24 }}>
        <h2 className="pricing__nom">Personnaliser la page</h2>
        <div className="formfield">
          <label htmlFor="hotel-nom">Nom affiché</label>
          <input
            id="hotel-nom"
            value={champs.nom}
            onChange={(e) => setChamps((c) => ({ ...c, nom: e.target.value }))}
          />
        </div>
        <div className="formfield">
          <label htmlFor="hotel-couleur">Couleur de l'hôtel</label>
          <input
            id="hotel-couleur"
            type="color"
            value={champs.couleur}
            onChange={(e) => setChamps((c) => ({ ...c, couleur: e.target.value }))}
          />
        </div>
        <div className="formfield">
          <label htmlFor="hotel-message">Mot d'accueil (facultatif)</label>
          <textarea
            id="hotel-message"
            rows={3}
            value={champs.message}
            onChange={(e) => setChamps((c) => ({ ...c, message: e.target.value }))}
            placeholder="Bienvenue ! Voici les adresses où mangent les habitants du quartier."
          />
        </div>
        {erreur && <p className="formfield__error" role="alert">{erreur}</p>}
        <button type="submit" className="btn btn--primary" disabled={statut === "sending"}>
          {statut === "done" ? "Enregistré" : "Enregistrer"}
        </button>
      </form>
    </>
  );
}
