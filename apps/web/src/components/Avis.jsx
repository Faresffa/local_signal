// apps/web/src/components/Avis.jsx
//
// Avis laissés par nos utilisateurs sur un restaurant (D-039).
//
// CE QUE CE BLOC NE FAIT PAS : peser sur le score. Ces avis sont stockés et
// affichés, rien de plus. Les faire compter reviendrait à réintroduire la
// popularité dans un classement construit précisément pour s'en passer
// (D-001). La mention en bas du bloc le dit à l'utilisateur, parce qu'un avis
// qui n'a aucun effet et qu'on laisse croire influent est un mensonge poli.
//
// UN VISITEUR NON CONNECTÉ VOIT TOUT, MAIS N'ÉCRIT PAS. Il lit les avis et
// voit le bouton ; le clic l'emmène se connecter. On ne cache pas le geste
// pour éviter la demande de connexion — cacher reviendrait à ne jamais donner
// de raison de créer un compte.

import { useCallback, useEffect, useState } from "react";
import {
  ChatCircleText, PencilSimple, Star, Trash, UserCircle,
} from "@phosphor-icons/react";

import { fetchAvis, laisserAvis, retirerAvis } from "../api";

const MAX = 2000;

/** Date lisible. L'heure n'apporte rien sur un avis de restaurant. */
function quand(valeur) {
  if (!valeur) return "";
  const d = new Date(valeur.includes?.("T") ? valeur : `${valeur}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Cinq étoiles, cliquables ou non.
 *
 * La note est facultative : un avis peut n'être que du texte. Le zéro veut
 * dire « je ne note pas », pas « zéro sur cinq » — d'où le bouton « effacer »
 * qui apparaît dès qu'une note est posée.
 */
function Etoiles({ note, onChange, taille = 22 }) {
  const [survol, setSurvol] = useState(0);
  const lecture = !onChange;
  const affichee = survol || note || 0;

  return (
    <div className={`etoiles${lecture ? " etoiles--lecture" : ""}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="etoiles__etoile"
          disabled={lecture}
          aria-label={`${n} sur 5`}
          aria-pressed={!lecture && note === n}
          onMouseEnter={() => !lecture && setSurvol(n)}
          onMouseLeave={() => !lecture && setSurvol(0)}
          onClick={() => onChange?.(n)}
        >
          <Star
            size={taille}
            weight={n <= affichee ? "fill" : "regular"}
            className={n <= affichee ? "est-pleine" : undefined}
          />
        </button>
      ))}

      {!lecture && note > 0 && (
        <button type="button" className="linkbtn etoiles__effacer" onClick={() => onChange(null)}>
          effacer
        </button>
      )}
    </div>
  );
}

