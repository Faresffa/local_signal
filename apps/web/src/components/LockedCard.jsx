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

export default function LockedCard({ onUnlock, connecte = false }) {
  // Un compte déjà connecté n'a plus besoin qu'on lui en redemande un — il
  // ne lui manque que l'abonnement (LS-refonte).
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
        <p className="card__meta">
          {connecte ? "Réservé aux abonnés" : "Réservé aux membres"}
        </p>
      </div>

      <div className="card__foot">
        <button className="btn btn--primary btn--block" onClick={onUnlock}>
          {connecte ? "S'abonner" : "Créer un compte"}
        </button>
      </div>
    </article>
  );
}
