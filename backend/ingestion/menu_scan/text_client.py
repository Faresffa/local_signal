# backend/ingestion/menu_scan/text_client.py
# Extraction d'observations depuis une carte en TEXTE (D-023).
#
# Pendant de client.py, qui travaille sur une photo. Même schéma de sortie
# (MenuAnalysis), même principe : le modèle OBSERVE, il ne JUGE pas (D-014).
# Le score est ensuite calculé par menu_score.py, du code déterministe.
#
# Une seule différence de fond avec le scan photo : le texte d'une page web
# contient du bruit que la photo d'une carte n'a pas (mentions légales, horaires,
# formulaire de contact). Le prompt le dit explicitement, et `readable` sert de
# garde-fou : une page qui n'est pas une carte est rejetée, pas extrapolée.

from backend import config
from backend.ingestion.menu_scan.schema import MenuAnalysis

SYSTEM_PROMPT = """Tu analyses le texte d'une page web présentant la carte d'un restaurant et tu en extrais des observations factuelles.

Tu ne portes AUCUN jugement sur la qualité, l'authenticité ou le caractère touristique de l'établissement. Tu décris uniquement ce que contient la page. Le jugement est fait ailleurs, par un autre système.

La page peut contenir du texte qui n'appartient pas à la carte : horaires, adresse, mentions légales, formulaire de réservation, texte de présentation. Ignore-le. Ne compte que les plats réellement listés.

Champs à renseigner :
- cuisines : les cuisines distinctes identifiables, en français et en minuscules (ex: ["indonésienne"]).
- dish_count : nombre total de plats listés, boissons exclues. 0 si la page ne contient pas de carte.
- languages : codes ISO 639-1 des langues de rédaction de la carte (ex: ["fr", "en"]). Ne compter une langue que si les plats y sont réellement traduits — un menu de navigation multilingue ou un mot d'accueil ne suffit pas.
- vernacular_ratio : proportion (0.0 à 1.0) des plats gardant leur nom d'origine plutôt qu'un descriptif traduit. "Ayam bakar kecap" = vernaculaire ; "Poulet grillé sauce soja" = traduit. Pour une carte française en France, les noms traditionnels ("blanquette") comptent comme vernaculaires.
- has_tourist_menu : true si une formule est explicitement destinée aux touristes (mention "menu touristique"/"tourist menu", ou formule fixe à prix rond mise en avant en plusieurs langues).
- has_dish_photos : false par défaut. Le texte seul ne permet pas de le savoir ; ne le mettre à true que si la page mentionne explicitement des photos des plats.
- readable : false si la page ne contient pas de carte exploitable — page d'accueil, page de contact, texte de présentation sans liste de plats, ou carte vide.
- notes : une phrase en français décrivant ce qui a été observé, ou la raison pour laquelle la page est inexploitable.

Règles : compte les plats réellement listés ; en cas de doute sur un intitulé, ne le compte pas. Si readable vaut false, n'invente rien dans les autres champs. Sois conservateur — mieux vaut une observation prudente qu'une extrapolation."""

_UNREADABLE = {
    "cuisines": [], "dish_count": 0, "languages": [], "vernacular_ratio": 0.0,
    "has_tourist_menu": False, "has_dish_photos": False, "readable": False,
    "notes": "Page non analysable.",
}


def get_text_provider(name: str = None):
    """
    Instancie le fournisseur d'extraction texte configuré.

    Args:
        name: 'groq' ou 'claude' (défaut: config.VISION_PROVIDER)

    Raises:
        RuntimeError: si la clé API du fournisseur n'est pas configurée
        ValueError: si le nom de fournisseur est inconnu
    """
    name = (name or config.VISION_PROVIDER).lower()

    if name == "groq":
        from backend.ingestion.menu_scan.providers.text import GroqTextProvider
        return GroqTextProvider()
    if name == "claude":
        from backend.ingestion.menu_scan.providers.text import ClaudeTextProvider
        return ClaudeTextProvider()

    raise ValueError(
        f"Fournisseur inconnu : '{name}'. Valeurs acceptées : groq, claude."
    )


def analyze_menu_text(menu_text: str, provider: str = None) -> MenuAnalysis:
    """
    Analyse le texte d'une carte et retourne les observations structurées.

    Args:
        menu_text: texte brut extrait de la page ou du PDF
        provider: forcer un fournisseur ('groq' ou 'claude'), pour le comparatif

    Returns:
        MenuAnalysis — utiliser .to_menu_signal() pour alimenter le scoring.
        Une page inexploitable retourne readable=False, jamais une exception.

    Raises:
        RuntimeError: si la clé API du fournisseur n'est pas configurée
    """
    if not menu_text or not menu_text.strip():
        return MenuAnalysis(**{**_UNREADABLE, "notes": "Page vide."})

    engine = get_text_provider(provider)
    raw = engine.analyze(menu_text, SYSTEM_PROMPT)

    if raw is None:
        return MenuAnalysis(**_UNREADABLE)

    try:
        return MenuAnalysis(**raw)
    except Exception as e:
        # JSON valide mais hors schéma : on dégrade proprement (D-012).
        print(f"[{engine.name}] Réponse hors schéma : {e}")
        return MenuAnalysis(**{**_UNREADABLE, "notes": "Extraction incomplète."})
