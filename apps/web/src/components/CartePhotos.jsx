// apps/web/src/components/CartePhotos.jsx
//
// Affichage des photos de carte d'un restaurant (D-034).
//
// CE QUI EST AFFICHÉ N'EST PAS CE QUI EST STOCKÉ. La base ne conserve que des
// URL et le texte relevé ; les images restent chez leur hébergeur et ne
// transitent jamais par nos serveurs. C'est la même posture que D-021 et
// D-025 : on analyse puis on jette, on ne redistribue pas l'œuvre.
//
// Repli par défaut, pour deux raisons. D'abord parce que ces photos
// appartiennent à ceux qui les ont prises et n'ont pas à s'imposer à l'écran.
// Ensuite parce que la fiche doit d'abord répondre à « ce restaurant est-il
// local ? » — la carte est une pièce justificative, pas l'argument.

import { useState } from "react";
import { CaretDown, CaretRight, Image as ImageIcon } from "@phosphor-icons/react";

export default function CartePhotos({ urls, motif }) {
  const [ouvert, setOuvert] = useState(false);
  const [cassees, setCassees] = useState(() => new Set());

  const liste = Array.isArray(urls) ? urls : [];
  const visibles = liste.filter((u) => !cassees.has(u));
  if (!liste.length) return null;

  return (
    <section className="cartephotos">
      <button className="calcul__bascule" onClick={() => setOuvert((o) => !o)}>
        {ouvert ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        <ImageIcon size={15} weight="light" />
        Voir la carte ({liste.length} {liste.length > 1 ? "pages" : "page"})
      </button>

      {ouvert && (
        <div className="cartephotos__corps">
          {motif && <p className="cartephotos__motif">{motif}</p>}

          <div className="cartephotos__grille">
            {visibles.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer noopener"
                 className="cartephotos__vignette">
                <img
                  src={u}
                  alt={`Page ${i + 1} de la carte`}
                  loading="lazy"
                  decoding="async"
                  // L'hébergeur n'a pas à savoir depuis quelle page on regarde.
                  referrerPolicy="no-referrer"
                  // On retire la vignette plutôt que de laisser une image
                  // cassée à l'écran. Ce qu'un `onError` dit exactement, c'est
                  // « le navigateur n'a pas pu peindre cette image » — pas
                  // « l'image n'existe plus ». Les deux ont été confondus, voir
                  // le message de repli ci-dessous.
                  onError={() => setCassees((s) => new Set(s).add(u))}
                />
              </a>
            ))}
          </div>

          {visibles.length === 0 && (
            /* NE PAS AFFIRMER UNE CAUSE QU'ON NE CONNAIT PAS. Ce message
               annonçait « les images ne sont plus accessibles chez leur
               hébergeur » — une expiration. Vérification faite, les URL
               répondaient 200 et l'image faisait 500 Ko : elles étaient
               parfaitement vivantes, et c'est l'affichage qui avait échoué
               (extension de navigateur, réseau, politique de contenu).
               Un composant sait qu'il n'a pas pu peindre une image ; il ne
               sait pas pourquoi, et ne doit donc pas l'inventer. */
            <div className="cartephotos__replis">
              <p className="cartephotos__motif">
                Ces photos ne s'affichent pas ici. Elles restent consultables
                chez leur hébergeur — et les observations qui en ont été tirées
                sont valides dans tous les cas.
              </p>
              <ul className="cartephotos__liens">
                {liste.map((u, i) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer noopener">
                      Ouvrir la page {i + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="cartephotos__mention">
            Photos hébergées par leur plateforme d'origine et publiées par leurs
            auteurs. Elles ne sont pas conservées par Local Signal : seules les
            observations extraites le sont.
          </p>
        </div>
      )}
    </section>
  );
}
