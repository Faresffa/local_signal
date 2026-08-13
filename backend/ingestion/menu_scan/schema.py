# backend/ingestion/menu_scan/schema.py
# Schéma de sortie du scan de carte (D-004).
#
# PRINCIPE DE CONCEPTION — le modèle OBSERVE, il ne JUGE pas.
#
# Le LLM extrait uniquement des faits vérifiables de la photo : combien de plats,
# quelles cuisines, quelles langues, y a-t-il une formule « menu touriste ».
# Il ne lui est JAMAIS demandé « ce restaurant est-il authentique ? ».
#
# Le score est ensuite calculé par du code déterministe (menu_score.py), à partir
# de ces observations. C'est essentiel pour trois raisons :
#   1. Reproductibilité — deux scans de la même carte donnent le même score.
#   2. Auditabilité — on peut expliquer chaque point du score (D-009).
#   3. Calibration — les seuils sont ajustables sur le jeu labellisé (D-006)
#      sans réécrire un prompt ni relancer d'inférence.
# Un LLM à qui l'on demande directement une note produit un chiffre non
# reproductible et incalibrable — indéfendable en soutenance.

from pydantic import BaseModel, Field


class MenuAnalysis(BaseModel):
    """Observations extraites d'une photo de carte de restaurant."""

    cuisines: list[str] = Field(
        description=(
            "Cuisines distinctes identifiables sur la carte, en français et en "
            "minuscules (ex: ['indonésienne'], ['française', 'italienne']). "
            "Une seule entrée si la carte est monocuisine."
        )
    )
    dish_count: int = Field(
        description=(
            "Nombre total de plats listés (entrées, plats, desserts confondus). "
            "Ne pas compter les boissons. 0 si illisible."
        )
    )
    languages: list[str] = Field(
        description=(
            "Codes ISO 639-1 des langues dans lesquelles la carte est rédigée "
            "(ex: ['fr'], ['fr', 'en', 'es']). Une langue n'est comptée que si "
            "les plats y sont réellement traduits, pas pour un mot isolé."
        )
    )
    vernacular_ratio: float = Field(
        description=(
            "Proportion (0.0 à 1.0) des plats dont le nom est conservé dans la "
            "langue d'origine de la cuisine plutôt que traduit en descriptif "
            "générique. 'Ayam bakar kecap' = vernaculaire ; 'Poulet grillé sauce "
            "soja' = traduit. Pour une carte française en France, compter comme "
            "vernaculaire les noms de plats traditionnels (ex: 'blanquette')."
        )
    )
    has_tourist_menu: bool = Field(
        description=(
            "true si la carte propose une formule explicitement destinée aux "
            "touristes : mention 'menu touristique'/'tourist menu', ou formule "
            "fixe entrée+plat+dessert à prix rond mise en avant en plusieurs langues."
        )
    )
    has_dish_photos: bool = Field(
        description=(
            "true si la carte affiche des photographies des plats. Signal "
            "touristique fort : une carte photo s'adresse à un client qui ne "
            "sait pas lire les intitulés."
        )
    )
    readable: bool = Field(
        description=(
            "false si la photo est trop floue, trop sombre, coupée ou ne montre "
            "pas une carte de restaurant. Les autres champs sont alors sans valeur."
        )
    )
    notes: str = Field(
        description=(
            "Une phrase en français décrivant ce qui a été observé, ou la raison "
            "pour laquelle la carte est illisible."
        )
    )

    def to_menu_signal(self) -> dict | None:
        """
        Convertit l'analyse au format attendu par
        backend.core.scoring.menu_score.score_menu().

        Returns:
            dict de signaux, ou None si la photo est inexploitable — auquel cas
            le moteur redistribue le poids du signal menu (D-012) plutôt que de
            pénaliser le restaurant.
        """
        if not self.readable:
            return None

        return {
            "cuisines": self.cuisines,
            "dish_count": self.dish_count,
            "languages": self.languages,
            "vernacular_ratio": self.vernacular_ratio,
            "has_tourist_menu": self.has_tourist_menu,
            "has_dish_photos": self.has_dish_photos,
        }