export default function Avis({ restaurantId, user, onSeConnecter }) {
  const [etat, setEtat] = useState({ chargement: true, avis: [], leMien: null });
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    try {
      const data = await fetchAvis(restaurantId);
      setEtat({ chargement: false, avis: data.avis ?? [], leMien: data.le_mien ?? null });
      return data.le_mien ?? null;
    } catch {
      // Un bloc d'avis qui ne charge pas ne doit pas casser la fiche : le
      // restaurant reste consultable, la section se tait.
      setEtat({ chargement: false, avis: [], leMien: null });
      return null;
    }
  }, [restaurantId]);

  useEffect(() => { charger(); }, [charger]);

  // Le formulaire s'ouvre pré-rempli quand un avis existe déjà : on modifie le
  // sien, on n'en empile pas un second (une seule ligne par personne en base).
  function ouvrir() {
    if (!user) { onSeConnecter?.(); return; }
    setNote(etat.leMien?.rating ?? null);
    setTexte(etat.leMien?.text ?? "");
    setErreur(null);
    setOuvert(true);
  }

  async function envoyer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await laisserAvis(restaurantId, { rating: note, text: texte.trim() || null });
      await charger();
      setOuvert(false);
    } catch (err) {
      // 401 : la session a expiré entre l'affichage et l'envoi. Ce n'est pas
      // une panne, c'est une invitation à se reconnecter.
      if (err.status === 401) onSeConnecter?.();
      else setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    setEnvoi(true);
    try {
      await retirerAvis(restaurantId);
      await charger();
      setOuvert(false);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  const vide = !note && !texte.trim();
  const autres = etat.avis.filter((a) => a.id !== etat.leMien?.id);

  return (
    <section className="avis">
      <header className="avis__tete">
        <h2 className="avis__titre">
          <ChatCircleText size={18} weight="light" />
          Avis des voyageurs
          {etat.avis.length > 0 && (
            <span className="avis__compte">{etat.avis.length}</span>
          )}
        </h2>

        {!ouvert && (
          <button className="btn btn--ghost avis__action" onClick={ouvrir}>
            {etat.leMien ? <PencilSimple size={15} weight="bold" /> : <Star size={15} weight="bold" />}
            {etat.leMien ? "Modifier mon avis" : "Laisser un avis"}
          </button>
        )}
      </header>

      {!user && !ouvert && (
        <p className="avis__invite">
          <button className="linkbtn" onClick={onSeConnecter}>Connectez-vous</button>
          {" "}pour laisser un avis — il restera modifiable et supprimable par vous seul.
        </p>
      )}

      {ouvert && (
        <form className="avis__form" onSubmit={envoyer}>
          <Etoiles note={note} onChange={setNote} />

          <textarea
            className="field__control avis__texte"
            placeholder="Ce que vous avez mangé, l'accueil, l'ambiance…"
            value={texte}
            maxLength={MAX}
            rows={4}
            onChange={(e) => setTexte(e.target.value)}
          />

          <div className="avis__pied">
            <span className="avis__reste">
              {texte.length > MAX - 200 ? `${MAX - texte.length} caractères restants` : ""}
            </span>

            <div className="avis__boutons">
              {etat.leMien && (
                <button type="button" className="btn btn--ghost" onClick={retirer} disabled={envoi}>
                  <Trash size={15} weight="bold" />
                  Retirer
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => setOuvert(false)}>
                Annuler
              </button>
              <button type="submit" className="btn btn--primary" disabled={envoi || vide}>
                {envoi ? "Envoi…" : etat.leMien ? "Enregistrer" : "Publier"}
              </button>
            </div>
          </div>

          {/* Une note OU un texte suffit — le serveur applique la même règle.
              On le dit ici plutôt que de laisser l'utilisateur découvrir le
              refus après avoir cliqué. */}
          {vide && <p className="avis__aide">Mettez une note, écrivez un mot, ou les deux.</p>}
          {erreur && <p className="avis__erreur">{erreur}</p>}
        </form>
      )}

      {etat.leMien && !ouvert && (
        <article className="avis__carte avis__carte--mien">
          <div className="avis__auteur">
            <UserCircle size={26} weight="light" />
            <span>
              <strong>Votre avis</strong>
              <span className="avis__date">
                {quand(etat.leMien.updated_at || etat.leMien.created_at)}
              </span>
            </span>
          </div>
          {etat.leMien.rating && <Etoiles note={etat.leMien.rating} taille={16} />}
          {etat.leMien.text && <p className="avis__corps">{etat.leMien.text}</p>}
        </article>
      )}

      {autres.map((a) => (
        <article className="avis__carte" key={a.id}>
          <div className="avis__auteur">
            <UserCircle size={26} weight="light" />
            <span>
              <strong>{a.author || "Voyageur"}</strong>
              <span className="avis__date">{quand(a.updated_at || a.created_at)}</span>
            </span>
          </div>
          {a.rating && <Etoiles note={a.rating} taille={16} />}
          {a.text && <p className="avis__corps">{a.text}</p>}
        </article>
      ))}

      {!etat.chargement && etat.avis.length === 0 && (
        <p className="avis__vide">
          Aucun avis pour l'instant. Le vôtre serait le premier.
        </p>
      )}

      {/* DIRE CE QUE L'AVIS FAIT, ET CE QU'IL NE FAIT PAS. */}
      <p className="avis__mention">
        Ces avis ne modifient pas le score d'authenticité : celui-ci se calcule
        sur la carte, la langue des avis publics, les prix et l'emplacement.
        Un restaurant populaire n'est pas un restaurant local.
      </p>
    </section>
  );
}
