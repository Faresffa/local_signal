// apps/web/src/pages/Admin.jsx
//
// Vue d'ensemble réservée aux comptes admin (LS-refonte).
//
// LECTURE SEULE POUR L'INSTANT. La modification et l'ajout de menu, demandés
// dans la même respiration, viennent juste après — volontairement pas dans
// le même geste : deviner la forme d'un formulaire d'édition sans savoir
// quels champs comptent vraiment aurait produit quelque chose à refaire.
//
// MÊME CARTE QUE LA RECHERCHE. `RestaurantCard` est réutilisé tel quel : la
// liste admin n'invente pas un second langage visuel, elle regarde juste
// toute la base plutôt qu'un rayon autour d'un point (donc pas de distance,
// pas de tri par proximité — le classement reste celui du Local Signal).
//
// LA SÉCURITÉ RÉELLE EST CÔTÉ SERVEUR (`require_admin`). Ce que ce
// composant fait avant d'appeler l'API — vérifier `user?.role` — est de
// l'confort d'affichage, pas une barrière : un visiteur qui contournerait
// le front recevrait une 403 de toute façon.

import { useEffect, useState } from "react";
import {
  ArrowLeft, MagnifyingGlass, ShieldWarning,
} from "@phosphor-icons/react";

import { fetchAdminRestaurant, fetchAdminRestaurants } from "../api";
import RestaurantCard from "../components/RestaurantCard";
import DetailCalcul from "../components/DetailCalcul";
import PhotoRestaurant from "../components/PhotoRestaurant";
import { ErrorState, ResultsSkeleton } from "../components/States";
import { distance, hours, verdict } from "../lib/display";

const PAGE = 24;

