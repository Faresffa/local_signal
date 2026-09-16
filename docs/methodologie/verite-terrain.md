# Vérité terrain — protocole et méthode employée

*Zone : Quartier latin (Paris 5ᵉ / 6ᵉ), 467 restaurants.*

Ce document existe pour que rien de ce qui a été décidé ne se perde d'ici la
rédaction du mémoire. Il décrit **ce qui a été fait**, pas une intention.

> **Règle de tenue de ce document.** Chaque section dit ce qui a réellement eu
> lieu, y compris ce qui n'a pas marché. Un protocole décrit ici et non appliqué
> doit être marqué comme tel — la section méthodologie d'un mémoire porte tout
> le reste, et c'est la première que le jury attaque.

---

## 1. Pourquoi une vérité terrain

Les quatre pondérations du Local Signal — carte 0,40, langue 0,30, prix 0,15,
zone 0,15 — ont été **posées à la main**. Sans jeu labellisé, « pourquoi 0,30 ? »
n'a pas de réponse, et toute la calibration repose sur du sable
([D-006](../DECISIONS.md)).

La vérité terrain sert à deux choses :

1. **Dériver les poids** au lieu de les choisir (LS-09).
2. **Mesurer `precision@10`** contre le top 10 de Google trié par note — le
   résultat principal du mémoire (LS-10).

---

## 2. L'échantillon

**Les 467 restaurants de la zone**, c'est-à-dire la totalité. Pas
d'échantillonnage : la zone entière est annotée.

L'ordre de traitement est `substr(hex(id), -6)` — un tirage **aléatoire vis-à-vis
de la notoriété**, et reproductible. C'est le même ordre que celui de la collecte
d'avis (D-040), ce qui garantit qu'une interruption à mi-parcours laisse un
sous-ensemble non biaisé plutôt que « les plus connus d'abord ».

Trier par nombre d'avis aurait rempli les premiers rangs de restaurants
touristiques : le paradoxe de l'invisibilité, reconstitué dans le jeu censé le
mesurer (D-001).

---

## 3. La question posée à l'annotateur

Une seule, identique pour tous :

> **« Si on retirait tous les touristes de Paris demain, ce restaurant
> survivrait-il ? »**

| Réponse | Étiquette |
|---|---|
| Oui, sans problème | **local** |
| Il perdrait beaucoup mais tiendrait | **mixte** |
| Il fermerait | **touristique** |
| Impossible à trancher | **je ne sais pas** |

**Pourquoi cette formulation.** Elle est contrefactuelle, donc décidable : on ne
demande pas une impression mais une prédiction sur un monde précis. Et elle colle
exactement à la promesse du produit — trouver les restaurants qui vivent de leur
quartier.

**« Je ne sais pas » est une réponse valable.** Forcer un choix sur un
établissement qu'on n'arrive pas à juger fabrique du bruit qu'on prendra ensuite
pour du signal.

### Deux confusions à écarter explicitement

Elles doivent être dites en préambule, parce que ce sont les réflexes naturels.

**Ce n'est pas la qualité.** Un attrape-touristes peut très bien cuisiner ; un
bistrot de quartier peut être médiocre. On ne note pas si c'est bon.

**Ce n'est pas l'authenticité de la cuisine.** Un restaurant coréen tenu par des
Coréens pour les étudiants de Jussieu est **local**. Un bistrot français rue de
la Huchette affichant « soupe à l'oignon » en six langues est **touristique**. Ce
qu'on mesure, c'est **la clientèle, pas le drapeau**.

---

## 4. Ce que l'annotateur ne doit pas regarder

Interdits, et la raison est la même pour les quatre :

- lire la carte, compter les plats ou les langues qui y figurent
- ouvrir les avis et regarder dans quelle langue ils sont écrits
- comparer les prix à ceux du quartier
- raisonner « c'est à 200 m de Notre-Dame, donc touristique »

**Ce sont exactement les quatre indicateurs du modèle.** Si l'étiquette en
dérive, on ne mesure plus que la capacité de l'algorithme à se reproduire
lui-même. C'est une faille qu'un jury identifie immédiatement.

### Limite assumée : l'indépendance n'est pas totale

Il faut le dire dans le mémoire plutôt que de le laisser trouver.

Une photo de devanture peut montrer un panneau de menu en six langues — et « le
nombre de langues sur la carte » est l'un de nos indicateurs. L'annotateur ne
peut pas ne pas le voir. Interdire les vérifications explicites réduit la
contamination ; cela ne l'annule pas.

**Ce qui est revendiqué :** l'étiquette ne *dérive* pas d'une valeur calculée par
le modèle. **Ce qui n'est pas revendiqué :** une indépendance statistique
parfaite entre l'étiquette et les indicateurs.

### Ce qui reste comme preuve

Le lien Google Maps de chaque ligne : la devanture, la rue, la salle, et **qui
est attablé sur les photos**. Plus la pré-annotation machine (§5), à lire comme
un avis et non comme une réponse.

---

## 5. Les trois sources qui produisent l'étiquette

L'étiquette finale vient de **trois apports combinés**. Aucun ne suffit seul.

### 5.1 Pré-annotation automatique

`backend/db/preannotation.py` propose une étiquette et **affiche les indices qui
l'ont produite**, pour que la relecture porte sur « suis-je d'accord ? » plutôt
que sur une page blanche.

