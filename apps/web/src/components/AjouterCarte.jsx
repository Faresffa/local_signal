// apps/web/src/components/AjouterCarte.jsx
//
// Envoi de la photo d'une carte, depuis la fiche du restaurant (D-038, D-039).
//
// C'EST LE MÉCANISME PAR LEQUEL L'ACTIF DU PROJET SE CONSTRUIT (CLAUDE.md §3).
// Google a les avis ; personne n'a une base de cartes structurées. Chaque
// photo envoyée depuis une fiche arrive déjà rattachée à un restaurant — ce
// qui manquait au scan isolé, dont l'analyse était affichée puis perdue.
//
// PAS DE CONNEXION EXIGÉE. Le premier réflexe devant une carte affichée en
// vitrine est de la photographier, pas de créer un compte. Exiger
// l'inscription à cet instant coûterait l'essentiel des contributions ; une
// photo de carte ne dit d'ailleurs rien de la personne qui l'envoie.
//
// L'IMAGE EST CONSERVÉE, JAMAIS SERVIE (D-038). Elle rejoint un corpus interne
// qui permet de vérifier ce que la lecture automatique en a tiré et de la
// refaire si les méthodes s'améliorent. Elle n'est ni publiée, ni rediffusée.

import { useEffect, useRef, useState } from "react";
import {
  Camera, CheckCircle, Image as ImageIcon, Warning,
} from "@phosphor-icons/react";

import { envoyerCarte, fetchCartes } from "../api";

const MO = 1024 * 1024;
const TAILLE_MAX = 10 * MO;
const TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];

export default function AjouterCarte({ restaurantId, onLue }) {
  const champ = useRef(null);
  const [fichier, setFichier] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [deja, setDeja] = useState(0);

  useEffect(() => {
    fetchCartes(restaurantId)
      .then((d) => setDeja(d.nombre ?? 0))
      .catch(() => setDeja(0));
  }, [restaurantId]);

  // L'URL d'objet est révoquée à la disparition de l'aperçu : sans cela, le
  // navigateur garde l'image entière en mémoire tant que l'onglet vit.
  useEffect(() => {
    if (!fichier) { setApercu(null); return undefined; }
    const url = URL.createObjectURL(fichier);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [fichier]);

  function choisir(f) {
    setErreur(null);
    setResultat(null);
    if (!f) return;

    // On vérifie ici ce que le serveur vérifie de toute façon. L'intérêt n'est
    // pas la sécurité — un contrôle côté navigateur ne protège rien — mais
    // d'éviter de faire monter 30 Mo pour un refus.
    if (!TYPES.includes(f.type)) {
      setErreur("Format non accepté. Envoyez une photo JPEG, PNG, WebP ou HEIC.");
      return;
    }
    if (f.size > TAILLE_MAX) {
      setErreur(`Photo trop lourde (${(f.size / MO).toFixed(1)} Mo, maximum 10 Mo).`);
      return;
    }
    setFichier(f);
  }

  async function envoyer() {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await envoyerCarte(restaurantId, fichier);
      setResultat(r);
      setFichier(null);
      setDeja((n) => n + 1);
      if (r.analysee) onLue?.(r);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="ajoutcarte">
      <header className="ajoutcarte__tete">
        <h2 className="ajoutcarte__titre">
          <Camera size={18} weight="light" />
          Ajouter la carte
        </h2>
        {deja > 0 && (
          <span className="ajoutcarte__deja">
            {deja} {deja > 1 ? "cartes envoyées" : "carte envoyée"}
          </span>
        )}
      </header>

      <p className="ajoutcarte__pitch">
        Une photo de la carte suffit à mesurer ce restaurant, même s'il n'a
        aucun avis. C'est le signal qui compte le plus dans le score.
      </p>

      <input
        ref={champ}
        type="file"
        accept="image/*"
        // `capture` ouvre directement l'appareil photo sur un téléphone, et
        // est ignoré sur un ordinateur — qui affiche son sélecteur de fichier.
        capture="environment"
        hidden
        onChange={(e) => choisir(e.target.files?.[0])}
      />

      {!fichier && !resultat && (
        <button className="ajoutcarte__zone" onClick={() => champ.current?.click()}>
          <ImageIcon size={26} weight="light" />
          <span>
            <strong>Choisir une photo</strong>
            <span>JPEG, PNG, WebP ou HEIC — 10 Mo maximum</span>
          </span>
        </button>
      )}

      {fichier && (
        <div className="ajoutcarte__apercu">
          {apercu && <img src={apercu} alt="Aperçu de la carte à envoyer" />}
          <div className="ajoutcarte__boutons">
            <button className="btn btn--ghost" onClick={() => setFichier(null)} disabled={envoi}>
              Changer
            </button>
            <button className="btn btn--primary" onClick={envoyer} disabled={envoi}>
              {envoi ? "Lecture en cours…" : "Envoyer la carte"}
            </button>
          </div>
        </div>
      )}

      {resultat && (
        <div className="ajoutcarte__resultat">
          <p className="ajoutcarte__ok">
            <CheckCircle size={18} weight="fill" />
            {resultat.message}
          </p>

          {resultat.analysee ? (
            <p className="ajoutcarte__lecture">
              Carte lue&nbsp;: signal de {Math.round((resultat.analyse?.menu_score ?? 0) * 100)} / 100.
              {resultat.analyse?.readable === false
                && " Le texte était partiellement illisible — la photo est conservée et sera relue."}
            </p>
          ) : (
            /* NE PAS FAIRE PASSER UNE PANNE POUR UN SUCCÈS. L'image est
               déposée avant l'analyse, précisément pour que l'indisponibilité
               du modèle ne coûte pas la contribution. */
            <p className="ajoutcarte__lecture">
              La lecture automatique n'a pas abouti cette fois. La photo est
              enregistrée et sera relue&nbsp;: rien n'est perdu.
            </p>
          )}
        </div>
      )}

      {erreur && (
        <p className="ajoutcarte__erreur">
          <Warning size={16} weight="fill" />
          {erreur}
        </p>
      )}

      <p className="ajoutcarte__mention">
        La photo rejoint un corpus interne qui sert à vérifier et à améliorer la
        lecture automatique. Elle n'est ni publiée, ni affichée, ni revendue.
      </p>
    </section>
  );
}
