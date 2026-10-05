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

import { useEffect, useRef, useState } from "react";

import { photoUrl as photoUrlGoogle, photoUrlRestaurateur } from "../api";
import CuisineVisual from "./CuisineVisual";

// Les URL `googleusercontent.com` stockées par le collecteur payant sont
// signées et ont expiré (403, mesuré le 5 octobre 2026) : les demander ne
// produirait qu'une requête perdue avant le repli. Elles restent en base
// (on ne jette pas une donnée acquise), mais on ne les affiche plus.
const URL_EXPIREE = /googleusercontent\.com/;

export default function PhotoRestaurant({
  id, cuisine, photoUrl, photoKey, credit, photoGoogle = false, nom, size = 64, className = "",
}) {
  // `chargee` évite le clignotement : tant que l'image n'est pas arrivée,
  // l'illustration reste visible dessous plutôt qu'un rectangle vide.
  const [chargee, setChargee] = useState(false);
  // Rang de la source en cours dans `sources` : une image qui échoue passe la
  // main à la suivante plutôt que de laisser l'illustration tout de suite.
  const [rang, setRang] = useState(0);
  const imgRef = useRef(null);

  // ORDRE DES SOURCES (D-067) :
  //   1. photo déposée par le restaurateur (D-059) — c'est lui qui la choisit ;
  //   2. photo Google Places, relayée par notre API sans être stockée ;
  //   3. photo du site du restaurant (og:image) ou photo de rue Panoramax ;
  //   4. l'illustration générée, toujours dessous.
  const externe = photoUrl && !URL_EXPIREE.test(photoUrl) ? photoUrl : "";
  const sources = [
    photoKey && { url: photoUrlRestaurateur(id, photoKey), credit: null },
    photoGoogle && { url: photoUrlGoogle(id), credit: "Google Maps" },
    externe && { url: externe.trim(), credit },
  ].filter(Boolean);
  const source = sources[rang];
  const url = source?.url || "";
  const creditAffiche = source?.credit || null;

  useEffect(() => {
    // Une image déjà en cache navigateur peut finir de charger de façon
    // synchrone, avant que React n'ait attaché `onLoad` — l'évènement part
    // alors dans le vide et `chargee` ne passe jamais à vrai. `.complete`
    // dit la vérité indépendamment de l'évènement ; on la relit une fois
    // l'élément monté pour ce cas précis (photo servie par notre propre API,
    // D-059, où le remplacement d'une photo revisite souvent la même URL
    // depuis le cache HTTP).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (imgRef.current?.complete) setChargee(true);
    else setChargee(false);
  }, [url]);

  // Un autre restaurant (ou d'autres données) : on repart de la première source.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRang(0); }, [id, photoKey, photoGoogle, photoUrl]);

  const afficher = Boolean(url);

  return (
    <div className={`photorestau ${className}`}>
      <CuisineVisual id={id} cuisine={cuisine} size={size} />

      {afficher && (
        <img
          key={url}
          ref={imgRef}
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
          onError={() => { setChargee(false); setRang((r) => r + 1); }}
          // L'hébergeur n'a pas à savoir depuis quelle page on regarde.
          referrerPolicy="no-referrer"
        />
      )}
      {afficher && chargee && creditAffiche ? (
        <span className="photorestau__credit" title={`Photo : ${creditAffiche}`}>
          © {creditAffiche}
        </span>
      ) : null}
      {/* Le nom sert de titre au conteneur pour l'infobulle du navigateur. */}
      {afficher && nom ? <span className="sr-only">{nom}</span> : null}
    </div>
  );
}
