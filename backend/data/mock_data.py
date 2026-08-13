# backend/data/mock_data.py
#
# STATUT : FIXTURES DE TEST UNIQUEMENT — plus des données d'application (D-020).
#
# L'API lit désormais la base réelle, alimentée depuis OpenStreetMap
# (backend/ingestion/osm/). Ce fichier ne sert plus qu'aux tests d'invariants
# du moteur de scoring, où des cas contrôlés valent mieux que des données
# réelles : on veut pouvoir affirmer « cette carte DOIT scorer plus haut que
# celle-là », ce qu'aucun restaurant réel ne garantit.
#
# Ne jamais réintroduire ces données dans un chemin applicatif.
# Restaurants montreuillois mockés avec coordonnées GPS, avis, note étoiles, et métadonnées
# Avis "falsifiés" selon les consignes de test de l'algorithme de détection

MOCK_RESTAURANTS = [
    {
        "id": "resto_001",
        "name": "L'Indonésie",
        "type": "Indonésienne",
        "ambiance": "Exotique",
        "price": 18,
        "city": "Montreuil",
        "address": "22 Rue du Sergent Bobillot, 93100 Montreuil",
        "lat": 48.8627,
        "lng": 2.4411,
        "rating": 4.3,
        "reservation": True,
        "image": "resto1.jpg",
        "horaires": [("11:30", "14:30"), ("18:30", "22:00")],
        "dietary_options": ["Halal"],
        "reviews": [
            {"text": "Un vrai voyage en Indonésie sans quitter Montreuil ! Le nasi goreng est parfait.", "lang": "fr", "stars": 5},
            {"text": "Cuisine familiale et généreuse, les satay sont fondants. On s'y sent comme à la maison.", "lang": "fr", "stars": 4},
            {"text": "Petit resto discret mais quelle découverte. Le rendang est épicé juste comme il faut.", "lang": "fr", "stars": 5},
            {"text": "Très bon rapport qualité-prix pour le quartier. Les portions sont copieuses.", "lang": "fr", "stars": 4},
            {"text": "J'y vais toutes les semaines depuis 2 ans, la patronne est adorable et la cuisine toujours régulière.", "lang": "fr", "stars": 5},
        ],
    },
    {
        "id": "resto_002",
        "name": "Villa l'Hermitage",
        "type": "Française",
        "ambiance": "Chic",
        "price": 45,
        "city": "Montreuil",
        "address": "5 Rue de l'Hermitage, 93100 Montreuil",
        "lat": 48.8580,
        "lng": 2.4350,
        "rating": 4.5,
        "reservation": True,
        "image": "resto2.jpeg",
        "horaires": [("12:00", "14:30"), ("19:00", "22:30")],
        "dietary_options": ["Végétarien", "Sans gluten"],
        "reviews": [
            {"text": "Cadre magnifique dans cette ancienne villa, le menu dégustation est une merveille.", "lang": "fr", "stars": 5},
            {"text": "Beautiful setting and refined French cuisine. The wine pairing was exceptional.", "lang": "en", "stars": 5},
            {"text": "Un écrin caché à Montreuil. Le filet de bar était cuit à la perfection.", "lang": "fr", "stars": 5},
            {"text": "We discovered this gem through a local friend. Absolutely worth a visit for the ambiance alone.", "lang": "en", "stars": 4},
            {"text": "Service impeccable et carte des vins impressionnante pour un restaurant de banlieue.", "lang": "fr", "stars": 4},
        ],
    },
    {
        "id": "resto_003",
        "name": "Le Grand Angle",
        "type": "Brasserie",
        "ambiance": "Convivial",
        "price": 22,
        "city": "Montreuil",
        "address": "Place Jean Jaurès, 93100 Montreuil",
        "lat": 48.8632,
        "lng": 2.4425,
        "rating": 4.0,
        "reservation": True,
        "image": "resto3.jpg",
        "horaires": [("07:30", "23:00")],
        "dietary_options": [],
        "reviews": [
            {"text": "La brasserie du coin par excellence. Idéal pour un déjeuner rapide entre collègues.", "lang": "fr", "stars": 4},
            {"text": "Terrasse agréable face à la mairie, parfait pour prendre un café en été.", "lang": "fr", "stars": 4},
            {"text": "Plat du jour à 14€, honnête et copieux. Rien d'extraordinaire mais on y revient.", "lang": "fr", "stars": 3},
            {"text": "Je prends mon petit-déj là tous les matins avant le boulot. Le personnel me connaît par cœur.", "lang": "fr", "stars": 4},
            {"text": "Ambiance de quartier très sympa, on croise toujours des voisins. La blanquette du mercredi est top.", "lang": "fr", "stars": 4},
        ],
    },
    {
        "id": "resto_004",
        "name": "Peppe Pizzeria",
        "type": "Italienne",
        "ambiance": "Familial",
        "price": 16,
        "city": "Montreuil",
        "address": "15 Rue du Capitaine Dreyfus, 93100 Montreuil",
        "lat": 48.8620,
        "lng": 2.4430,
        "rating": 4.2,
        "reservation": True,
        "image": "resto4.jpeg",
        "horaires": [("11:30", "14:30"), ("18:00", "22:30")],
        "dietary_options": ["Végétarien"],
        "reviews": [
            {"text": "Best pizza I've had outside Italy! The dough is perfectly crispy and light.", "lang": "en", "stars": 5},
            {"text": "Ottima pizza napoletana, la margherita è perfetta. Bravo Peppe!", "lang": "it", "stars": 5},
            {"text": "We came here after reading TripAdvisor reviews. Totally worth the trip from central Paris!", "lang": "en", "stars": 4},
            {"text": "La pizza quattro formaggi est incroyable, pâte fine et croustillante.", "lang": "fr", "stars": 5},
            {"text": "Pizza buonissima, ingredienti freschi. Un piccolo angolo d'Italia a Montreuil.", "lang": "it", "stars": 4},
        ],
    },
    {
        "id": "resto_005",
        "name": "Les Marmites Volantes",
        "type": "Française",
        "ambiance": "Écologique",
        "price": 14,
        "city": "Montreuil",
        "address": "47 Avenue Pasteur, 93100 Montreuil",
        "lat": 48.8589,
        "lng": 2.4480,
        "rating": 4.4,
        "reservation": True,
        "image": "resto5.jpg",
        "horaires": [("12:00", "14:00"), ("19:00", "21:30")],
        "dietary_options": ["Végétarien", "Vegan", "Sans gluten"],
        "reviews": [
            {"text": "Concept génial de consigne : on rapporte ses bocaux et on a une réduction. Zéro déchet et délicieux !", "lang": "fr", "stars": 5},
            {"text": "Cuisine maison avec des produits locaux et de saison. Le dhal de lentilles corail est une tuerie.", "lang": "fr", "stars": 5},
            {"text": "Enfin un resto engagé qui ne sacrifie pas le goût. Les portions sont généreuses.", "lang": "fr", "stars": 4},
            {"text": "J'adore le principe de livraison en vélo-cargo. Le poulet rôti aux herbes est fondant.", "lang": "fr", "stars": 4},
            {"text": "Parfait pour un déjeuner sain et éco-responsable. Le menu change chaque semaine, c'est top.", "lang": "fr", "stars": 5},
        ],
    },
    {
        "id": "resto_006",
        "name": "A l'Endroit",
        "type": "Bistrot",
        "ambiance": "Décontracté",
        "price": 20,
        "city": "Montreuil",
        "address": "161 Boulevard de la Boissière, 93100 Montreuil",
        "lat": 48.8710,
        "lng": 2.4500,
        "rating": 4.1,
        "reservation": True,
        "image": "resto1.jpg",
        "horaires": [("12:00", "14:30"), ("19:00", "22:00")],
        "dietary_options": [],
        "reviews": [
            {"text": "Sympa, bon et pas cher.", "lang": "fr", "stars": 4},
            {"text": "Plat du jour correct.", "lang": "fr", "stars": 3},
            {"text": "Terrasse agréable, service rapide.", "lang": "fr", "stars": 4},
            {"text": "On mange bien, ambiance cool.", "lang": "fr", "stars": 4},
            {"text": "Rien à redire, simple et efficace.", "lang": "fr", "stars": 3},
        ],
    },
    {
        "id": "resto_007",
        "name": "Délice de Montreuil",
        "type": "Street Food",
        "ambiance": "Populaire",
        "price": 10,
        "city": "Montreuil",
        "address": "38 Boulevard Rouget de Lisle, 93100 Montreuil",
        "lat": 48.8570,
        "lng": 2.4445,
        "rating": 3.9,
        "reservation": True,
        "image": "resto2.jpeg",
        "horaires": [("10:00", "22:00")],
        "dietary_options": ["Halal"],
        "reviews": [
            {"text": "Le meilleur tacos du boulevard, sauce fromagère bien généreuse. Mon péché mignon.", "lang": "fr", "stars": 4},
            {"text": "Rapide, bon, pas cher. Le sandwich poulet grillé avec frites maison c'est le top.", "lang": "fr", "stars": 4},
            {"text": "J'y vais quand j'ai pas le temps de cuisiner. Les galettes sont bien garnies.", "lang": "fr", "stars": 3},
            {"text": "Très correct pour du street food. Le jus d'orange frais vaut le détour.", "lang": "fr", "stars": 4},
            {"text": "Bonne adresse de quartier pour manger sur le pouce. Les wraps sont frais.", "lang": "fr", "stars": 4},
        ],
    },
    {
        "id": "resto_008",
        "name": "O'Thaï",
        "type": "Thaïlandaise",
        "ambiance": "Moderne",
        "price": 17,
        "city": "Montreuil",
        "address": "75 Avenue de la Résistance, 93100 Montreuil",
        "lat": 48.8555,
        "lng": 2.4370,
        "rating": 4.2,
        "reservation": False,
        "image": "resto3.jpg",
        "horaires": [("11:30", "14:30"), ("18:30", "22:00")],
        "dietary_options": ["Sans gluten"],
        "reviews": [
            {"text": "Le pad thaï est vraiment savoureux, on sent les produits frais. Je recommande.", "lang": "fr", "stars": 5},
            {"text": "Amazing green curry, very authentic Thai flavors. A must-try in Montreuil!", "lang": "en", "stars": 4},
            {"text": "Mention spéciale pour le bo bun, copieux et plein de saveurs.", "lang": "fr", "stars": 4},
            {"text": "Petit restaurant sans prétention mais la cuisine est excellente et bien épicée.", "lang": "fr", "stars": 4},
            {"text": "Les rouleaux de printemps maison sont frais et croquants. Bon rapport qualité-prix.", "lang": "fr", "stars": 4},
        ],
    },
    {
        "id": "resto_009",
        "name": "Maison Montreau",
        "type": "Française",
        "ambiance": "Champêtre",
        "price": 28,
        "city": "Montreuil",
        "address": "31 Boulevard Théophile Sueur, 93100 Montreuil",
        "lat": 48.8530,
        "lng": 2.4560,
        "rating": 4.3,
        "reservation": True,
        "image": "resto4.jpeg",
        "horaires": [("12:00", "14:30"), ("19:00", "22:00")],
        "dietary_options": ["Végétarien"],
        "reviews": [
            {"text": "Découvert après une balade dans le parc Montreau. Le cadre est superbe, on se croirait à la campagne.", "lang": "fr", "stars": 5},
            {"text": "Idéal après une promenade le dimanche. Le brunch est copieux et les produits sont frais.", "lang": "fr", "stars": 4},
            {"text": "On est tombés dessus par hasard en se promenant. La terrasse avec vue sur le parc est un bonheur.", "lang": "fr", "stars": 5},
            {"text": "Bel endroit un peu excentré mais qui vaut le détour. Le poulet fermier rôti est excellent.", "lang": "fr", "stars": 4},
            {"text": "Parfait pour un déjeuner dominical en famille après le parc. Accueil chaleureux.", "lang": "fr", "stars": 4},
        ],
    },
    {
        "id": "resto_010",
        "name": "Le Relais",
        "type": "Française",
        "ambiance": "Rustique",
        "price": 24,
        "city": "Montreuil",
        "address": "112 Rue de Paris, 93100 Montreuil",
        "lat": 48.8615,
        "lng": 2.4350,
        "rating": 4.4,
        "reservation": True,
        "image": "resto5.jpg",
        "horaires": [("12:00", "14:30"), ("19:00", "22:30")],
        "dietary_options": [],
        "reviews": [
            {"text": "Le bistrot historique de Montreuil. On y mange une cuisine française traditionnelle de qualité depuis des années.", "lang": "fr", "stars": 5},
            {"text": "Jambon-beurre au comptoir le midi, bavette-frites le soir. Du basique mais fait avec amour.", "lang": "fr", "stars": 4},
            {"text": "Mon père y allait déjà. Le patron connaît tout le monde, ambiance village assurée.", "lang": "fr", "stars": 5},
            {"text": "La formule midi à 16€ est imbattable. L'entrecôte sauce béarnaise est un classique.", "lang": "fr", "stars": 4},
            {"text": "Institution du quartier, on s'y retrouve entre habitués. Le vin est bon et le service chaleureux.", "lang": "fr", "stars": 5},
        ],
    },
]


