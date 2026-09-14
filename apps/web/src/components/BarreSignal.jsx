// apps/web/src/components/BarreSignal.jsx
//
// Position d'un restaurant sur l'échelle du Local Signal (LS-12).
//
// POURQUOI PAS DES ÉTOILES. Elles ont été essayées et écartées, pour deux
// raisons qui tiennent toutes les deux.
//
// D'abord parce que c'est le symbole de la note de popularité — celui que
// Google emploie, et que ce produit existe pour ne pas reproduire (D-001,
// D-007). Reprendre le signe d'un classement qu'on récuse invite à confondre
// les deux, et le premier réflexe du lecteur est de chercher « combien
// d'avis ».
//
// Ensuite parce que, sur les données réelles, la dispersion des scores place
// presque tout le monde entre trois et quatre étoiles : le symbole ne
// départage plus rien à l'écran, alors que l'écart de score, lui, est net.
//
// POURQUOI PAS DE CHIFFRE NON PLUS. D-009 est explicite : aucun score visible
// par défaut. L'utilisateur veut une liste de restaurants, pas un tableau de
// bord. Une barre montre une POSITION sans énoncer une note — elle répond à
// « par rapport à quoi ? », qui était la question de l'encadrant, sans
// transformer l'écran en tableau de bord.
//
// L'ANIMATION N'EST PAS DÉCORATIVE. Le remplissage de gauche à droite dit
// qu'un calcul a eu lieu. Une barre déjà pleine à l'affichage se lit comme une
// propriété fixe du restaurant ; une barre qui se remplit se lit comme un
// résultat. Même information, message différent.
//
// TOUT SE FAIT EN CSS, sans état ni effet. Une animation pilotée par
// `useState` dans un `useEffect` provoque un rendu supplémentaire par carte —
// et React signale à juste titre le procédé. Ici la largeur finale est passée
// en variable CSS, l'animation la rejoint depuis zéro, et le respect de
// `prefers-reduced-motion` se fait dans la feuille de style, là où il a sa
// place.

export default function BarreSignal({ valeur, ton, delai = 0, label }) {
  // La valeur peut manquer — un restaurant non évalué existe (D-012). On
  // affiche alors la piste vide plutôt que de supposer zéro, qui se lirait
  // comme « mauvais » au lieu de « inconnu ».
  const part = valeur == null ? 0 : Math.max(0, Math.min(100, valeur));

  return (
    <div
      className="barresignal"
      // La barre est une image de données : elle porte son sens en texte pour
      // qui ne la voit pas, et le lecteur d'écran annonce le verdict — pas un
      // pourcentage, qui ne voudrait rien dire sans l'échelle.
      role="img"
      aria-label={label}
    >
      <div
        className={`barresignal__part barresignal__part--${ton}`}
        style={{ "--part": `${part}%`, "--delai": `${delai}ms` }}
      />
    </div>
  );
}
