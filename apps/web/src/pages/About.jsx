// apps/web/src/pages/About.jsx
//
// À propos. Contenu volontairement léger pour l'instant (retour utilisateur :
// « on sera vide, où on expliquera un petit peu ») — le fond reprend ce que
// CLAUDE.md documente déjà comme le cœur du projet, sans rien inventer.

import { ArrowLeft } from "@phosphor-icons/react";

export default function About({ onBack }) {
  return (
    <div style={{ maxWidth: "72ch" }}>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} weight="bold" />
        Retour
      </button>

      <h1 className="detail__title">À propos</h1>

      <section className="legal__section">
        <p>
          Local Signal aide un voyageur qui ne connaît pas une ville à trouver
          un vrai restaurant local plutôt qu'une adresse tournée vers les
          touristes. Le problème n'est pas le manque de restaurants
          authentiques, c'est leur manque de visibilité — un restaurant
          fréquenté par les habitants a souvent peu d'avis, pas de site, pas
          de photos. Nous cherchions un moyen de le repérer sans nous fier à
          sa popularité.
        </p>
        <p>
          Le score qui accompagne chaque restaurant — le Local Signal — se
          calcule sur sa carte, la langue de ses avis publics et ses prix
          comparés au quartier. Jamais sur le nombre d'avis ni sur la note.
          C'est ce qui permet à un restaurant sans presque aucune trace en
          ligne d'apparaître quand même, à sa juste place.
        </p>
      </section>
    </div>
  );
}
