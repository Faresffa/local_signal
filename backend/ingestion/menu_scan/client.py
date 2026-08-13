# backend/ingestion/menu_scan/client.py
# Scan de carte par modèle de vision — le cœur de l'apport IA du projet (D-004).
#
# L'utilisateur photographie la carte affichée en vitrine ; le modèle extrait des
# observations structurées ; le scoring déterministe en tire un score.
# C'est le seul signal disponible pour un restaurant sans aucun avis — la réponse
# directe au paradoxe de l'invisibilité (D-001).
#
# Le fournisseur de vision est interchangeable (D-017) : Groq par défaut,
# Claude en alternative. Ce module ne connaît que l'interface, jamais le modèle.

from backend import config
from backend.ingestion.menu_scan.schema import MenuAnalysis

# Le prompt demande des OBSERVATIONS, jamais un jugement d'authenticité (D-014).
# Il fait partie de la méthode : toute modification doit être consignée dans
# docs/DECISIONS.md, au même titre qu'une pondération.
SYSTEM_PROMPT = """Tu analyses la photo d'une carte de restaurant et tu en extrais des observations factuelles.

Tu ne portes AUCUN jugement sur la qualité, l'authenticité ou le caractère touristique de l'établissement. Tu décris uniquement ce qui est visible sur la carte. Le jugement est fait ailleurs, par un autre système.

Champs à renseigner :
- cuisines : les cuisines distinctes identifiables, en français et en minuscules (ex: ["indonésienne"]).
- dish_count : nombre total de plats listés, boissons exclues. 0 si illisible.
- languages : codes ISO 639-1 des langues de rédaction (ex: ["fr", "en"]). Ne compter une langue que si les plats y sont réellement traduits — un mot d'accueil ne suffit pas.
- vernacular_ratio : proportion (0.0 à 1.0) des plats gardant leur nom d'origine plutôt qu'un descriptif traduit. "Ayam bakar kecap" = vernaculaire ; "Poulet grillé sauce soja" = traduit. Pour une carte française en France, les noms traditionnels ("blanquette") comptent comme vernaculaires.
- has_tourist_menu : true si une formule est explicitement destinée aux touristes (mention "menu touristique"/"tourist menu", ou formule fixe à prix rond mise en avant en plusieurs langues).
- has_dish_photos : true si la carte affiche des photographies des plats.
- readable : false si la photo est floue, sombre, coupée, ou ne montre pas une carte.
- notes : une phrase en français décrivant ce qui a été observé.

Règles : compte les plats réellement listés ; en cas de doute sur un intitulé, ne le compte pas. Si readable vaut false, n'invente rien dans les autres champs. Sois conservateur — mieux vaut une observation prudente qu'une extrapolation."""

_UNREADABLE = {
    "cuisines": [], "dish_count": 0, "languages": [], "vernacular_ratio": 0.0,
    "has_tourist_menu": False, "has_dish_photos": False, "readable": False,
    "notes": "Image non analysable.",
}


def get_provider(name: str = None):
    """
    Instancie le fournisseur de vision configuré.

    Args:
        name: 'groq' ou 'claude' (défaut: config.VISION_PROVIDER)

    Raises:
        RuntimeError: si la clé API du fournisseur n'est pas configurée
        ValueError: si le nom de fournisseur est inconnu
    """
    name = (name or config.VISION_PROVIDER).lower()

    if name == "groq":
        from backend.ingestion.menu_scan.providers.groq_provider import GroqVisionProvider
        return GroqVisionProvider()
    if name == "claude":
        from backend.ingestion.menu_scan.providers.claude_provider import ClaudeVisionProvider
        return ClaudeVisionProvider()

    raise ValueError(
        f"Fournisseur de vision inconnu : '{name}'. Valeurs acceptées : groq, claude."
    )


def analyze_menu_image(
    image_bytes: bytes,
    filename: str = "menu.jpg",
    provider: str = None,
) -> MenuAnalysis:
    """
    Analyse une photo de carte et retourne les observations structurées.

    Args:
        image_bytes: contenu binaire de l'image
        filename: nom du fichier, utilisé pour déduire le type MIME
        provider: forcer un fournisseur ('groq' ou 'claude'), pour le comparatif

    Returns:
        MenuAnalysis — utiliser .to_menu_signal() pour alimenter le scoring.
        Une carte illisible retourne readable=False, jamais une exception.

    Raises:
        RuntimeError: si la clé API du fournisseur n'est pas configurée
        ValueError: si le format d'image n'est pas supporté
    """
    vision = get_provider(provider)
    raw = vision.analyze(image_bytes, filename, SYSTEM_PROMPT)

    if raw is None:
        return MenuAnalysis(**_UNREADABLE)

    try:
        return MenuAnalysis(**raw)
    except Exception as e:
        # Le modèle a répondu du JSON valide mais hors schéma (champ manquant,
        # mauvais type). On dégrade proprement plutôt que de propager (D-012).
        print(f"[{vision.name}] Réponse hors schéma : {e}")
        return MenuAnalysis(**{**_UNREADABLE, "notes": "Extraction incomplète."})
