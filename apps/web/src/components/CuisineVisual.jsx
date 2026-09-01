// apps/web/src/components/CuisineVisual.jsx
//
// Visuel de remplacement d'une fiche restaurant.
//
// POURQUOI PAS UNE PHOTO DE STOCK
//
// OpenStreetMap ne fournit pas de photographies. Le réflexe est d'aller
// chercher une image aléatoire, mais une photo de montagne au-dessus d'un
// restaurant italien n'est pas neutre : elle affirme quelque chose de faux.
// Sur un produit dont l'argument est la fiabilité du jugement, c'est le pire
// endroit où mentir.
//
// Ce composant assume donc le manque : un fond dérivé de l'identifiant du
// restaurant et le pictogramme de sa cuisine. Chaque fiche a un visuel
// distinct et stable, sans jamais prétendre montrer l'établissement.
//
// À REMPLACER par les vraies photographies dès qu'elles existent : soit les
// clichés pris par les utilisateurs lors du scan de carte, soit les visuels
// fournis par les restaurateurs.

import {
  BowlFood, Coffee, Fish, Hamburger, ForkKnife, Pizza,
} from "@phosphor-icons/react";

// Association cuisine OSM vers pictogramme. Volontairement grossière : elle
// sert à varier le visuel, pas à décrire précisément la carte.
const GLYPHES = [
  { name: "pizza", keys: ["pizza", "italian", "pasta"] },
  { name: "burger", keys: ["burger", "american", "sandwich", "fast_food", "kebab"] },
  { name: "fish", keys: ["seafood", "fish", "sushi", "japanese"] },
  { name: "bowl", keys: ["chinese", "vietnamese", "thai", "korean", "ramen", "noodle", "asian", "indian"] },
  { name: "coffee", keys: ["coffee_shop", "cafe", "tea", "bakery", "dessert", "ice_cream", "breakfast", "brunch"] },
];

/**
 * Rend le pictogramme correspondant à la cuisine.
 *
 * Retourne un ÉLÉMENT et non un type de composant : une balise JSX dont le
 * type est calculé pendant le rendu force React à démonter puis remonter le
 * sous-arbre à chaque passe.
 */
function Glyphe({ cuisine, size }) {
  const value = (cuisine || "").toLowerCase();
  const found = GLYPHES.find((g) => g.keys.some((k) => value.includes(k)));

  switch (found?.name) {
    case "pizza": return <Pizza size={size} weight="thin" />;
    case "burger": return <Hamburger size={size} weight="thin" />;
    case "fish": return <Fish size={size} weight="thin" />;
    case "bowl": return <BowlFood size={size} weight="thin" />;
    case "coffee": return <Coffee size={size} weight="thin" />;
    default: return <ForkKnife size={size} weight="thin" />;
  }
}

/** Hachage stable : la même fiche garde toujours la même teinte. */
function teinte(id) {
  let hash = 0;
  for (let i = 0; i < (id || "").length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  // Plage volontairement resserrée sur les tons chauds, pour rester dans la
  // famille chromatique de la marque plutôt que de partir en arc-en-ciel.
  return 12 + (hash % 46);
}

export default function CuisineVisual({ id, cuisine, size = 64 }) {
  return (
    <div className="visual" style={{ "--visual-hue": teinte(id) }} aria-hidden="true">
      <Glyphe cuisine={cuisine} size={size} />
    </div>
  );
}
