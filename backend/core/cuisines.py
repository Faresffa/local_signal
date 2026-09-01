# backend/core/cuisines.py
# Traduction des tags `cuisine` d'OpenStreetMap vers un libellé français.
#
# OSM utilise des valeurs anglaises normalisées (`french`, `italian`, `pizza`),
# séparées par des points-virgules quand un établissement en porte plusieurs.
# Les interfaces affichent du français : la traduction se fait ici, une seule
# fois, plutôt que d'être dupliquée dans le web et le mobile.
#
# Les valeurs inconnues sont retournées capitalisées telles quelles : mieux vaut
# afficher un mot anglais que rien du tout, et ça signale ce qu'il reste à
# ajouter au tableau.

_FR = {
    # Cuisines nationales et régionales
    "french": "Française",
    "italian": "Italienne",
    "japanese": "Japonaise",
    "chinese": "Chinoise",
    "vietnamese": "Vietnamienne",
    "thai": "Thaïlandaise",
    "korean": "Coréenne",
    "indian": "Indienne",
    "lebanese": "Libanaise",
    "moroccan": "Marocaine",
    "tunisian": "Tunisienne",
    "algerian": "Algérienne",
    "greek": "Grecque",
    "turkish": "Turque",
    "spanish": "Espagnole",
    "portuguese": "Portugaise",
    "mexican": "Mexicaine",
    "peruvian": "Péruvienne",
    "brazilian": "Brésilienne",
    "argentinian": "Argentine",
    "colombian": "Colombienne",
    "american": "Américaine",
    "german": "Allemande",
    "russian": "Russe",
    "african": "Africaine",
    "ethiopian": "Éthiopienne",
    "senegalese": "Sénégalaise",
    "caribbean": "Antillaise",
    "asian": "Asiatique",
    "mediterranean": "Méditerranéenne",
    "international": "Internationale",
    "indonesian": "Indonésienne",
    "cambodian": "Cambodgienne",
    "nepalese": "Népalaise",
    "pakistani": "Pakistanaise",
    "persian": "Persane",
    "syrian": "Syrienne",
    "georgian": "Géorgienne",
    "basque": "Basque",
    "savoyard": "Savoyarde",
    "corsican": "Corse",
    "alsatian": "Alsacienne",

    # Types de plats et formats
    "pizza": "Pizzeria",
    "pasta": "Pâtes",
    "burger": "Burger",
    "sandwich": "Sandwicherie",
    "kebab": "Kebab",
    "sushi": "Sushi",
    "ramen": "Ramen",
    "noodle": "Nouilles",
    "crepe": "Crêperie",
    "seafood": "Fruits de mer",
    "fish": "Poisson",
    "steak_house": "Grillades",
    "barbecue": "Barbecue",
    "chicken": "Volaille",
    "couscous": "Couscous",
    "tapas": "Tapas",
    "fondue": "Fondue",
    "brasserie": "Brasserie",
    "bistro": "Bistrot",
    "regional": "Régionale",
    "friture": "Friterie",

    # Régimes
    "vegetarian": "Végétarienne",
    "vegan": "Végane",
    "gluten_free": "Sans gluten",

    # Autres
    "coffee_shop": "Café",
    "breakfast": "Petit-déjeuner",
    "brunch": "Brunch",
    "dessert": "Desserts",
    "ice_cream": "Glacier",
    "bakery": "Boulangerie",
    "bubble_tea": "Bubble tea",
    "juice": "Jus",
    "wine": "Bar à vins",
    "beer": "Bière",
    "tea": "Salon de thé",
    "fine_dining": "Gastronomique",
    "fast_food": "Restauration rapide",
    "buffet": "Buffet",
    "food_court": "Aire de restauration",
}


def label(osm_cuisine: str | None) -> str:
    """
    Libellé français lisible d'un tag `cuisine` OSM.

    Un établissement peut porter plusieurs valeurs séparées par des
    points-virgules ; on n'en affiche que les deux premières, au-delà le libellé
    devient illisible sur une carte de résultat.

    >>> label("french")
    'Française'
    >>> label("pizza;italian")
    'Pizzeria, Italienne'
    >>> label(None)
    'Restaurant'
    """
    if not osm_cuisine:
        return "Restaurant"

    parts = [p.strip().lower() for p in osm_cuisine.split(";") if p.strip()]
    if not parts:
        return "Restaurant"

    labels = [_FR.get(p, p.replace("_", " ").capitalize()) for p in parts[:2]]
    return ", ".join(labels)


def options(cuisines: list[str]) -> list[dict]:
    """
    Construit la liste des filtres proposés à l'utilisateur, à partir des
    cuisines réellement présentes en base.

    On ne propose jamais un filtre qui ne renverrait aucun résultat : c'est la
    différence entre une liste de filtres utile et une liste décorative.

    Returns:
        [{"value": "french", "label": "Française"}, …] trié par libellé.
    """
    seen = {}
    for raw in cuisines:
        if not raw:
            continue
        for part in raw.split(";"):
            key = part.strip().lower()
            if key and key not in seen:
                seen[key] = _FR.get(key, key.replace("_", " ").capitalize())

    return sorted(
        ({"value": v, "label": l} for v, l in seen.items()),
        key=lambda o: o["label"],
    )
