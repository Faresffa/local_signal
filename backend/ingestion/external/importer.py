# backend/ingestion/external/importer.py
#
# IMPORT D'UN JEU DE DONNÉES EXTERNE (D-029).
#
# Ce module avale un fichier CSV ou JSON produit par n'importe quel collecteur
# — Outscraper, un outil libre lancé par l'utilisateur, un export manuel — et
# range son contenu dans la base en le rattachant aux restaurants déjà connus
# d'OpenStreetMap.
#
# POURQUOI IL EST AGNOSTIQUE À LA SOURCE. Le projet a essayé plusieurs voies
# pour obtenir les cartes (D-023, D-025, D-028) et aucune n'a suffi seule. Plutôt
# que d'écrire un importeur par fournisseur, on définit ici UN contrat d'entrée :
# des colonnes attendues, des synonymes tolérés, et un appariement géographique.
# Changer de collecteur ne demande alors aucune modification de code.
#
# CE QU'IL NE FAIT PAS. Il ne collecte rien. Il n'interroge aucun service. Il lit
# un fichier que quelqu'un d'autre a produit. La collecte et l'import sont deux
# responsabilités distinctes, et les garder séparées permet de tracer l'origine
# de chaque donnée — exigence de traçabilité du mémoire.
#
# APPARIEMENT PAR LA DISTANCE, JAMAIS PAR LE NOM SEUL. « Alliance » existe deux
# fois dans la base, à deux adresses. Rattacher une carte au mauvais restaurant
# corromprait l'indicateur qui pèse 0,40 dans la formule. Un enregistrement dont
# la position ne correspond à aucun restaurant connu est REJETÉ, pas deviné.

import argparse
import csv
import difflib
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from backend import config
from backend.core.scoring.geo_score import haversine
from backend.ingestion.external.selection_photos import selectionner

# Distance maximale entre le restaurant connu et l'enregistrement importé.
# 150 m : assez large pour absorber l'imprécision d'un géocodage, assez étroit
# pour ne pas confondre deux établissements d'une même rue.
RAYON_APPARIEMENT_M = 150

# APPARIEMENT PAR NOM ET DISTANCE, UN À UN (D-036).
#
# L'appariement ne regardait que les coordonnées : la fiche allait au
# restaurant le plus proche, quel que soit son nom. Dans le Quartier latin, où
# les établissements se touchent, la mesure a montré que 56 fiches sur 409
# portaient un nom différent de celui du restaurant retenu — « Au Vieux
# Cèdre » atterrissait sur « L'île de Crête », à 11 m. Et 33 restaurants
# recevaient PLUSIEURS fiches, chacune écrasant la précédente.
#
# Conséquence, la vraie : des cartes, des prix et des photos étaient attribués
# au voisin. Ce n'est pas un trou de couverture, c'est une donnée fausse — et
# elle entrait dans le calcul du score.
#
# La règle est désormais : on note chaque paire possible sur le nom ET la
# distance, on attribue par score décroissant, et chaque fiche comme chaque
# restaurant ne sert qu'une fois. Une paire trop faible est REJETÉE plutôt
# qu'attribuée au hasard : mieux vaut un restaurant sans données qu'un
# restaurant avec celles d'un autre.

# En dessous, on refuse d'apparier sur le seul nom.
#
# 0.50 n'est pas un chiffre rond choisi a vue : il est place dans un ecart
# mesure sur les paires reelles du Quartier latin. Les paires VRAIES tombent a
# 0.562 (« Balzar | Brasserie | Paris » / « Brasserie Balzar ») et au-dessus ;
# les paires FAUSSES a 0.370 (« Atelier Carnem » / « Little Napoli ») et en
# dessous. Le trou entre les deux est franc, et le seuil se pose dedans.
#
# Le seuil precedent, 0.35, laissait passer « Au Vieux Cedre » / « L'Epoque »
# a 0.353 — deux etablissements sans rapport.
#
# A recalibrer si la zone change : la ressemblance des noms depend de la
# langue et des conventions d'enseigne.
SIMILARITE_MINIMALE = 0.50

