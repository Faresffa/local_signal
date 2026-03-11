# filters/restaurant_filter.py
# Module de filtrage multi-critères des restaurants


def apply_filters(restaurants: list[dict], criteria: dict) -> list[dict]:
    """
    Filtre une liste de restaurants selon les critères utilisateur.

    Args:
        restaurants: Liste de restaurants (dicts)
        criteria: Dict avec clés optionnelles:
            - 'lieu': str (nom de ville)
            - 'types_nourriture': list[str] (ex: ["Italienne", "Française"])
            - 'ambiance': list[str] (ex: ["Cosy", "Moderne"])
            - 'budget': tuple(int, int) — (min, max) prix par personne
            - 'personnes': int — nombre de personnes (réservé pour usage futur)

    Returns:
        Liste filtrée de restaurants
    """
    filtered = list(restaurants)

    # --- Filtre Lieu / Ville ---
    lieu = criteria.get("lieu")
    if lieu:
        filtered = [r for r in filtered if r.get("city", "").lower() == lieu.lower()]

    # --- Filtre Types de nourriture ---
    types = criteria.get("types_nourriture")
    if types:
        filtered = [r for r in filtered if r.get("type") in types]

    # --- Filtre Ambiance ---
    ambiances = criteria.get("ambiance")
    if ambiances:
        filtered = [r for r in filtered if r.get("ambiance") in ambiances]

    # --- Filtre Allergènes / Contraintes ---
    # Si le user a ["Sans gluten"], on EXCLUT les restos qui N'ONT PAS "Sans gluten" dans le mock
    # Ou à l'inverse, on peut considérer 'allergenes' dans `criteria` comme ce que le user VEUT.
    # Ex: user veut "Vegan", le resto DOIT avoir "Vegan" dans ses `tags` ou `allergenes`.
    allergenes_requis = criteria.get("allergenes")
    if allergenes_requis:
        req_set = set(allergenes_requis)
        filtered = [
            r for r in filtered
            if req_set.issubset(set(r.get("dietary_options", [])))
        ]

    # --- Filtre Budget ---
    budget = criteria.get("budget")
    if budget and len(budget) == 2:
        budget_min, budget_max = budget
        filtered = [
            r for r in filtered
            if budget_min <= r.get("price", 0) <= budget_max
        ]

    return filtered
