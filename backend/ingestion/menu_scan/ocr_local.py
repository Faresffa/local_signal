# backend/ingestion/menu_scan/ocr_local.py
#
# LECTURE LOCALE DES CARTES — OCR puis extraction (D-032).
#
# Remplace l'envoi de l'image à un service distant par deux étapes locales :
#
#     photo  →  OCR (RapidOCR, ONNX, hors ligne)  →  texte
#     texte  →  champs déterministes en Python    →  la moitié des observations
#     texte  →  modèle de langue local            →  les deux champs sémantiques
#
# POURQUOI. Le palier gratuit du service distant plafonne à 200 000 jetons par
# jour, et une image de carte en consomme environ 2 950 : soit 68 pages
# quotidiennes, donc seize jours pour les 1 120 pages du Quartier latin. En
# local, il n'y a ni quota ni facture, et le traitement complet tient en
# quelques heures.
#
# CE QUE L'OCR CHANGE POUR LA MÉTHODE, et c'est le point important.
#
# Quatre des six observations n'ont plus besoin d'un modèle du tout :
#
#     dish_count        compté sur les motifs de prix
#     languages         détecté sur le texte
#     has_tourist_menu  repéré par vocabulaire
#     has_dish_photos   déduit de l'absence de texte sur une image chargée
#
# Un nombre de plats COMPTÉ PAR DU CODE est reproductible et auditable ; le même
# nombre rendu par un modèle ne l'est pas. C'est le principe de D-014 — le
# modèle observe, il ne juge pas — poussé un cran plus loin : là où du code
# déterministe suffit, le modèle n'a rien à faire.
#
# Il ne reste au modèle que les deux champs qui demandent vraiment du sens :
# la ou les cuisines, et la proportion de noms conservés en langue d'origine.

import re
import unicodedata

# Un prix sur une carte prend deux formes, et il faut les deux :
#
#   avec marqueur   « 11 € », « 16 E », « 12 EUR »
#   avec décimale   « 15,5 », « 16.50 »  — UNE ou deux décimales
#
# La première version n'acceptait que deux décimales et manquait « 15,5 »,
# pourtant la forme la plus courante sur une carte française : cinq prix sur
# sept étaient perdus sur la carte d'essai. Une seule décimale suffit donc, et
# c'est sans risque — un nombre à virgule dans une description de plat est
# rarissime.
#
# Borné à trois chiffres : au-delà ce n'est plus un prix mais une année ou un
# fragment de numéro de téléphone.
_PRIX = re.compile(
    r"(?<![\d,.])\d{1,3}(?:[.,]\d{1,2})?\s*(?:€|EUR\b|E\b|euros?)"
    r"|(?<![\d,.])\d{1,3}[.,]\d{1,2}(?![\d])",
    re.IGNORECASE,
)

# Formules qui s'adressent explicitement au passage plutôt qu'à l'habitué.
_MENU_TOURISTE = re.compile(
    r"\b(menu\s+touristique|tourist\s+menu|touristen|men[uú]\s+tur[íi]stico|"
    r"set\s+menu|menu\s+fixe)\b",
    re.IGNORECASE,
)

# Lignes qui ne sont pas des plats : entêtes, mentions légales, horaires.
_NON_PLAT = re.compile(
    r"^(carte|menu|nos\s|la\s+carte|boissons?|drinks?|vins?|service|"
    r"tva|siret|ouvert|horaires?|tel|www|http|@)",
    re.IGNORECASE,
)


def _sans_accent(texte: str) -> str:
    """Forme comparable, pour les recherches de vocabulaire."""
    return "".join(
        c for c in unicodedata.normalize("NFD", texte)
        if unicodedata.category(c) != "Mn"
    ).lower()


# Une ligne qui ne contient QU'UN NOMBRE ENTIER est un prix.
#
# Beaucoup de cartes francaises ecrivent « 24 » sans virgule ni symbole, le
# tarif etant aligne seul dans une colonne. Mesure sur « Au Moulin a Vent » :
# ses prix sont tous de cette forme, et le comptage rendait ZERO plat sur une
# carte de 155 lignes.
#
# Borne entre 3 et 199 : en dessous ce n'est pas un plat de restaurant, au-dela
# c'est une annee, un numero de rue ou un fragment de telephone.
_PRIX_SEUL = re.compile(r"^\s*(\d{1,3})\s*$")


