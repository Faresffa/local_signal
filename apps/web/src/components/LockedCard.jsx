// apps/web/src/components/LockedCard.jsx
//
// Carte "verrouillée", affichée à la place d'un résultat masqué à un
// visiteur non connecté (voir Discover.jsx).
//
// Ne reçoit et n'affiche AUCUNE donnée réelle de restaurant : le backend ne
// renvoie que le nombre de résultats masqués, jamais leur contenu. Un flou
// CSS appliqué à de vraies données serait trivialement contournable depuis
// l'onglet Réseau du navigateur — cette carte est donc générique par
// construction, pas une vraie carte floutée.

import { LockSimple } from "@phosphor-icons/react";

export default function LockedCard({ onUnlock }) {
  return (
    <article className="card card--locked">
      <div className="card__media">
        <span className="card__lock" aria-hidden="true">
          <LockSimple size={26} weight="fill" />
        </span>
      </div>

      <div className="card__body">
        <div className="card__heading">
          <h3 className="card__name">Restaurant verrouillé</h3>
        </div>
        <p className="card__meta">Réservé aux membres</p>
      </div>

      <div className="card__foot">
        <button className="btn btn--primary btn--block" onClick={onUnlock}>
          Créer un compte
        </button>
      </div>
    </article>
  );
}
