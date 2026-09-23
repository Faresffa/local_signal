// apps/web/src/pages/Admin.jsx
//
// Vue d'ensemble réservée aux comptes admin (LS-refonte).
//
// MÊME CARTE QUE LA RECHERCHE. `RestaurantCard` est réutilisé tel quel : la
// liste admin n'invente pas un second langage visuel, elle regarde juste
// toute la base plutôt qu'un rayon autour d'un point (donc pas de distance,
// pas de tri par proximité — le classement reste celui du Local Signal).
// Grille large (`.admin__grid`) plutôt que la colonne unique de Découvrir :
// ici on feuillette pour repérer un problème, pas pour lire un classement.
//
// LA SÉCURITÉ RÉELLE EST CÔTÉ SERVEUR (`require_admin`). Ce que ce
// composant fait avant d'appeler l'API — vérifier `user?.role` — est du
// confort d'affichage, pas une barrière : un visiteur qui contournerait le
// front recevrait une 403 de toute façon. Même règle pour l'édition
// (horaires, cuisine) et la modération d'avis : l'API revérifie le rôle à
// chaque appel (`require_admin`), le front ne fait que relayer.

import { useEffect, useState } from "react";
import {
  ArrowLeft, CaretDown, CaretRight, MagnifyingGlass, ShieldWarning, Trash,
} from "@phosphor-icons/react";

import {
  deleteAdminAvis, fetchAdminRestaurant, fetchAdminRestaurants, laisserAvis,
  updateAdminRestaurant,
} from "../api";
import RestaurantCard from "../components/RestaurantCard";
import DetailCalcul from "../components/DetailCalcul";
import CartePhotos from "../components/CartePhotos";
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

/** Un volet dépliant, même habillage que `DetailCalcul`/`CartePhotos`. */
function Depliant({ titre, badge, defautOuvert = false, children }) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  return (
    <section className="calcul" style={{ marginTop: 16 }}>
      <button className="calcul__bascule" onClick={() => setOuvert((o) => !o)}>
        {ouvert ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        {titre}
        {badge && <span className="calcul__badge">{badge}</span>}
      </button>
      {ouvert && <div className="calcul__corps">{children}</div>}
    </section>
  );
}

// Champs déjà montrés ailleurs sur la fiche (nom, photo, adresse, cuisine…) :
// inutile de les répéter dans le dump brut, qui sert à voir ce qui NE l'est
// pas déjà.
const CHAMPS_MASQUES = new Set([
  "id", "name", "lat", "lng", "cuisine", "address", "phone", "website",
  "opening_hours", "price", "local_signal", "confidence", "signals",
  "scoring", "cuisine_label", "ouvert_maintenant", "menu", "detail_calcul",
  "cartes", "avis", "photo_url", "menu_photo_urls", "label_notes",
]);

