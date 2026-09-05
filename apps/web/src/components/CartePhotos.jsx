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
                  // Une URL d'hébergeur peut expirer. On retire la vignette
                  // plutôt que de laisser une image cassée à l'écran.
                  onError={() => setCassees((s) => new Set(s).add(u))}
                />
              </a>
            ))}
          </div>

          {visibles.length === 0 && (
            <p className="cartephotos__motif">
              Les images ne sont plus accessibles chez leur hébergeur. Les
              observations qui en ont été tirées restent valides.
            </p>
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
