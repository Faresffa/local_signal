// apps/web/src/components/DashboardRestaurateur.jsx
//
// Tableau de bord du restaurateur (D-068).
//
// GRATUIT / RÉSERVÉ, comme dans le mémoire (§4.3, tableau 27) :
// - pour toute fiche : score et rang dans le quartier, total des
//   consultations du mois, demandes de table ;
// - avec l'offre Visibilité : courbe des consultations, évolution, heures de
//   visite, et la liste des clients (voyageurs connectés qui ont consulté la
//   fiche).
// Un bloc réservé n'est pas caché : il est montré flouté, avec ce qu'il
// apporterait et le bouton d'essai. On vend ce qu'on montre.
//
// RAPPEL DE NEUTRALITÉ : rien ici ne permet d'agir sur le score ni le rang.

import { useEffect, useState } from "react";
import {
  CalendarCheck, ChartBar, Clock, Eye, Lock, Ranking, TrendDown, TrendUp, Users,
} from "@phosphor-icons/react";

import { fetchTableauDeBord } from "../api";
import { scoreSur10, verdict } from "../lib/display";
import { ErrorState, ResultsSkeleton } from "./States";

const NOM_OFFRE = { visibilite: "Visibilité", visibilite_plus: "Visibilité+" };

function Kpi({ icone, label, valeur, detail, verrouille }) {
  return (
    <div className={`dash__kpi${verrouille ? " is-verrouille" : ""}`}>
      <span className="dash__kpiLabel">{icone}{label}</span>
      <strong className="dash__kpiValeur">{verrouille ? "—" : valeur}</strong>
      {detail && <span className="dash__kpiDetail">{verrouille ? "Avec l'offre Visibilité" : detail}</span>}
    </div>
  );
}

/** Enveloppe d'un bloc réservé : contenu factice flouté + appel à l'essai. */
function Reserve({ actif, onEssai, titre, children }) {
  if (actif) return children;
  return (
    <div className="dash__reserve">
      <div className="dash__reserveFond" aria-hidden="true">{children}</div>
      <div className="dash__reserveVoile">
        <Lock size={22} weight="bold" />
        <p><strong>{titre}</strong></p>
        <p className="dash__reserveTexte">Inclus dans l'offre Visibilité (29 € HT / mois).</p>
        <button type="button" className="btn btn--primary" onClick={onEssai}>
          Essayer un mois gratuitement
        </button>
      </div>
    </div>
  );
}

