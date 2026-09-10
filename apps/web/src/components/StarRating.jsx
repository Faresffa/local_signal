import { Star } from "@phosphor-icons/react";

export default function StarRating({
  value,
  max = 5,
  size = 14,
  className = "",
}) {
  const note = Math.max(0, Math.min(max, Number(value ?? 0)));

  return (
    <span
      className={`star-rating ${className}`.trim()}
      aria-label={`${note.toFixed(1)} étoiles sur ${max}`}
      title={`${note.toFixed(1)} / ${max}`}
    >
      {Array.from({ length: max }, (_, index) => {
        const remplissage = Math.max(0, Math.min(1, note - index));
        return (
          <span key={index} className="star-rating__cell" aria-hidden="true">
            <Star className="star-rating__base" size={size} weight="regular" />
            <span
              className="star-rating__fill"
              style={{ width: `${Math.round(remplissage * 100)}%` }}
            >
              <Star className="star-rating__icon" size={size} weight="fill" />
            </span>
          </span>
        );
      })}
    </span>
  );
}
