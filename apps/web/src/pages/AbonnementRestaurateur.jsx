// apps/web/src/pages/AbonnementRestaurateur.jsx
//
// Page « Mon abonnement » du restaurateur (D-068) — une page à elle seule,
// séparée du tableau de bord (retour utilisateur : « une page dédiée pour les
// abonnements, comme avant »).
//
// Elle montre l'offre en cours, compare ligne par ligne ce que chaque formule
// débloque dans le tableau de bord, et garde l'historique des souscriptions.
// Démonstration : rien n'est encaissé (voir backend/main.py, OFFRES PRO).

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, Scales, Sparkle } from "@phosphor-icons/react";

import {
  fetchAbonnement, fetchHistoriqueAbonnement, resilierOffre, souscrireOffre,
} from "../api";
import { ErrorState, ResultsSkeleton } from "../components/States";

const FORMULES = [
  { id: null, nom: "Fiche gratuite", prix: "0 €", periode: "pour toujours" },
  { id: "visibilite", nom: "Visibilité", prix: "29 €", periode: "HT / mois", vedette: true },
  { id: "visibilite_plus", nom: "Visibilité+", prix: "59 €", periode: "HT / mois" },
];

// [libellé, fiche gratuite, Visibilité, Visibilité+]
const LIGNES = [
  ["Fiche et score Local Signal, identiques pour tous", true, true, true],
  ["Rang dans le quartier et total des consultations", true, true, true],
  ["Demandes de table des voyageurs", true, true, true],
  ["Coordonnées, horaires, photo de devanture", true, true, true],
  ["Mention « Partenaire » sur la fiche et la carte", false, true, true],
  ["Courbe des consultations et évolution sur 30 jours", false, true, true],
  ["Heures de visite de votre fiche", false, true, true],
  ["Liste de vos clients (voyageurs qui vous ont consulté)", false, true, true],
  ["Encart « À découvrir dans le quartier », séparé du classement", false, false, true],
  ["Rapport mensuel, mois offert si l'objectif de vues n'est pas atteint", false, false, true],
];

const STATUT = { essai: "Essai gratuit", actif: "Active", resilie: "Résiliée" };
const NOM = { visibilite: "Visibilité", visibilite_plus: "Visibilité+", hotel: "Hôtel" };

function date(texte) {
  if (!texte) return "—";
  return new Date(String(texte).replace(" ", "T")).toLocaleDateString("fr-FR");
}

export default function AbonnementRestaurateur({ onBack }) {
  const [abonnement, setAbonnement] = useState(undefined);
  const [historique, setHistorique] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  function charger() {
    setErreur(null);
    Promise.all([fetchAbonnement(), fetchHistoriqueAbonnement()])
      .then(([a, h]) => { setAbonnement(a.abonnement); setHistorique(h.historique); })
      .catch((e) => setErreur(e.message));
  }
  useEffect(charger, []);

  async function choisir(offre) {
    setEnvoi(true);
    setErreur(null);
    try {
      if (offre) await souscrireOffre(offre);
      else await resilierOffre();
      charger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (erreur && abonnement === undefined) return <ErrorState message={erreur} onRetry={charger} />;
  if (abonnement === undefined) return <ResultsSkeleton count={1} />;

  const actuelle = abonnement?.offre ?? null;

  return (
    <div className="abo">
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 16 }}>
        <ArrowLeft size={15} weight="bold" /> Retour au tableau de bord
      </button>

      <h1 className="detail__title">
        <Sparkle size={24} weight="bold" style={{ verticalAlign: "-3px", marginRight: 8 }} />
        Mon abonnement
      </h1>

      <section className="abo__actuel">
        <div>
          <p className="abo__surtitre">Formule actuelle</p>
          <p className="abo__formule">{actuelle ? NOM[actuelle] : "Fiche gratuite"}</p>
          {abonnement && (
            <p className="card__reason">
              {abonnement.statut === "essai"
                ? `Mois d'essai gratuit jusqu'au ${date(abonnement.fin_essai)}, puis ${actuelle === "visibilite" ? "29" : "59"} € HT par mois.`
                : `Active depuis le ${date(abonnement.debut)}.`}
            </p>
          )}
          {!abonnement && (
            <p className="card__reason">
              Votre fiche et votre score sont gratuits. Le premier mois d'une offre est offert.
            </p>
          )}
        </div>
        {abonnement && (
          <button type="button" className="btn btn--ghost" disabled={envoi} onClick={() => choisir(null)}>
            Résilier
          </button>
        )}
      </section>

      <div className="pricing__neutralite" style={{ marginTop: 16 }}>
        <Scales size={20} weight="bold" />
        <p>
          <strong>Règle de neutralité.</strong> Aucune offre ne change votre
          score ni votre place dans le classement. Elles n'achètent que de la
          présentation, des statistiques et un encart à part, toujours étiqueté.
        </p>
      </div>

      <div className="abo__tableau">
        <table className="abo__comparatif">
          <thead>
            <tr>
              <th />
              {FORMULES.map((f) => (
                <th key={f.nom} className={f.vedette ? "is-vedette" : ""}>
                  <span className="abo__nom">{f.nom}</span>
                  <span className="abo__prix">{f.prix}<small> {f.periode}</small></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIGNES.map(([libelle, ...cases]) => (
              <tr key={libelle}>
                <td>{libelle}</td>
                {cases.map((ok, i) => (
                  <td key={i} className="abo__case">
                    {ok ? <Check size={16} weight="bold" className="pricing__coche" /> : <Minus size={16} className="dash__muted" />}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {FORMULES.map((f) => (
                <td key={f.nom} className="abo__case">
                  {f.id === actuelle ? (
                    <span className="dash__badge is-abonne">Formule actuelle</span>
                  ) : f.id === null ? null : (
                    <button
                      type="button"
                      className={`btn ${f.vedette ? "btn--primary" : "btn--ghost"}`}
                      disabled={envoi}
                      onClick={() => choisir(f.id)}
                    >
                      {abonnement ? "Passer à cette offre" : "Essayer un mois"}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {erreur && <p className="formfield__error" style={{ marginTop: 8 }}>{erreur}</p>}

      <h2 className="dash__titre" style={{ marginTop: 32 }}>Historique</h2>
      {historique.length === 0 ? (
        <p className="card__reason">Aucune souscription pour l'instant.</p>
      ) : (
        <table className="dash__table">
          <thead><tr><th>Offre</th><th>Statut</th><th>Début</th><th>Fin d'essai</th><th>Résiliée le</th></tr></thead>
          <tbody>
            {historique.map((h) => (
              <tr key={h.id}>
                <td>{NOM[h.offre] || h.offre}</td>
                <td>{STATUT[h.statut] || h.statut}</td>
                <td>{date(h.debut)}</td>
                <td>{date(h.fin_essai)}</td>
                <td>{date(h.resilie_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="formfield__hint" style={{ marginTop: 16 }}>
        Démonstration : aucun paiement n'est encaissé. Sans engagement, résiliable à tout moment.
      </p>
    </div>
  );
}