# =============================================================================
# Cartes simulées — en attente du pipeline de scan (D-004)
# =============================================================================
# Le signal menu est le plus lourd du Local Signal, mais le scan de carte
# (photo -> modèle de vision) n'est pas encore branché. Ces cartes sont SIMULÉES
# et servent uniquement à exercer le moteur de bout en bout.
#
# resto_005 et resto_009 sont VOLONTAIREMENT laissés sans carte, afin de tester
# la redistribution des poids sur signal absent (D-012) : ils ne doivent pas être
# pénalisés pour une information qu'on n'a pas.

MOCK_MENUS = {
    # Carte resserrée, monocuisine, noms vernaculaires — profil local marqué
    "resto_001": {
        "cuisines": ["indonésienne"],
        "dish_count": 11,
        "languages": ["fr", "id"],
        "vernacular_ratio": 0.85,
        "has_tourist_menu": False,
    },
    # Gastronomique : carte courte mais traduite, peu de vernaculaire
    "resto_002": {
        "cuisines": ["française"],
        "dish_count": 16,
        "languages": ["fr", "en"],
        "vernacular_ratio": 0.30,
        "has_tourist_menu": False,
    },
    # Brasserie large, multilingue, formule touristique — profil piège
    "resto_003": {
        "cuisines": ["française", "italienne", "américaine"],
        "dish_count": 42,
        "languages": ["fr", "en", "es", "de"],
        "vernacular_ratio": 0.10,
        "has_tourist_menu": True,
    },
    # Pizzeria qui ratisse large — profil piège
    "resto_004": {
        "cuisines": ["italienne", "américaine", "française"],
        "dish_count": 55,
        "languages": ["fr", "en", "it", "es"],
        "vernacular_ratio": 0.25,
        "has_tourist_menu": True,
    },
    # resto_005 : pas de carte disponible (test D-012)
    "resto_006": {
        "cuisines": ["française"],
        "dish_count": 14,
        "languages": ["fr"],
        "vernacular_ratio": 0.45,
        "has_tourist_menu": False,
    },
    "resto_007": {
        "cuisines": ["maghrébine"],
        "dish_count": 9,
        "languages": ["fr", "ar"],
        "vernacular_ratio": 0.90,
        "has_tourist_menu": False,
    },
    "resto_008": {
        "cuisines": ["thaïlandaise"],
        "dish_count": 24,
        "languages": ["fr", "th"],
        "vernacular_ratio": 0.75,
        "has_tourist_menu": False,
    },
    # resto_009 : pas de carte disponible (test D-012)
    "resto_010": {
        "cuisines": ["française", "italienne"],
        "dish_count": 38,
        "languages": ["fr", "en", "es"],
        "vernacular_ratio": 0.15,
        "has_tourist_menu": True,
    },
}

# Rattachement des cartes aux restaurants
for _resto in MOCK_RESTAURANTS:
    _menu = MOCK_MENUS.get(_resto["id"])
    if _menu:
        _resto["menu"] = _menu
