// apps/web/src/components/States.jsx
//
// États de chargement, vide et erreur.
//
// Une interface qui ne montre que son état nominal est incomplète : c'est
// pendant l'attente et sur l'échec que l'utilisateur décide s'il fait confiance
// au produit.

import {
  MagnifyingGlass,
  MapPinSimpleArea,
  WarningCircle,
} from "@phosphor-icons/react";

/**
 * Squelette de chargement qui reproduit la forme de la carte finale.
 * Un rond qui tourne ne dit rien ; une silhouette annonce ce qui arrive et
 * évite le décalage de mise en page quand le contenu se substitue.
 */
export function CardSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-card__media" />
      <div className="skeleton-card__body">
        <div className="skeleton" style={{ height: 18, width: "70%" }} />
        <div className="skeleton" style={{ height: 13, width: "45%" }} />
        <div className="skeleton" style={{ height: 13, width: "90%" }} />
      </div>
    </div>
  );
}

export function ResultsSkeleton({ count = 6 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
      <span className="sr-only" role="status">
        Recherche des restaurants en cours
      </span>
    </div>
  );
}

/** Aucun résultat : on dit quoi faire, pas seulement qu'il n'y a rien. */
export function EmptyState({ onReset }) {
  return (
    <div className="state">
      <MagnifyingGlass size={40} weight="light" className="state__icon" />
      <h2 className="state__title">Aucun restaurant ici</h2>
      <p className="state__text">
        Élargissez le rayon de recherche ou retirez un filtre pour voir plus
        d'établissements autour de vous.
      </p>
      {onReset && (
        <button className="btn btn--ghost" onClick={onReset}>
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}

/** Erreur : cause probable et action possible, jamais un code technique seul. */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <WarningCircle size={40} weight="light" className="state__icon" />
      <h2 className="state__title">Impossible de charger les restaurants</h2>
      <p className="state__text">
        {message || "Une erreur est survenue."} Vérifiez que le serveur est
        démarré, puis réessayez.
      </p>
      {onRetry && (
        <button className="btn btn--primary" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

/** Géolocalisation refusée : on continue, on ne bloque pas. */
export function LocationNotice() {
  return (
    <p className="card__reason" style={{ display: "flex", gap: 6 }}>
      <MapPinSimpleArea size={16} weight="light" />
      Position indisponible. Résultats affichés pour le Quartier latin.
    </p>
  );
}