/** Dump lisible d'un champ brut, sans en cacher la valeur — c'est le but. */
function rendreValeur(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

// Champs déjà montrés ailleurs sur la fiche (nom, photo, adresse, cuisine…) :
// inutile de les répéter dans le dump brut, qui sert à voir ce qui NE l'est
// pas déjà.
const CHAMPS_MASQUES = new Set([
  "id", "name", "lat", "lng", "cuisine", "address", "phone", "website",
  "opening_hours", "price", "local_signal", "confidence", "signals",
  "scoring", "cuisine_label", "ouvert_maintenant", "menu", "detail_calcul",
  "cartes", "photo_url", "menu_photo_urls", "label_notes",
]);

function FicheAdmin({ id, onBack }) {
  const [resto, setResto] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    setResto(null);
    setErreur(null);
    fetchAdminRestaurant(id)
      .then((d) => { if (!annule) setResto(d); })
      .catch((e) => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [id]);

  if (erreur) return <ErrorState message={erreur} onRetry={onBack} />;
  if (!resto) return <ResultsSkeleton count={1} />;

  const v = verdict(resto.local_signal, resto.confidence);
  const dist = distance(resto.distance_m);
  const horaires = hours(resto.opening_hours);
  const menu = resto.menu;

  const champsBruts = Object.entries(resto).filter(
    ([cle, val]) => !CHAMPS_MASQUES.has(cle) && val !== null && val !== "",
  );

  return (
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour à la liste
      </button>

      <div className="detail">
        <div className="detail__media">
          <PhotoRestaurant
            id={resto.id}
            cuisine={resto.cuisine}
            photoUrl={resto.photo_url}
            nom={resto.name}
            size={92}
          />
        </div>

        <div>
          <span className={`verdict verdict--${v.tone}`}>{v.label}</span>
          <h1 className="detail__title" style={{ marginTop: 12 }}>{resto.name}</h1>
          <p className="detail__meta">
            {resto.cuisine_label || "Restaurant"}
            {resto.price != null && ` · ${resto.price} €`}
            {dist && ` · à ${dist}`}
          </p>

          <div className="factlist">
            {resto.address && (
              <div className="fact">
                <span className="fact__label">Adresse</span>
                <span className="fact__value">{resto.address}</span>
              </div>
            )}
            {horaires && (
              <div className="fact">
                <span className="fact__label">Horaires</span>
                <span className="fact__value">{horaires}</span>
              </div>
            )}
            {resto.phone && (
              <div className="fact">
                <span className="fact__label">Téléphone</span>
                <span className="fact__value">{resto.phone}</span>
              </div>
            )}
            {resto.website && (
              <div className="fact">
                <span className="fact__label">Site</span>
                <span className="fact__value">{resto.website}</span>
              </div>
            )}
          </div>

          <DetailCalcul detail={resto.detail_calcul} initialementOuvert />

          {/* --- Menu lu --- */}
          <section className="why" style={{ marginTop: 16 }}>
            <h2 className="why__title">Carte (dernière lecture)</h2>
            {menu ? (
              <>
                <p className="card__reason">
                  Score menu {menu.menu_score?.toFixed(3)} · lue le{" "}
                  {new Date(menu.scanned_at).toLocaleDateString("fr-FR")} ·
                  fournisseur {menu.provider}
                </p>
                {menu.observations?.notes && (
                  <p className="card__reason" style={{ marginTop: 8 }}>
                    {menu.observations.notes}
                  </p>
                )}
                {menu.ocr_text && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="linkbtn">Texte brut relevé (OCR)</summary>
                    <p className="card__reason" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                      {menu.ocr_text}
                    </p>
                  </details>
                )}
              </>
            ) : (
              <p className="card__reason">Aucune carte lue pour ce restaurant.</p>
            )}
          </section>

          {/* --- Cartes soumises --- */}
          {resto.cartes?.length > 0 && (
            <section className="why" style={{ marginTop: 16 }}>
              <h2 className="why__title">
                Cartes soumises ({resto.cartes.length})
              </h2>
              <ul className="why__list">
                {resto.cartes.map((c) => (
                  <li key={c.id}>
                    {new Date(c.submitted_at).toLocaleDateString("fr-FR")} —{" "}
                    {c.menu_id ? "lue" : "en attente de lecture"}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- Tous les autres champs bruts de la base --- */}
          <section className="why" style={{ marginTop: 16 }}>
            <h2 className="why__title">Autres champs en base</h2>
            <dl className="calcul__obs">
              {champsBruts.map(([cle, val]) => (
                <div key={cle} style={{ display: "contents" }}>
                  <dt>{cle}</dt>
                  <dd>{rendreValeur(val)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

export default function Admin({ user, onBack }) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ficheId, setFicheId] = useState(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let annule = false;
    setData(null);
    fetchAdminRestaurants({ limit: PAGE, offset, q: q.trim() || undefined })
      .then((d) => { if (!annule) setData(d); })
      .catch((e) => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [user, offset, q]);

  // Garde d'affichage — la vraie barrière est `require_admin` côté API.
  if (user?.role !== "admin") {
    return (
      <div className="state">
        <ShieldWarning size={40} weight="light" className="state__icon" />
        <h2 className="state__title">Réservé aux administrateurs</h2>
        <p className="state__text">Ce compte n'a pas les droits nécessaires.</p>
        <button className="btn btn--ghost" onClick={onBack}>Retour</button>
      </div>
    );
  }

  if (ficheId) {
    return <FicheAdmin id={ficheId} onBack={() => setFicheId(null)} />;
  }

  return (
    <>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">Tous les restaurants</h1>
      <p className="detail__meta" style={{ marginBottom: 20 }}>
        {data ? `${data.total} restaurants en base` : "Chargement…"}
      </p>

      <div className="field" style={{ maxWidth: 360, marginBottom: 20 }}>
        <label className="field__label" htmlFor="admin-q">Chercher par nom</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MagnifyingGlass size={16} />
          <input
            id="admin-q"
            className="field__control"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOffset(0); }}
            placeholder="Le nom d'un restaurant"
          />
        </div>
      </div>

      {erreur && <ErrorState message={erreur} onRetry={() => setOffset((o) => o)} />}
      {!erreur && !data && <ResultsSkeleton />}
      {!erreur && data && data.restaurants.length === 0 && (
        <p className="card__reason">Aucun restaurant ne correspond.</p>
      )}
      {!erreur && data && data.restaurants.length > 0 && (
        <>
          <div className="grid">
            {data.restaurants.map((r, i) => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                index={i}
                onOpen={(rest) => setFicheId(rest.id)}
              />
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <button
              className="btn btn--ghost"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            >
              Précédent
            </button>
            <span className="results__count">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} sur {data.total}
            </span>
            <button
              className="btn btn--ghost"
              disabled={offset + PAGE >= data.total}
              onClick={() => setOffset((o) => o + PAGE)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </>
  );
}