# Sous cette distance, deux noms sans ressemblance peuvent tout de même
# désigner le même lieu : translittération (« 有面儿 Miaou Mian » contre
# « Bian Bian Nouilles »), enseigne commerciale contre raison sociale. À 5 m
# près, il n'y a physiquement pas deux restaurants.
DISTANCE_CERTAINE_M = 12

# Au-dessus de ce seuil, on considere que deux noms designent le meme
# etablissement. Sert a detecter qu'une fiche a un homonyme AILLEURS dans la
# zone : dans ce cas le rattrapage par proximite est interdit — voir
# `_apparier`.
SIMILARITE_FRANCHE = 0.70

_ARTICLES = re.compile(
    r"\b(le|la|les|l|du|de|des|d|au|aux|chez|the|restaurant|paris)\b"
)


def _nom_comparable(nom: str) -> str:
    """
    Forme normalisée d'un nom d'établissement.

    Sans accent, sans ponctuation, sans article ni mot passe-partout : c'est ce
    qui permet de rapprocher « Brasserie Balzar » de « Balzar | Brasserie |
    Paris », qui désignent le même lieu.
    """
    s = unicodedata.normalize("NFKD", (nom or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = _ARTICLES.sub(" ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _similarite(a: str, b: str) -> float:
    """
    Ressemblance de deux noms, entre 0 et 1.

    Un nom entièrement contenu dans l'autre vaut 1 : « Pizza Roma » et « Pizza
    Roma Panthéon » sont le même restaurant, et une simple distance d'édition
    les séparerait à tort.
    """
    x, y = _nom_comparable(a), _nom_comparable(b)
    if not x or not y:
        return 0.0
    if x == y or x in y or y in x:
        return 1.0
    return difflib.SequenceMatcher(None, x, y).ratio()


def _score_paire(similarite: float, distance: float) -> float:
    """
    Note d'une paire (fiche, restaurant connu).

    Le nom domine — c'est lui qui identifie l'établissement — et la distance
    départage : à noms également plausibles, le plus proche l'emporte. Le terme
    de distance reste borné à 0,25 pour qu'il ne puisse JAMAIS compenser un nom
    qui ne correspond pas, ce qui était exactement le défaut d'origine.
    """
    proximite = max(0.0, 1.0 - distance / RAYON_APPARIEMENT_M)
    return similarite + 0.25 * proximite


def _apparier(lignes_positionnees: list, connus: list) -> dict:
    """
    Attribue au plus une fiche par restaurant, et réciproquement.

    Args:
        lignes_positionnees: [(index, lat, lng, nom), …]
        connus: [{"id", "name", "lat", "lng"}, …]

    Returns:
        {index de la ligne: (restaurant connu, distance en metres)} pour les
        seules paires retenues. La distance est rendue avec le restaurant
        parce que l'affichage a blanc en a besoin, et la recalculer ailleurs
        risquerait de diverger de celle qui a decide de l'appariement.
    """
    # Deux passes. La premiere n'attribue que sur la FOI DU NOM ; la seconde
    # ne sert qu'a rattraper ce qui reste, et uniquement a distance certaine.
    #
    # L'ordre compte. En une seule passe, une fiche dont le nom ne correspond a
    # rien pouvait rafler un restaurant proche avant qu'une fiche mieux nommee
    # ne se presente : « Au Vieux Cedre » atterrissait sur « L'Epoque » parce
    # qu'elle en etait a 8 m. Reserver le rattrapage aux laisses-pour-compte
    # supprime cette concurrence.
    nommees, proches = [], []
    # Fiches qui portent le nom d'un restaurant connu SANS EGARD A LA DISTANCE.
    # Une telle fiche ne doit jamais etre rattrapee par proximite : elle nomme
    # un etablissement que l'on connait, mais pas la ou on le croit. « Au Vieux
    # Cedre » en est le cas type — son homonyme en base est a 751 m, hors
    # rayon, et la fiche se serait posee sur « L'Epoque », a 8 m. Entre une
    # donnee manquante et la donnee d'un autre restaurant, on choisit le trou.
    homonyme_ailleurs = set()
    for index, _lat, _lng, nom in lignes_positionnees:
        if any(_similarite(nom, r["name"]) >= SIMILARITE_FRANCHE for r in connus):
            homonyme_ailleurs.add(index)

    for index, lat, lng, nom in lignes_positionnees:
        for r in connus:
            d = haversine(lat, lng, r["lat"], r["lng"])
            if d > RAYON_APPARIEMENT_M:
                continue
            sim = _similarite(nom, r["name"])
            if sim >= SIMILARITE_MINIMALE:
                nommees.append((_score_paire(sim, d), index, r, d))
            elif d <= DISTANCE_CERTAINE_M and index not in homonyme_ailleurs:
                # Translitteration, enseigne contre raison sociale : le nom ne
                # dit rien, la position ne laisse pas de place au doute. Mais
                # ce n'est bon qu'a defaut de mieux, et jamais pour une fiche
                # qui a deja un homonyme franc dans la zone.
                proches.append((_score_paire(sim, d), index, r, d))

    retenues = {}
    pris = set()

    for lot in (nommees, proches):
        # Meilleures paires d'abord. `index` departage les ex aequo pour que
        # deux executions sur le meme fichier donnent le meme resultat.
        lot.sort(key=lambda p: (-p[0], p[1]))
        for _score, index, r, d in lot:
            if index in retenues or r["id"] in pris:
                continue
            retenues[index] = (r, d)
            pris.add(r["id"])

    return retenues

# Synonymes tolérés pour chaque champ. Les collecteurs ne nomment pas leurs
# colonnes de la même façon ; plutôt que d'imposer un format, on reconnaît les
# appellations courantes. La première trouvée gagne.
CHAMPS = {
    "name": ["name", "title", "nom", "business_name", "place_name"],
    "lat": ["lat", "latitude", "y"],
    "lng": ["lng", "lon", "longitude", "x"],
    "phone": ["phone", "phone_number", "telephone", "tel"],
    "website": ["site", "website", "web", "url"],
    "address": ["full_address", "address", "adresse", "street_address", "street"],
    # `working_hours_old_format` D'ABORD : c'est une chaine lisible. Le champ
    # `working_hours`, lui, arrive en dictionnaire jour par jour et serait stocke
    # comme une representation Python illisible.
    "opening_hours": ["working_hours_old_format", "opening_hours", "hours",
                      "horaires", "working_hours"],
    # « reservation_links » au pluriel et « booking_appointment_link » sont les
    # appellations reelles verifiees dans la sortie d'Outscraper.
    "reservation_url": ["booking_appointment_link", "reservation_links",
                        "reservation_url", "reservations_link", "booking_link",
                        "reserve_url"],
    "rating": ["rating", "note", "average_rating", "stars"],
    "review_count": ["reviews", "review_count", "reviews_count", "user_ratings_total"],
    "menu_url": ["menu_link", "menu_url", "menu"],
    "google_place_id": ["place_id", "google_id", "google_place_id", "cid"],
    # `photos_data` est le nom reel du champ. Surtout PAS « photo » : ce champ-la
    # porte la photo principale de l'etablissement, qui n'est pas une carte.
    "menu_photo_urls": ["photos_data", "menu_photos", "photos_menu",
                        "menu_photo_urls", "photos"],
    # Fourchette de prix affichee par Google (« $ » a « $$$$ »). Notre colonne
    # `price` est vide sur 100 % des restaurants : OpenStreetMap n'expose aucun
    # prix. Ceci ne le remplace pas — c'est une fourchette, pas un montant —
    # mais c'est le seul indice de prix disponible sans lire une carte.
    "price_range": ["range", "price_range", "price_level"],
    "photos_count": ["photos_count", "photo_count"],
    # Photo principale de l'etablissement — a ne pas confondre avec
    # `photos_data`, qui porte les cliches de la carte. Le collecteur la
    # fournit sur 98 % des fiches et l'import la laissait passer : c'est
    # exactement le genre d'information deja payee qu'on ne doit pas perdre.
    # `logo` sert de repli, il vaut mieux qu'aucune image.
    "photo_url": ["photo", "logo"],
}

# Nombre de photos de carte conservées par restaurant. Au-delà, on n'apprend
# plus rien : une carte tient en quelques clichés, et chaque image supplémentaire
# coûte un appel au modèle de vision lors de l'extraction.
MAX_PHOTOS = 5

# Champs dont la valeur EST une liste et doit le rester.
CHAMPS_LISTE = {"menu_photo_urls"}


def _valeur(ligne: dict, champ: str):
    """Lit un champ en essayant ses synonymes, insensible à la casse."""
    minuscules = {k.lower().strip(): v for k, v in ligne.items() if k}
    for cle in CHAMPS[champ]:
        v = minuscules.get(cle)
        if v in (None, "", "null", "None", [], {}):
            continue
        # Une liste : on garde le premier element, SAUF pour les champs dont la
        # liste est la donnee elle-meme. `reservation_links` rend plusieurs liens
        # dont un seul nous interesse ; `photos_data` rend la collection entiere,
        # et la reduire a son premier element detruirait la selection par lot.
        if isinstance(v, list):
            if champ in CHAMPS_LISTE:
                return v
            return v[0] if v else None
        # Un dictionnaire n'a rien a faire dans une colonne texte : on le
        # serialise en JSON plutot que d'y ecrire une repr Python.
        if isinstance(v, dict):
            return json.dumps(v, ensure_ascii=False)
        return v
    return None


def _tourist_flag(ligne: dict):
    """
    Lit `about.Crowd.Tourists` — Google indique lui-meme si un lieu attire une
    clientele touristique.

    HORS SCORING, et ce n'est pas negociable. S'en servir comme entree du calcul
    serait circulaire : on utiliserait le jugement de Google pour predire ce que
    le projet pretend mesurer independamment. En revanche c'est une VALIDATION
    EXTERNE de premier ordre — si le Local Signal note plus bas les restaurants
    que Google marque « Tourists », c'est une confirmation qui ne depend d'aucun
    label humain. Voir D-030.

    Returns:
        1, 0, ou None si l'information est absente.
    """
    about = ligne.get("about") or ligne.get("About")
    if isinstance(about, str):
        try:
            about = json.loads(about)
        except json.JSONDecodeError:
            return None
    if not isinstance(about, dict):
        return None
    # Les cles d'`about` sont rendues DANS LA LANGUE DEMANDEE : en francais,
    # « Crowd » devient « Clientele » et « Tourists » devient « Touristes ».
    # Mesure sur un vrai retour : 6 restaurants sur 10 portaient « Touristes ».
    foule = None
    for cle in ("Clientèle", "Clientele", "Crowd", "crowd"):
        v = about.get(cle)
        if isinstance(v, dict):
            foule = v
            break
    if foule is None:
        return None

    for cle in ("Touristes", "Tourists", "touristes", "tourists"):
        if cle in foule:
            return int(bool(foule[cle]))

    # La clientele est decrite MAIS les touristes n'y figurent pas : c'est une
    # information, pas une absence. Un lieu decrit comme « Etudiants, Groupes »
    # sans « Touristes » est bien signale comme non touristique.
    return 0


def _url_directe(valeur):
    """
    Deballe les redirections du moteur de recherche.

    Le collecteur renvoie parfois le lien de carte enveloppe :

        /url?q=https://abraccettoparis.com/menu.html&opi=79508299&sa=U&ved=...

    C'est un chemin relatif, inutilisable tel quel : le recolteur web echouerait
    dessus. Mesure sur le premier appel reel : 4 des 4 liens fournis par le
    collecteur etaient enveloppes de cette facon.

    Returns:
        L'URL reelle, ou la valeur d'origine si elle n'est pas enveloppee.
    """
    if not isinstance(valeur, str):
        return valeur
    valeur = valeur.strip()
    if not valeur:
        return None

    if valeur.startswith("/url?") or "google.com/url?" in valeur:
        params = parse_qs(urlparse(valeur).query)
        for cle in ("q", "url"):
            if params.get(cle):
                return unquote(params[cle][0])
        return None

    return valeur if valeur.startswith("http") else None


def _objets_photos(brut) -> list[dict]:
    """
    Rend les objets photo bruts, avec leurs dates et etiquettes.

    La selection par lot (D-031) a besoin de `photo_date` : elle ne peut pas
    travailler sur des URL nues.
    """
    if isinstance(brut, str):
        brut = brut.strip()
        if brut.startswith("["):
            try:
                brut = json.loads(brut)
            except json.JSONDecodeError:
                return []
        else:
            return []
    if not isinstance(brut, list):
        return []
    return [x for x in brut if isinstance(x, dict)]


def _photos(brut) -> list[str]:
    """
    Normalise le champ photos, qui arrive sous des formes très variables :
    liste JSON, chaîne séparée par des virgules, ou liste d'objets.
    """
    if brut is None:
        return []
    if isinstance(brut, str):
        brut = brut.strip()
        if brut.startswith("["):
            try:
                brut = json.loads(brut)
            except json.JSONDecodeError:
                brut = [p.strip() for p in brut.split(",")]
        else:
            brut = [p.strip() for p in brut.split(",")]

    urls = []
    for element in brut if isinstance(brut, list) else [brut]:
        if isinstance(element, str) and element.startswith("http"):
            urls.append(element)
            continue
        if not isinstance(element, dict):
            continue

        # On VERIFIE l'etiquette plutot que de faire confiance au filtre de la
        # requete. Une photo qui n'est pas une carte gaspillerait un appel au
        # modele de vision et pourrait polluer l'indicateur qui pese 0,40.
        tags = element.get("photo_tags")
        if isinstance(tags, list) and tags:
            if not any("menu" in str(x).lower() for x in tags):
                continue

        # `photo_url_big` d'abord : une carte se lit d'autant mieux que la
        # resolution est haute, et la vision est facturee a l'appel, pas au pixel.
        for cle in ("photo_url_big", "original_photo_url", "photo_url",
                    "image_url", "url", "src"):
            v = element.get(cle)
            if isinstance(v, str) and v.startswith("http"):
                urls.append(v)
                break
    return urls[:MAX_PHOTOS]


def _lire(chemin: Path) -> list[dict]:
    """Lit un CSV ou un JSON, sans imposer de structure au-delà du plat."""
    texte = chemin.read_text(encoding="utf-8-sig")

    if chemin.suffix.lower() == ".json":
        donnees = json.loads(texte)
        # Un export encapsule souvent les lignes sous une cle : on descend
        # jusqu'a trouver la premiere liste d'objets.
        while isinstance(donnees, dict):
            listes = [v for v in donnees.values() if isinstance(v, list)]
            if not listes:
                return []
            donnees = listes[0]
        # Certains collecteurs rendent une liste de listes (un bloc par requete).
        if donnees and isinstance(donnees[0], list):
            donnees = [x for bloc in donnees for x in bloc]
        return [d for d in donnees if isinstance(d, dict)]

    return list(csv.DictReader(texte.splitlines()))


# Colonnes alimentees UNIQUEMENT par l'enrichissement externe. Elles peuvent
# etre effacees sans perte : leur source est le fichier brut, conserve sur
# disque, et un reimport les reconstruit a l'identique.
#
# `price` et `price_detail` en font partie bien qu'ils soient calcules, et non
# importes : ils sont extraits du texte des cartes (D-033), donc lies aux
# photos. Si une photo change de restaurant, le prix qui en decoule doit
# suivre — le laisser en place attribuerait au restaurant un prix tire de la
# carte d'un autre.
COLONNES_ENRICHISSEMENT = (
    "reservation_url", "rating", "review_count", "menu_photo_urls",
    "external_source", "external_at", "price_range", "photos_count",
    "tourist_flag", "photos_saturees", "photos_motif", "photo_url",
    "price", "price_detail", "google_place_id",
)


def reinitialiser(conn: sqlite3.Connection, zone: str = None) -> int:
    """
    Efface l'enrichissement externe, pour permettre un reimport propre.

    POURQUOI C'EST NECESSAIRE, ET PAS SEULEMENT PRUDENT. L'import est non
    destructif : il ecrit `coalesce(?, colonne)` pour qu'un fichier partiel
    n'efface pas ce qu'un import precedent avait pose (D-029). Cette garantie
    se retourne contre nous quand la donnee EN PLACE est fausse : une valeur
    mal attribuee survivrait au reimport qui vient justement la corriger.

    Ne touche a AUCUN fait OpenStreetMap : nom, position, cuisine, horaires et
    site web restent intacts. Seule la couche d'enrichissement est retiree.

    Returns:
        Nombre de lignes remises a zero.
    """
    colonnes = ", ".join(f"{c} = NULL" for c in COLONNES_ENRICHISSEMENT)
    sql = f"UPDATE restaurants SET {colonnes}"
    params = []
    if zone:
        sql += " WHERE zone = ?"
        params.append(zone)
    curseur = conn.execute(sql, params)
    conn.commit()
    return curseur.rowcount


def importer(
    conn: sqlite3.Connection,
    chemin: Path,
    zone: str = None,
    source: str = None,
    a_blanc: bool = False,
) -> dict:
    """
    Rattache chaque ligne du fichier à un restaurant connu, puis enrichit.

    N'ÉCRASE JAMAIS un fait OpenStreetMap existant. Les champs OSM ne sont
    complétés que s'ils sont vides ; les champs d'enrichissement (note, avis,
    photos, réservation) sont propres à cette voie et toujours remplacés.
    """
    conn.row_factory = sqlite3.Row

    sql = "SELECT id, name, lat, lng FROM restaurants"
    params = []
    if zone:
        sql += " WHERE zone = ?"
        params.append(zone)
    connus = [dict(r) for r in conn.execute(sql, params)]

    lignes = _lire(chemin)
    print(f"[Import] {len(lignes)} enregistrements lus depuis {chemin.name}")
    print(f"[Import] {len(connus)} restaurants connus" + (f" dans '{zone}'" if zone else ""))

    apparies = sans_position = 0
    rejetes = 0
    avec_photos = avec_menu = 0
    maintenant = datetime.now().isoformat(timespec="seconds")
    curseur = conn.cursor()

    # --- Appariement, en deux temps (D-036) ---
    #
    # On ne decide plus ligne par ligne. Toutes les paires plausibles sont
    # notees d'abord, puis attribuees par score decroissant, chaque fiche et
    # chaque restaurant ne servant qu'une fois. Decider ligne par ligne
    # laissait la premiere fiche venue prendre la place d'une meilleure, et
    # permettait a deux fiches d'ecraser le meme restaurant.
    positionnees = []
    for index, ligne in enumerate(lignes):
        try:
            lat = float(_valeur(ligne, "lat"))
            lng = float(_valeur(ligne, "lng"))
        except (TypeError, ValueError):
            sans_position += 1
            continue
        positionnees.append((index, lat, lng, _valeur(ligne, "name")))

    appariements = _apparier(positionnees, connus)
    rejetes = len(positionnees) - len(appariements)

    for index, _lat, _lng, _nom in positionnees:
        retenue = appariements.get(index)
        if retenue is None:
            continue
        meilleur, distance = retenue
        ligne = lignes[index]

        brut_photos = _valeur(ligne, "menu_photo_urls")
        objets = _objets_photos(brut_photos)

        if objets:
            # Selection par lot (D-031) : une carte publiee en pages l'emporte
            # sur des cliches recents mais partiels.
            retenues, motif = selectionner(objets)
            photos = _photos(retenues)
            # Le collecteur a rendu EXACTEMENT ce qu'on lui demandait : le
            # restaurant en avait probablement davantage, et la carte lue est
            # peut-etre incomplete.
            saturees = 1 if len(objets) >= MAX_PHOTOS else 0
        else:
            photos = _photos(brut_photos)
            motif = None
            saturees = None

        menu = _url_directe(_valeur(ligne, "menu_url"))

        if a_blanc:
            apparies += 1
            if photos:
                avec_photos += 1
            if menu:
                avec_menu += 1
            if apparies <= 10:
                print(f"   {meilleur['name'][:30]:32s} ({distance:3.0f} m)  "
                      f"photos={len(photos)}  menu={'oui' if menu else 'non'}")
            continue

        # Les faits OSM ne sont COMPLÉTÉS que s'ils manquent — jamais écrasés.
        # Un import externe ne doit pas pouvoir dégrader une donnée vérifiée.
        curseur.execute("""
            UPDATE restaurants SET
                phone           = CASE WHEN coalesce(trim(phone),'')         = '' THEN ? ELSE phone END,
                website         = CASE WHEN coalesce(trim(website),'')       = '' THEN ? ELSE website END,
                address         = CASE WHEN coalesce(trim(address),'')       = '' THEN ? ELSE address END,
                opening_hours   = CASE WHEN coalesce(trim(opening_hours),'') = '' THEN ? ELSE opening_hours END,
                menu_url        = CASE WHEN coalesce(trim(menu_url),'')      = '' THEN ? ELSE menu_url END,
                google_place_id = coalesce(google_place_id, ?),
                reservation_url = coalesce(?, reservation_url),
                rating          = coalesce(?, rating),
                review_count    = coalesce(?, review_count),
                -- coalesce(?, colonne) : une valeur absente du fichier courant
                -- LAISSE en place ce qu'un import precedent avait pose. Sans
                -- cela, importer les fiches apres les photos effacait les
                -- photos, le fichier des fiches n'en contenant aucune. Un
                -- import ne doit jamais detruire une donnee deja acquise.
                menu_photo_urls = coalesce(?, menu_photo_urls),
                price_range     = coalesce(?, price_range),
                photos_count    = coalesce(?, photos_count),
                photo_url       = coalesce(?, photo_url),
                tourist_flag    = coalesce(?, tourist_flag),
                photos_saturees = coalesce(?, photos_saturees),
                photos_motif    = coalesce(?, photos_motif),
                external_source = ?,
                external_at     = ?
             WHERE id = ?
        """, (
            _valeur(ligne, "phone"),
            _valeur(ligne, "website"),
            _valeur(ligne, "address"),
            _valeur(ligne, "opening_hours"),
            menu,
            _valeur(ligne, "google_place_id"),
            _valeur(ligne, "reservation_url"),
            _valeur(ligne, "rating"),
            _valeur(ligne, "review_count"),
            json.dumps(photos, ensure_ascii=False) if photos else None,
            _valeur(ligne, "price_range"),
            _valeur(ligne, "photos_count"),
            _valeur(ligne, "photo_url"),
            _tourist_flag(ligne),
            saturees,
            motif,
            source or chemin.stem,
            maintenant,
            meilleur["id"],
        ))

        apparies += 1
        if photos:
            avec_photos += 1
        if menu:
            avec_menu += 1

    if not a_blanc:
        conn.commit()

    return {
        "lus": len(lignes),
        "apparies": apparies,
        "rejetes": rejetes,
        "sans_position": sans_position,
        "avec_photos": avec_photos,
        "avec_menu": avec_menu,
        "a_blanc": a_blanc,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Importe un jeu de donnees externe (CSV ou JSON) dans la base (D-029).",
    )
    parser.add_argument("fichier", help="chemin du CSV ou JSON a importer")
    parser.add_argument("--zone", default=None, help="restreindre l'appariement a une zone")
    parser.add_argument("--source", default=None, help="nom du collecteur, pour l'audit")
    parser.add_argument("--dry-run", action="store_true",
                        help="montre ce qui serait importe sans rien ecrire")
    parser.add_argument("--reinitialiser", action="store_true",
                        help="efface l'enrichissement externe avant d'importer "
                             "(necessaire apres une correction d'appariement)")
    args = parser.parse_args()

    chemin = Path(args.fichier)
    if not chemin.exists():
        print(f"[ERREUR] Fichier introuvable : {chemin}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(config.DB_PATH)
    try:
        if args.reinitialiser and not args.dry_run:
            n = reinitialiser(conn, args.zone)
            cible = f"'{args.zone}'" if args.zone else "toute la base"
            print(f"[Import] enrichissement efface sur {n} lignes de {cible}")
        res = importer(conn, chemin, zone=args.zone, source=args.source,
                       a_blanc=args.dry_run)
    finally:
        conn.close()

    mode = " (A BLANC — rien ecrit)" if res["a_blanc"] else ""
    print(f"\n{'='*62}{mode}")
    print(f"  enregistrements lus     : {res['lus']}")
    print(f"  apparies a un restaurant: {res['apparies']}")
    print(f"  rejetes (hors rayon)    : {res['rejetes']}")
    print(f"  sans coordonnees        : {res['sans_position']}")
    print(f"  avec photos de carte    : {res['avec_photos']}")
    print(f"  avec lien de carte      : {res['avec_menu']}")
    print(f"{'='*62}")
    if not res["a_blanc"] and res["avec_photos"]:
        print("\nEtape suivante — lire les cartes recoltees :")
        print("  python -m backend.ingestion.menu_scan.harvest")


if __name__ == "__main__":
    main()