def compter_plats(lignes: list[str]) -> int:
    """
    Compte les plats d'après les prix relevés.

    UN PRIX, UN PLAT. C'est l'hypothèse, et elle est bonne sur une carte de
    restaurant : chaque intitulé porte son tarif. Elle échoue sur les cartes qui
    annoncent plusieurs formats — « 12 / 18 € » pour une demi-portion et une
    entière — mais ce cas gonfle le compte de quelques unités, il ne le fausse
    pas d'un ordre de grandeur.

    L'alternative — demander le nombre à un modèle — donnerait un chiffre non
    reproductible d'un appel à l'autre, ce qui interdirait toute calibration.
    """
    total = 0
    for ligne in lignes:
        nue = ligne.strip()
        if _NON_PLAT.match(nue):
            continue

        trouves = len(_PRIX.findall(nue))
        if trouves:
            total += trouves
            continue

        # Aucun prix formate : la ligne est-elle un nombre seul ?
        m = _PRIX_SEUL.match(nue)
        if m and 3 <= int(m.group(1)) <= 199:
            total += 1
    return total


def dedupliquer_pages(pages: list[list[str]], seuil: float = 0.7) -> list[list[str]]:
    """
    Ecarte les pages qui montrent la meme chose.

    Cinq photos d'un restaurant ne sont pas toujours cinq pages distinctes :
    plusieurs clients photographient souvent LA MEME page. Concatener sans
    verifier double alors le nombre de plats — mesure sur « Au Lys d'Argent »,
    dont le comptage montait a 138.

    La comparaison porte sur l'ensemble des lignes, pas sur leur ordre : une
    meme page photographiee sous deux angles donne les memes intitules dans un
    ordre parfois different.

    Args:
        seuil: part des lignes communes au-dela de laquelle deux pages sont
            tenues pour identiques.
    """
    retenues: list[list[str]] = []
    empreintes: list[set] = []

    for page in pages:
        if not page:
            continue
        empreinte = {l.strip().lower() for l in page if len(l.strip()) > 3}
        if not empreinte:
            continue

        doublon = False
        for autre in empreintes:
            communes = len(empreinte & autre)
            if communes / min(len(empreinte), len(autre)) >= seuil:
                doublon = True
                break

        if not doublon:
            retenues.append(page)
            empreintes.append(empreinte)

    return retenues


def detecter_langues(texte: str) -> list[str]:
    """
    Codes ISO des langues de la carte — RENVOIE UNE LISTE VIDE PAR DÉFAUT.

    La détection automatique de langue échoue sur une carte, et il faut le dire
    plutôt que de propager un résultat faux. Mesuré sur la carte d'Amarvi, une
    carte franco-italienne : `langdetect` a répondu « allemand, anglais ».

    Trois raisons à cet échec, toutes structurelles :
      - une carte est une liste de syntagmes nominaux, pas de la prose ;
      - l'OCR rend le texte en capitales et perd les accents, deux indices
        majeurs pour un détecteur ;
      - les noms de plats étrangers dominent le vocabulaire sans que la carte
        soit rédigée dans cette langue.

    Or la langue est l'entrée d'un indicateur qui pèse 0,30 (D-024) : une
    détection fausse y ferait plus de dégâts qu'une absence, que le moteur sait
    traiter en redistribuant le poids (D-012).

    Ce champ est donc laissé au modèle de langue, qui lit les intitulés et
    distingue « rédigé en italien » de « nom de plat italien dans une carte
    française ». La fonction est conservée pour le cas d'un texte assez long
    et assez rédigé pour que la détection ait un sens.
    """
    texte = texte.strip()
    # Seuil volontairement haut : en dessous, une carte n'offre pas assez de
    # matière pour que la détection statistique signifie quelque chose.
    if len(texte) < 400:
        return []
    try:
        from langdetect import detect_langs, DetectorFactory
        DetectorFactory.seed = 0  # rend la détection déterministe
        return [str(l.lang) for l in detect_langs(texte.lower()) if l.prob >= 0.25]
    except Exception:
        return []


def a_menu_touriste(texte: str) -> bool:
    """Vrai si la carte annonce une formule destinée au passage."""
    return bool(_MENU_TOURISTE.search(_sans_accent(texte)))


def observations_deterministes(lignes: list[str]) -> dict:
    """
    Ce qu'on établit sans modèle, à partir du seul texte relevé.

    Returns:
        dict des quatre champs calculables, plus le texte reconstitué pour
        l'étape sémantique.
    """
    texte = "\n".join(lignes)
    return {
        "dish_count": compter_plats(lignes),
        # Laissé vide à dessein : voir `detecter_langues`. Le modèle tranche.
        "languages": detecter_langues(texte),
        "has_tourist_menu": a_menu_touriste(texte),
        # Une carte photographiée d'où l'OCR ne tire presque rien alors que
        # l'image est chargée est probablement une carte en images de plats.
        "has_dish_photos": len(texte) < 120 and len(lignes) > 0,
        "texte": texte,
    }