function Barres({ valeurs, etiquettes, hauteur = 120 }) {
  const max = Math.max(1, ...valeurs);
  return (
    <div className="dash__barres" style={{ height: hauteur }}>
      {valeurs.map((v, i) => (
        <div key={i} className="dash__barreCol" title={`${etiquettes[i]} : ${v}`}>
          <div className="dash__barre" style={{ height: `${(v / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

// Données de démonstration pour les blocs verrouillés : on montre la forme
// de ce qu'on obtiendrait, jamais de vraies données d'un autre restaurant.
const SERIE_EXEMPLE = Array.from({ length: 30 }, (_, i) => 3 + ((i * 7) % 6) + (i % 7 === 5 ? 4 : 0));
const HEURES_EXEMPLE = Array.from({ length: 24 }, (_, h) => ([12, 13, 19, 20, 21].includes(h) ? 8 : h > 10 && h < 23 ? 2 : 0));
const CLIENTS_EXEMPLE = [
  { user_id: 1, name: "Léa B.", email: "lea@…", visites: 4, derniere_visite: null },
  { user_id: 2, name: "Thomas P.", email: "thomas@…", visites: 3, derniere_visite: null },
  { user_id: 3, name: "Yuki T.", email: "yuki@…", visites: 2, derniere_visite: null },
];

function dateCourte(texte) {
  if (!texte) return "—";
  const d = new Date(String(texte).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? texte : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function DashboardRestaurateur({ onGoToAbonnement }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  function charger() {
    setErreur(null);
    fetchTableauDeBord().then(setDonnees).catch((e) => setErreur(e.message));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
  }, []);

  if (erreur) return <ErrorState message={erreur} onRetry={charger} />;
  if (!donnees) return <ResultsSkeleton count={1} />;

  const { restaurant, rang, abonnement, consultations, reservations } = donnees;
  const stats = donnees.statistiques;
  const abonne = Boolean(abonnement);
  const v = verdict(restaurant.local_signal, restaurant.confidence);

  const evolution = stats && stats.consultations_precedentes > 0
    ? Math.round(((consultations - stats.consultations_precedentes) / stats.consultations_precedentes) * 100)
    : null;
  const serie = stats ? stats.serie.map((p) => p.n) : SERIE_EXEMPLE;
  const etiquettesSerie = stats ? stats.serie.map((p) => dateCourte(p.jour)) : SERIE_EXEMPLE.map((_, i) => `J${i + 1}`);
  const heures = stats ? stats.heures : HEURES_EXEMPLE;
  const clients = donnees.clients ?? CLIENTS_EXEMPLE;
  const heurePic = heures.indexOf(Math.max(...heures));

  return (
    <div className="dash">
      <div className="dash__entete">
        <div>
          <h1 className="detail__title" style={{ marginBottom: 4 }}>{restaurant.name}</h1>
          <p className="detail__meta">{restaurant.cuisine_label || "Restaurant"}</p>
        </div>
        <div className="dash__offre">
          <span className={`dash__badge${abonne ? " is-abonne" : ""}`}>
            {abonne ? `Offre ${NOM_OFFRE[abonnement.offre]}` : "Fiche gratuite"}
            {abonnement?.statut === "essai" ? " · essai" : ""}
          </span>
          <button type="button" className="btn btn--ghost" onClick={onGoToAbonnement}>
            {abonne ? "Gérer mon abonnement" : "Voir les offres"}
          </button>
        </div>
      </div>

      <div className="dash__kpis">
        <Kpi
          icone={<Ranking size={15} weight="bold" />}
          label="Local Signal"
          valeur={restaurant.local_signal != null ? `${scoreSur10(restaurant.local_signal)}/10` : "—"}
          detail={v.label}
        />
        <Kpi
          icone={<ChartBar size={15} weight="bold" />}
          label="Rang dans le quartier"
          valeur={rang ? `${rang.rang}e` : "—"}
          detail={rang ? `sur ${rang.total} restaurants` : null}
        />
        <Kpi
          icone={<Eye size={15} weight="bold" />}
          label={`Consultations (${donnees.periode_jours} j)`}
          valeur={consultations}
          detail="vues de votre fiche"
        />
        <Kpi
          icone={evolution != null && evolution < 0 ? <TrendDown size={15} weight="bold" /> : <TrendUp size={15} weight="bold" />}
          label="Évolution"
          valeur={evolution == null ? "nouveau" : `${evolution > 0 ? "+" : ""}${evolution} %`}
          detail="par rapport au mois précédent"
          verrouille={!abonne}
        />
        <Kpi
          icone={<CalendarCheck size={15} weight="bold" />}
          label="Demandes de table"
          valeur={reservations.length}
          detail="reçues via Local Signal"
        />
      </div>

      <section className="dash__bloc">
        <h2 className="dash__titre"><Eye size={16} weight="bold" /> Consultations par jour</h2>
        <Reserve actif={abonne} onEssai={onGoToAbonnement} titre="Courbe de fréquentation">
          <Barres valeurs={serie} etiquettes={etiquettesSerie} />
          <p className="dash__legende">30 derniers jours · survolez une barre pour le détail</p>
        </Reserve>
      </section>

      <div className="dash__duo">
        <section className="dash__bloc">
          <h2 className="dash__titre"><Clock size={16} weight="bold" /> Heures de visite</h2>
          <Reserve actif={abonne} onEssai={onGoToAbonnement} titre="Quand vos clients regardent votre fiche">
            <Barres valeurs={heures} etiquettes={heures.map((_, h) => `${h} h`)} hauteur={90} />
            <p className="dash__legende">
              De 0 h à 23 h{stats ? ` · pic vers ${heurePic} h` : ""}
            </p>
          </Reserve>
        </section>

        <section className="dash__bloc">
          <h2 className="dash__titre"><Users size={16} weight="bold" /> Vos clients</h2>
          <Reserve actif={abonne} onEssai={onGoToAbonnement} titre="Qui consulte votre restaurant">
            {clients.length === 0 ? (
              <p className="card__reason">Aucun voyageur connecté n'a encore consulté votre fiche.</p>
            ) : (
              <table className="dash__table">
                <thead><tr><th>Voyageur</th><th>Visites</th><th>Dernière</th></tr></thead>
                <tbody>
                  {clients.slice(0, 8).map((c) => (
                    <tr key={c.user_id}>
                      <td><strong>{c.name || "Voyageur"}</strong><br /><span className="dash__muted">{c.email}</span></td>
                      <td>{c.visites}</td>
                      <td>{dateCourte(c.derniere_visite)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Reserve>
        </section>
      </div>

      <section className="dash__bloc">
        <h2 className="dash__titre"><CalendarCheck size={16} weight="bold" /> Demandes de table</h2>
        {reservations.length === 0 ? (
          <p className="card__reason">Aucune demande pour l'instant. Elles arrivent ici quand un voyageur réserve depuis votre fiche.</p>
        ) : (
          <table className="dash__table">
            <thead><tr><th>Date</th><th>Heure</th><th>Personnes</th><th>Nom</th><th>Contact</th></tr></thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td>{dateCourte(r.date)}</td>
                  <td>{r.time_slot}</td>
                  <td>{r.num_persons}</td>
                  <td>{r.user_name}</td>
                  <td><a href={`mailto:${r.user_email}`}>{r.user_email}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="formfield__hint" style={{ marginTop: 16 }}>
        Votre score et votre rang ne dépendent ni de votre offre ni de votre
        fréquentation : ils mesurent l'ancrage local du restaurant.
      </p>
    </div>
  );
}