Sources utilisées, toutes extérieures au modèle :

| Source | Couverture | Exemple d'indice |
|---|---|---|
| Attributs Google (`about`) | 403 / 467 | « Clientèle / Touristes », « Populaire pour / Petit déjeuner » |
| Grille de fréquentation (`popular_times`) | 138 / 467 | rapport midi-semaine ÷ week-end |
| Catégories Google (`subtypes`) | 397 / 467 | « Restaurant gastronomique », « Traiteur » |
| Description éditoriale Google | 189 / 467 | « créé en 1845 », « de quartier » |

**Le meilleur indice est la fréquentation.** Un habitué déjeune près de chez lui
en semaine ; un visiteur vient le week-end et le soir. Ce rapport sépare deux
publics sans rien dire de la cuisine, du prix ni de l'emplacement.

**Correction appliquée, à rapporter.** Au premier jet, seuls 25 restaurants sur
467 étaient proposés « local » — 5 %, alors que c'est la classe qui porte le
projet. Cause mesurée : « Clientèle / Touristes » est présent chez 304
restaurants sur 467 et pesait +2,0. **Il décrivait le Quartier latin, pas le
restaurant.** Chaque poids est désormais divisé par la fréquence de l'attribut
(pondération par fréquence inverse). Résultat : 117 locaux, 108 mixtes, 113
touristiques, 129 sans assez d'indices.

**Ce que la pré-annotation vaut, mesuré.** Contrôle contre les avis réellement
collectés sur 42 restaurants : médiane de 55 % d'avis français pour les « local »
contre 44 % pour les « touristique ». La direction est bonne, **la séparation est
faible**, et il subsiste des erreurs franches — *La Petite Bouclerie* proposée
« local » avec 6 % d'avis français. C'est une aide à la relecture, pas une vérité
terrain.

**Ajouter des sources n'a pas aidé.** `subtypes` et la description éditoriale ont
été ajoutés puis mesurés : la séparation est passée de 11 points à 8. Le facteur
limitant n'est pas le *nombre* de sources — aucun de ces attributs n'encode
réellement « local contre touristique ».

### 5.2 Annotation humaine

**Cinq annotateurs**, membres de l'équipe. Chacun traite un bloc de
l'échantillon, en répondant à la question du §3 et en respectant les interdits du
§4.

Les annotateurs ont également **mangé dans plusieurs des restaurants du Quartier
latin**. Cette expérience directe informe leur jugement ; elle ne constitue pas
un protocole d'observation systématique et ne doit pas être présentée comme tel.

**Les 50 premiers restaurants sont annotés deux fois**, par deux personnes
différentes, afin de mesurer l'**accord inter-annotateurs**. Sans ce chiffre, on
ne sait pas si l'étiquette décrit le restaurant ou celui qui l'a posée — et c'est
la question que pose un jury devant tout étiquetage humain.

**Un désaccord non arbitré n'entre pas en base.** Une étiquette dont on sait
qu'elle est contestée fausserait la calibration sans qu'on s'en aperçoive.

### 5.3 Classement multi-sources

*(Section à compléter au fur et à mesure de sa construction.)*

Un classement continu du 1ᵉʳ au dernier restaurant, construit à partir de
plusieurs sources externes, pour départager ce que les étiquettes en trois
classes laissent indistinct.

**Contrainte à respecter et à documenter ici :** toute source qui recoupe un
indicateur du modèle crée une circularité. La langue des avis est notre
indicateur — s'en servir pour bâtir le classement rendrait l'évaluation
invalide. Chaque source retenue sera listée ici avec ce qu'elle apporte et le
risque de recoupement qu'elle porte.

---

## 6. Le piège de l'ancrage

Une proposition affichée est difficile à contredire. Si le taux de correction des
pré-annotations tombe **sous 10 %**, ce n'est pas que la machine avait raison :
c'est que l'ancrage a joué.

`python -m backend.db.preannotation --comparer <fichier>` mesure ce taux après
coup, précisément pour pouvoir le dire. En dessous du seuil, un sous-échantillon
doit être repris **colonne `proposition` masquée**.

---

## 7. Format

`docs/data/verite-terrain-quartier-latin.csv`, séparateur `;`, encodage UTF-8
avec BOM (sans quoi Excel casse les accents).

| Colonne | Contenu |
|---|---|
| `rang`, `id`, `nom`, `adresse`, `lien` | identification, lien Google Maps |
| `proposition`, `confiance`, `indices` | pré-annotation machine et ses preuves |
| `etiquette_finale` | **la décision humaine — vide au départ** |
| `corrigee`, `remarque` | suivi |

`etiquette_finale` n'est **pas** pré-remplie avec la proposition : la recopier
la ferait passer pour un choix.

Import en base : `python -m backend.db.verite_terrain --importer <fichier>`

---

## 8. Ce qui sera écrit dans le mémoire

- l'échantillon et son ordre de tirage, avec la raison (§2)
- la question exacte posée aux annotateurs (§3)
- les interdits **et la limite d'indépendance assumée** (§4)
- les trois sources et leur combinaison (§5)
- l'accord inter-annotateurs mesuré (§5.2)
- le taux de correction des pré-annotations (§6)
- le fait que la pré-annotation sépare faiblement, avec le chiffre (§5.1)

Ce dernier point n'est pas un aveu de faiblesse : c'est ce qui distingue un
travail mesuré d'un travail affirmé.