/** Section horaires + type de cuisine, en lecture ET en écriture. */
function InformationsEdit({ resto, onSauve }) {
  const [horaires, setHoraires] = useState(resto.opening_hours || "");
  const [cuisine, setCuisine] = useState(resto.cuisine || "");
  const [statut, setStatut] = useState("idle");
  const [erreur, setErreur] = useState(null);

  const modifie = horaires !== (resto.opening_hours || "") || cuisine !== (resto.cuisine || "");

  async function sauvegarder() {
    setStatut("sending");
    setErreur(null);
    try {
      const maj = await updateAdminRestaurant(resto.id, {
        opening_hours: horaires,
        cuisine,
      });
      onSauve(maj);
      setStatut("idle");
    } catch (e) {
      setErreur(e.message);
      setStatut("idle");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <div className="formfield">
        <label htmlFor="admin-horaires">Horaires d'ouverture</label>
        <input
          id="admin-horaires"
          value={horaires}
          onChange={(e) => setHoraires(e.target.value)}
          placeholder="Mo-Su 11:00-23:00"
        />
        <span className="formfield__hint">Syntaxe OpenStreetMap (jours abrégés, plages séparées par des virgules).</span>
      </div>

      <div className="formfield">
        <label htmlFor="admin-cuisine">Type(s) de cuisine</label>
        <input
          id="admin-cuisine"
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          placeholder="italian;pizza"
        />
        <span className="formfield__hint">Séparés par un point-virgule — même format que la collecte.</span>
      </div>

      {erreur && <p className="formfield__error">{erreur}</p>}

      <button
        type="button"
        className="btn btn--primary"
        disabled={!modifie || statut === "sending"}
        onClick={sauvegarder}
        style={{ justifySelf: "start" }}
      >
        {statut === "sending" ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}

/** Section avis : lecture, ajout (au nom du compte admin), suppression de n'importe lequel. */
function AvisAdmin({ restaurantId, avis, onChange }) {
  const [note, setNote] = useState(5);
  const [texte, setTexte] = useState("");
  const [statut, setStatut] = useState("idle");
  const [erreur, setErreur] = useState(null);

  async function ajouter(e) {
    e.preventDefault();
    setStatut("sending");
    setErreur(null);
    try {
      await laisserAvis(restaurantId, { rating: note, text: texte.trim() || undefined });
      setTexte("");
      onChange();
      setStatut("idle");
    } catch (err) {
      setErreur(err.message);
      setStatut("idle");
    }
  }

  async function supprimer(avisId) {
    try {
      await deleteAdminAvis(avisId);
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div>
      {avis.length === 0 && <p className="card__reason">Aucun avis pour ce restaurant.</p>}

      {avis.length > 0 && (
        <ul className="why__list" style={{ marginBottom: 16 }}>
          {avis.map((a) => (
            <li key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <span>
                <strong>{a.author || "Anonyme"}</strong>
                {a.rating != null && ` · ${a.rating}/5`}
                {a.text && <> — {a.text}</>}
                <span className="calcul__badge" style={{ marginLeft: 6 }}>
                  {new Date(a.created_at).toLocaleDateString("fr-FR")}
                </span>
              </span>
              <button
                type="button"
                className="linkbtn"
                onClick={() => supprimer(a.id)}
                aria-label="Supprimer cet avis"
                title="Supprimer cet avis"
              >
                <Trash size={14} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={ajouter} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <div className="formfield">
          <label htmlFor="admin-avis-note">Note (1 à 5)</label>
          <input
            id="admin-avis-note"
            type="number"
            min={1}
            max={5}
            value={note}
            onChange={(e) => setNote(Number(e.target.value))}
            style={{ maxWidth: 100 }}
          />
        </div>
        <div className="formfield">
          <label htmlFor="admin-avis-texte">Texte (facultatif)</label>
          <textarea
            id="admin-avis-texte"
            className="avis__texte"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={3}
          />
        </div>
        {erreur && <p className="formfield__error">{erreur}</p>}
        <button type="submit" className="btn btn--ghost" disabled={statut === "sending"} style={{ justifySelf: "start" }}>
          {statut === "sending" ? "Envoi…" : "Ajouter un avis (au nom de ce compte)"}
        </button>
      </form>
    </div>
  );
}

function FicheAdmin({ id, onBack }) {
  const [resto, setResto] = useState(null);
  const [erreur, setErreur] = useState(null);

  function charger() {
    return fetchAdminRestaurant(id)
      .then(setResto)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    let annule = false;
    // Effacer la fiche precedente AVANT de lancer le fetch : sinon un
    // changement de `id` laisserait affichee la fiche de l'ancien restaurant
    // pendant tout le chargement, ce qu'un visiteur lit comme "c'est la bonne
    // fiche" jusqu'a ce qu'elle change sous ses yeux.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  let photosCarte = [];
  try {
    const brut = resto.menu_photo_urls;
    photosCarte = Array.isArray(brut) ? brut : JSON.parse(brut || "[]");
  } catch {
    photosCarte = [];
  }

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

          {/* --- Score statique : détail du calcul, toujours déplié ici --- */}
          <DetailCalcul detail={resto.detail_calcul} initialementOuvert />

          {/* --- Carte : photos telles qu'un utilisateur les verrait, OCR, observations --- */}
          <Depliant titre="Carte & menu" badge={menu ? "lue" : "aucune"} defautOuvert>
            {photosCarte.length > 0 ? (
              <CartePhotos urls={photosCarte} motif={resto.photos_motif} />
            ) : (
              <p className="card__reason">Aucune photo de carte enregistrée.</p>
            )}

            {menu ? (
              <div style={{ marginTop: 12 }}>
                <p className="card__reason">
                  Score menu {menu.menu_score?.toFixed(3)} · lue le{" "}
                  {new Date(menu.scanned_at).toLocaleDateString("fr-FR")} · fournisseur{" "}
                  {menu.provider}
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
              </div>
            ) : (
              <p className="card__reason" style={{ marginTop: 12 }}>
                Aucune carte lue pour ce restaurant.
              </p>
            )}

            {resto.cartes?.length > 0 && (
              <p className="card__reason" style={{ marginTop: 12 }}>
                {resto.cartes.length} carte{resto.cartes.length > 1 ? "s" : ""} soumise
                {resto.cartes.length > 1 ? "s" : ""} par des utilisateurs.
              </p>
            )}
          </Depliant>

          {/* --- Informations modifiables --- */}
          <Depliant titre="Informations" badge="lecture et écriture">
            <InformationsEdit resto={resto} onSauve={setResto} />
          </Depliant>

          {/* --- Avis : lecture, ajout, modération --- */}
          <Depliant titre="Avis" badge={`${resto.avis?.length ?? 0}`}>
            <AvisAdmin restaurantId={resto.id} avis={resto.avis || []} onChange={charger} />
          </Depliant>

          {/* --- Tous les autres champs bruts de la base --- */}
          <Depliant titre="Autres champs en base" badge="vue technique">
            <dl className="calcul__obs">
              {champsBruts.map(([cle, val]) => (
                <div key={cle} style={{ display: "contents" }}>
                  <dt>{cle}</dt>
                  <dd>{rendreValeur(val)}</dd>
                </div>
              ))}
            </dl>
          </Depliant>
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
    // Meme raison qu'au-dessus : effacer la page precedente avant de charger
    // la suivante, plutot que de laisser une liste perimee affichee pendant
    // le chargement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          {/* Grille large, pas la colonne unique de Découvrir : ici on
              feuillette vite plutôt qu'on lit un classement (retour
              utilisateur). */}
          <div className="grid admin__grid">
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
