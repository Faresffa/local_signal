// apps/web/src/components/PhotoRestaurant.jsx
//
// Visuel d'un restaurant : sa photo réelle quand on l'a, l'illustration
// générée sinon (D-035).
//
// CE QUI EST AFFICHÉ N'EST PAS CE QUI EST STOCKÉ. La base ne porte qu'une
// URL ; l'image reste chez son hébergeur et ne transite jamais par nos
// serveurs. C'est la même règle que pour les cartes (D-021, D-025) : on ne
// redistribue pas une photo qui ne nous appartient pas.
//
// D'OÙ LE REPLI, QUI N'EST PAS UN DÉTAIL. Une URL d'hébergeur peut expirer, et
// 427 restaurants sur 10 686 seulement en ont une. Le cas « pas de photo » est
// donc le cas MAJORITAIRE, pas l'exception : l'illustration générée reste le
// socle, la photo vient par-dessus quand elle existe. Une grille où seuls
// quelques éléments ont un visuel serait pire que pas de photo du tout.

import { useState } from "react";

import CuisineVisual from "./CuisineVisual";

export default function PhotoRestaurant({
  id, cuisine, photoUrl, nom, size = 64, className = "",
}) {
  // `chargee` évite le clignotement : tant que l'image n'est pas arrivée,
  // l'illustration reste visible dessous plutôt qu'un rectangle vide.
  const [chargee, setChargee] = useState(false);
  const [cassee, setCassee] = useState(false);

  const url = (photoUrl || "").trim();
  const afficher = url && !cassee;

  return (
    <div className={`photorestau ${className}`}>
      <CuisineVisual id={id} cuisine={cuisine} size={size} />

      {afficher && (
        <img
          src={url}
          // Vide et aria-hidden : le nom du restaurant est déjà annoncé juste à
          // côté. Le répéter ici ferait entendre deux fois la même chose à un
          // lecteur d'écran, sans rien apprendre.
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={`photorestau__img${chargee ? " is-chargee" : ""}`}
          onLoad={() => setChargee(true)}
          onError={() => setCassee(true)}
          // L'hébergeur n'a pas à savoir depuis quelle page on regarde.
          referrerPolicy="no-referrer"
        />
      )}
      {/* Le nom sert de titre au conteneur pour l'infobulle du navigateur. */}
      {afficher && nom ? <span className="sr-only">{nom}</span> : null}
    </div>
  );
}
