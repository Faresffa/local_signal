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

    # ------------------------------------------------------------------
    # VARIANTES QUI DESIGNENT LA MEME CHOSE (D-037)
    # ------------------------------------------------------------------
    # Elles pointent DELIBEREMENT sur un libelle deja present au-dessus, pour
    # que les deux ecritures se confondent dans un seul filtre. L'interface
    # affichait « Nouilles » ET « Noodles », « Grillades » ET « Grill » : deux
    # entrees pour un meme plat, ce qui donnait a l'utilisateur l'impression
    # que la liste se repetait — et repartissait les restaurants entre deux
    # filtres dont aucun ne les montrait tous.
    #
    # On ne fusionne que ce qui designe REELLEMENT la meme chose. « Pates » et
    # « Pizzeria » restent distincts, meme si les deux sont italiens.
    "noodles": "Nouilles",          # pluriel de `noodle`
    "corean": "Coréenne",           # faute de frappe presente en base
    "grill": "Grillades",           # synonyme de `steak_house`
    "grilled": "Grillades",
    "steak": "Grillades",
    "italian_pizza": "Pizzeria",    # c'est une pizzeria, pas une autre cuisine
    "pizzeria": "Pizzeria",
    "pizza_restaurant": "Pizzeria",
    "sushi_bar": "Sushi",
    "coffee": "Café",
    "cafe": "Café",
    "bar": "Bar",
    "wine_bar": "Bar à vins",
    "creperie": "Crêperie",
    "pancakes": "Pancakes",
    "burgers": "Burger",
    "sandwiches": "Sandwicherie",
    "seafoods": "Fruits de mer",
    "vegan_options": "Végane",
    "middle_east": "Moyen-orientale",

    # ------------------------------------------------------------------
    # CUISINES SIMPLEMENT NON TRADUITES (D-037)
    # ------------------------------------------------------------------
    # Elles s'affichaient en anglais brut, capitalise. Rien a fusionner ici :
    # ce sont des cuisines distinctes, elles avaient juste ete oubliees.
    "tibetan": "Tibétaine",
    "arab": "Arabe",
    "arabic": "Arabe",
    "oriental": "Orientale",
    "lao": "Laotienne",
    "laotian": "Laotienne",
    "sichuan": "Sichuanaise",
    "cantonese": "Cantonaise",
    "taiwanese": "Taïwanaise",
    "kurdish": "Kurde",
    "latin_american": "Latino-américaine",
    "mauritian": "Mauricienne",
    "middle_eastern": "Moyen-orientale",
    "afghan": "Afghane",
    "filipino": "Philippine",
    "hawaiian": "Hawaïenne",
    "israeli": "Israélienne",
    "polish": "Polonaise",
    "venezuelan": "Vénézuélienne",
    "balkan": "Balkanique",
    "european": "Européenne",
    "tex-mex": "Tex-mex",
    "tex_mex": "Tex-mex",
    "malaysian": "Malaisienne",
    "singaporean": "Singapourienne",
    "sri_lankan": "Sri-lankaise",
    "bangladeshi": "Bangladaise",
    "burmese": "Birmane",
    "mongolian": "Mongole",
    "armenian": "Arménienne",
    "ukrainian": "Ukrainienne",
    "romanian": "Roumaine",
    "hungarian": "Hongroise",
    "swedish": "Suédoise",
    "danish": "Danoise",
    "swiss": "Suisse",
    "belgian": "Belge",
    "dutch": "Néerlandaise",
    "british": "Britannique",
    "irish": "Irlandaise",
    "egyptian": "Égyptienne",
    "nigerian": "Nigériane",
    "ivorian": "Ivoirienne",
    "malagasy": "Malgache",
    "reunionese": "Réunionnaise",
    "creole": "Créole",
    "cuban": "Cubaine",
    "chilean": "Chilienne",
    "bolivian": "Bolivienne",
    "uruguayan": "Uruguayenne",

    # Types de plat et formats de service
    "salad": "Salades",
    "poke": "Poke",
    "bowl": "Bowls",
    "pita": "Pita",
    "falafel": "Falafel",
    "curry": "Curry",
    "hotpot": "Fondue chinoise",
    "dumpling": "Raviolis",
    "dim_sum": "Dim sum",
    "udon": "Udon",
    "soba": "Soba",
    "bento": "Bento",
    "bagel": "Bagels",
    "deli": "Traiteur",
    "cake": "Pâtisserie",
    "pastry": "Pâtisserie",
    "waffle": "Gaufres",
    "pancake": "Pancakes",
    "donut": "Donuts",
    "smoothie": "Smoothies",
    "empanada": "Empanadas",
    "arepa": "Arepas",
    "tacos": "Tacos",
    "burrito": "Burritos",
    "paella": "Paella",
    "risotto": "Risotto",
    "soup": "Soupes",
    "salad_bar": "Salades",
    "sausage": "Charcuterie",
    "cheese": "Fromages",
    "oyster": "Huîtres",
    "lobster": "Homard",

    # Qualificatifs de style, volontairement conserves : ils ne designent pas
    # une origine mais une maniere de servir, et l'utilisateur les cherche.
    "traditional": "Traditionnelle",
    "fusion": "Fusion",
    "local": "Cuisine locale",
    "organic": "Bio",
    "halal": "Halal",
    "kosher": "Casher",
    "gourmet": "Gastronomique",
    "canteen": "Cantine",
    "takeaway": "À emporter",
    "street_food": "Street food",
    "a_volonté": "À volonté",
    "all_you_can_eat": "À volonté",
    "aligot": "Aligot",
    # -------------------------------------------------------------------------
    # COMPLÉMENT LS-05 — les 120 étiquettes qui s'affichaient encore en brut,
    # couvrant 155 restaurants.
    #
    # TROIS RÈGLES, APPLIQUÉES DANS CET ORDRE :
    #
    #   1. Si le libellé français existe déjà dans ce tableau, on l'y rattache.
    #      `japonais`, `japan` et `japonnaise` désignent la même chose que
    #      `japanese` : les laisser séparés répartissait les restaurants entre
    #      quatre filtres dont AUCUN ne les montrait tous (D-037).
    #
    #   2. Une variante hyper-locale d'une cuisine déjà présente, portée par
    #      un ou deux restaurants, rejoint sa cuisine parente. Un filtre
    #      « Hangzhou » montrerait un restaurant et le cacherait à qui cherche
    #      « Chinoise » — c'est-à-dire tout le monde. `sichuanese` fait
    #      exception : « Sichuanaise » existait déjà, il rejoint ce groupe.
    #
    #   3. Une cuisine nationale réellement absente reçoit son nom français.
    #      « Ouïghoure », « Yéménite », « Comorienne » ne sont pas des
    #      variantes de quoi que ce soit.
    #
    # CE QUI N'EST PAS TRADUIT, ET POURQUOI. `libre` et `ecai` restent hors du
    # tableau : ce ne sont pas des cuisines mais des saisies erronées dans
    # OpenStreetMap. Les traduire donnerait un filtre qui ne veut rien dire ;
    # affichées brutes, elles signalent ce qu'il faudrait corriger à la source.

    # Variantes d'orthographe ou de langue — même cuisine, autre écriture
    "japonais": "Japonaise",
    "japonnaise": "Japonaise",
    "japan": "Japonaise",
    "turque": "Turque",
    "libanais": "Libanaise",
    "syrienne": "Syrienne",
    "colombien": "Colombienne",
    "columbian": "Colombienne",
    "végétarienne": "Végétarienne",
    "cambodgien": "Cambodgienne",
    "bresilian": "Brésilienne",
    "vietnam": "Vietnamienne",
    "sénégal": "Sénégalaise",
    "kurde": "Kurde",
    "pakistanese": "Pakistanaise",
    "indian_pakistanese": "Pakistanaise",
    "taiwan": "Taïwanaise",
    "sichuanese": "Sichuanaise",
    "italian_restaurant": "Italienne",
    "trattoria": "Italienne",
    "sardinian": "Italienne",
    "neapolitan": "Pizzeria",
    "gastronomique": "Gastronomique",
    "gastronomic": "Gastronomique",
    "gastromique": "Gastronomique",
    "french gastronomy": "Gastronomique",
    "bistronomie": "Bistrot",
    "hawaii": "Hawaïenne",
    "latino": "Latino-américaine",
    "southamerican": "Latino-américaine",
    "maghreb": "Maghrébine",
    "maghrebi": "Maghrébine",
    "north_african": "Maghrébine",
    "tajine": "Marocaine",
    "cap vert": "Cap-verdienne",
    "cape_verdean": "Cap-verdienne",
    "mésopotamie_et_anatolie": "Moyen-orientale",
    "shawarma": "Kebab",
    "izakaya": "Japonaise",
    "tropical_izakaya": "Japonaise",
    "bobun": "Vietnamienne",
    "petiscos": "Portugaise",
    "bacalhau": "Portugaise",
    "jewish": "Casher",
    "asian_fusion": "Fusion",
    "fusion_asiatique": "Fusion",
    "teahouse": "Salon de thé",
    "salon_de_thé": "Salon de thé",
    "salad bar": "Salades",
    "poke_bowl": "Poke",
    "raclette": "Savoyarde",
    "savoie": "Savoyarde",
    "breton": "Crêperie",
    "savory_pancakes": "Crêperie",
    "crêpes_galettes_&_cachapas_focaccia": "Crêperie",
    "flammkuchen": "Alsacienne",
    "currywurst": "Allemande",
    "fish_and_chips": "Britannique",
    "diner": "Américaine",
    "cajun": "Américaine",
    "cordon_bleu": "Française",
    "tartare": "Française",
    "cafeteria": "Cantine",
    "lunch": "Cantine",
    "delicatessen": "Traiteur",
    "cocktails": "Bar",
    "meat": "Grillades",
    "beef": "Grillades",
    "rotisserie": "Volaille",
    "wings": "Volaille",
    "fried_chicken": "Volaille",
    "hot_dog": "Restauration rapide",
    "crousty": "Restauration rapide",
    "dumplings": "Raviolis",
    "hot_pot": "Fondue chinoise",
    "火鍋": "Fondue chinoise",
    "beef_noodle": "Nouilles",
    "lanzhou": "Nouilles",
    "重庆小面": "Nouilles",
    "渝小面": "Nouilles",

    # Variantes régionales rattachées à leur cuisine parente (règle 2)
    "chineses (teochew) - 中国潮州": "Chinoise",
    "yunnan": "Chinoise",
    "wuhan": "Chinoise",
    "shandong": "Chinoise",
    "shaanxi": "Chinoise",
    "jiangxi": "Chinoise",
    "hubei": "Chinoise",
    "hangzhou": "Chinoise",
    "chongqing": "Chinoise",
    "cuisine_nissarde": "Niçoise",
    "auvergne": "Auvergnate",

    # Cuisines nationales réellement absentes du tableau (règle 3)
    "yemeni": "Yéménite",
    "uzbek": "Ouzbèke",
    "uyghur": "Ouïghoure",
    "somali": "Somalienne",
    "djiboutian": "Djiboutienne",
    "comorian": "Comorienne",
    "cameroonian": "Camerounaise",
    "gabonese": "Gabonaise",
    "congo": "Congolaise",
    "mali": "Malienne",
    "west_african": "Ouest-africaine",
    "berber": "Berbère",
    "palestinian": "Palestinienne",
    "maltese": "Maltaise",
    "bulgarian": "Bulgare",
    "balinese": "Balinaise",
    "himalayan": "Himalayenne",
    "caucasian": "Caucasienne",
    "jamaican": "Jamaïcaine",
    "haitian": "Haïtienne",
    "guadeloupean": "Guadeloupéenne",
    "afro-cuban": "Afro-cubaine",
    "equatorian": "Équatorienne",
    "canadian": "Canadienne",
    "quebec": "Québécoise",

    # Qualificatifs de service, pas de cuisine — mais affichés tels quels
    # aujourd'hui, donc traduits plutôt que laissés en anglais.
    "modern": "Moderne",
    "seasonal": "De saison",

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

    REGROUPÉ PAR LIBELLÉ, PAS PAR VALEUR (D-037). Plusieurs valeurs brutes
    aboutissent au même libellé : `pizza` et `italian_pizza` donnent tous deux
    « Pizzeria », `noodle` et `noodles` donnent « Nouilles ». Les laisser
    séparées produisait deux entrées identiques dans la liste — l'utilisateur
    y voyait une répétition — et pire, répartissait les restaurants entre deux
    filtres dont AUCUN ne les montrait tous.

    Le champ `value` porte donc toutes les valeurs du groupe, séparées par des
    virgules. C'est la forme que `/api/restaurants` attend déjà pour son
    paramètre `cuisines` : aucune adaptation n'est nécessaire côté serveur, et
    le filtre retrouve bien l'ensemble des restaurants du groupe.

    TRIÉ PAR FRÉQUENCE, PAS PAR ALPHABET (D-035). L'ordre alphabétique plaçait
    « Italian restaurant » (1 restaurant) au-dessus d'« Italienne » (819) :
    l'utilisateur qui cherchait de l'italien repartait avec zéro résultat. À
    fréquence égale, l'alphabet départage — sinon l'ordre dépendrait du
    parcours de la base, et deux appels successifs pourraient différer.

    Returns:
        [{"value": "pizza,italian_pizza", "label": "Pizzeria", "count": 614}, …]
    """
    valeurs: dict[str, set[str]] = {}
    volumes: dict[str, int] = {}

    for raw in cuisines:
        if not raw:
            continue
        for part in raw.split(";"):
            cle = part.strip().lower()
            if not cle:
                continue
            libelle = _FR.get(cle, cle.replace("_", " ").capitalize())
            valeurs.setdefault(libelle, set()).add(cle)
            volumes[libelle] = volumes.get(libelle, 0) + 1

    return sorted(
        (
            {
                # Ordre stable des valeurs du groupe : la même liste doit
                # produire la même chaîne d'un appel à l'autre, sinon le cache
                # du navigateur et les tests deviennent imprévisibles.
                "value": ",".join(sorted(valeurs[libelle])),
                "label": libelle,
                "count": volumes[libelle],
            }
            for libelle in valeurs
        ),
        key=lambda o: (-o["count"], o["label"]),
    )
