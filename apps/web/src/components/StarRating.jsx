import { Star } from "@phosphor-icons/react";

export default function StarRating({
  value,
  max = 5,
  size = 18,
  precision = 0.5, // Permet d'arrondir à la demi-étoile (comme sur votre image)
  className = "",
}) {
  const rawNote = Math.max(0, Math.min(max, Number(value ?? 0)));

  // Arrondi la note à la précision voulue (ex: 0.5)
  const note = precision
    ? Math.round(rawNote / precision) * precision
    : rawNote;

  return (
    <span
      className={`star-rating ${className}`.trim()}
      aria-label={`${note.toFixed(1)} étoiles sur ${max}`}
      title={`${note.toFixed(1)} / ${max}`}
    >
      {Array.from({ length: max }, (_, index) => {
        // Ratio de remplissage entre 0 et 1 pour l'étoile courante
        const fillRatio = Math.max(0, Math.min(1, note - index));

        return (
          <span key={index} className="star-rating__cell" aria-hidden="true">
            {/* Étoile vide (fond) */}
            <Star className="star-rating__base" size={size} weight="regular" />

            {/* Conteneur masqué pour le remplissage */}
            {fillRatio > 0 && (
              <span
                className="star-rating__fill"
                style={{ width: `${fillRatio * 100}%` }}
              >
                <Star className="star-rating__icon" size={size} weight="fill" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
