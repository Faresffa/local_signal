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

### 5.4 Tentative écartée : un panel de cinq agents LLM

*(Menée le 17 septembre 2026. Résultat négatif, conservé — [D-042](../DECISIONS.md).)*

L'annotation humaine du §5.2 n'ayant pas commencé alors que tout le reste du
chemin critique était prêt, cinq agents LLM ont été substitués aux cinq
annotateurs, sur un **pilote de 30 restaurants** — délibérément pas sur les 467.

Trois précautions ont été prises. **Cinq profils distincts** — riverain,
voyageur, restaurateur, journaliste food, sceptique — répartis sur **trois
modèles différents**, pour décorréler autant que possible des juges qui restent
de même nature. **Jugement à l'aveugle**, sans la colonne `proposition` ni les
`indices` : le §6 identifie l'ancrage comme risque principal, le supprimer donne
une mesure d'accord non polluée. **Audit automatique** des justifications contre
les quatre interdits du §4.

**Ce que ça a donné.**

| mesure | valeur |
|---|---|
| accord observé, toutes paires | 50 % |
| accord attendu par hasard | 43 % |
| **kappa de Fleiss** | **0,118** |
| kappa binaire, sujets tranchés | 0,200 (meilleure variante) |

Accord négligeable sur l'échelle de Landis & Koch, dans toutes les variantes
testées. **La campagne n'a pas été étendue et aucune étiquette n'est entrée en
base.**

**Le résultat important n'est pas l'échec du panel, c'est sa cause.** 59 % des
150 jugements disent `local`, 7 % disent `touristique`. La question du §3 est
**asymétrique** : il faut un cas extrême pour répondre « il fermerait », presque
tout établissement survit en perdant une partie de son chiffre. Elle est
décidable, comme voulu — elle ne **sépare** pas.

Ce diagnostic vaut **aussi pour l'annotation humaine à venir**. Rien n'indique
que cinq membres de l'équipe échapperaient à une question qui pousse 59 % des
réponses dans la même classe. Le pilote a donc testé l'instrument avant de
l'employer, ce qui était son intérêt principal.

Deux précisions d'honnêteté. Le déséquilibre des classes gonfle l'accord attendu
par hasard et écrase mécaniquement le kappa (*paradoxe du kappa*, Feinstein &
Cicchetti 1990) — mais l'accord observé n'est lui-même que de 50 %, donc
l'effondrement n'est pas un simple artefact statistique. Et l'audit a relevé
**une violation franche de l'interdit n°4 sur 150 jugements**, chez l'agent au
modèle le plus léger : *« MAIS rue de la Bûcherie est rue ultra-touristique face
Notre-Dame »*. Les interdits tiennent, mais ils ne tiennent pas seuls.

Tout est conservé dans `docs/data/annotation-pilote/` — les cinq annotations avec
leurs justifications et leurs sources, le consolidé, le script de mesure.

**Piste ouverte :** passer de l'étiquette absolue à la **comparaison par paires**
(« entre A et B, lequel dépend le plus des visiteurs ? »). L'accord sur des
comparaisons est structurellement plus élevé, et l'agrégation produit directement
le classement continu que cherche la §5.3 — celui dont `precision@10` a besoin.

### 5.5 L'instrument retenu : la comparaison par paires

*(Menée le 17 septembre 2026 — [D-043](../DECISIONS.md).)*

Le §5.4 a montré que la question du §3 ne sépare pas. Elle a été remplacée par
une question **relative**, posée sur deux restaurants à la fois :

> **« Lequel de ces deux restaurants dépend le plus de la clientèle de
> passage ? »**

Elle n'a pas de réponse par défaut : on ne peut pas répondre « local » soixante
fois de suite. Et son agrégation produit **directement le classement continu**
que cherche la §5.3, au lieu de trois classes à l'intérieur desquelles tout reste
indistinct.

**Deux changements l'accompagnent.**

*Le dossier remplace la consigne.* L'annotateur ne reçoit plus une fiche complète
assortie d'interdits, mais un dossier d'où les quatre indicateurs ont été retirés
(`backend/db/dossier_annotation.py`). « Ces informations étaient absentes du
dossier » se vérifie ; « nous avions interdit ce raisonnement » ne se vérifie
pas. Effet secondaire décisif : l'annotation ne dépend plus de ce que le web
renvoyait ce jour-là, donc **elle est rejouable**.

*Le plan de comparaison est construit* (`backend/db/paires.py`) : k permutations
refermées en cycle, ce qui garantit un graphe connexe — un tirage au hasard
risquerait deux groupes jamais comparés entre eux, donc deux classements sans
échelle commune. L'ordre gauche/droite est tiré indépendamment pour chaque
annotateur, ce qui neutralise le biais de position et permet de le mesurer.

**Ce que ça donne**, à panel constant — mêmes profils, mêmes modèles qu'au §5.4,
pour n'isoler que l'instrument :

| panel | accord observé | kappa |
|---|---|---|
| étiquetage en 3 classes (§5.4) | 50 % | 0,118 — négligeable |
| par paires, 5 annotateurs | 71 % | **0,423 — modéré** |
| par paires, sans l'annotateur contaminé | 76 % | **0,519 — modéré** |
| par paires, A+B+D | 80 % | **0,605 — substantiel** |

Biais de position mesuré entre 42 % et 57 % selon l'annotateur — aucun au-delà du
seuil d'alerte.

**Le contrôle qui a servi à quelque chose.** Le champ « nombre de photos
publiées » figurait dans la première version du dossier : il semblait décrire
l'activité d'un lieu. L'audit des justifications a montré qu'un annotateur en
avait tiré **98 % de ses motifs**, et que son accord avec les autres chutait
d'une vingtaine de points. Le nombre de photos est un proxy de notoriété — un
restaurant invisible a peu de photos *parce qu'il est invisible* ([D-001](../DECISIONS.md)).
Le champ a été retiré. **Un champ n'est pas neutre parce qu'on l'a jugé neutre ;
il l'est quand on a regardé ce que les annotateurs en font.**

### 5.6 Première confrontation du score à la vérité terrain

Corrélation de Spearman entre le classement obtenu et le score actuel, sur les
30 restaurants du pilote :

| | poids | rho |
|---|---|---|
| **`local_signal`** | — | **+0,081** · IC95 % [−0,29 ; +0,43] |
| menu | 0,40 | +0,266 |
| langue | 0,30 | −0,003 |
| prix | 0,15 | **+0,459** |
| zone touristique | 0,15 | +0,112 |

Le score actuel **n'a aucun pouvoir prédictif mesurable** sur ce pilote, et le
résultat est robuste au choix du panel. Les deux indicateurs qui portent 0,45 du
poids ne corrèlent pas ; celui qui corrèle le mieux en porte 0,15.

Ce n'est pas un échec du projet, c'est le point de départ dont le chapitre
calibration avait besoin : les pondérations ont été **posées à la main**
([D-006](../DECISIONS.md)), et voilà ce que ça vaut. La question n'est plus
« pourquoi 0,30 ? » mais « que donne une pondération dérivée ? ».

**Trois réserves, à énoncer avant qu'on les trouve.** n = 30, donc tous les
intervalles de confiance contiennent zéro et aucune corrélation n'est
significative isolément. Une corrélation marginale n'est pas un coefficient de
régression multiple. Et la vérité terrain employée ici est **agentique, pas
humaine** : ce qui est établi, c'est que l'instrument par paires fonctionne là où
l'instrument par classes échouait — pas que ces étiquettes valent celles d'un
panel d'habitants.

> Les chiffres ci-dessus portent sur le panel complet et sur la condition « base
> seule ». Le §5.7 reprend la mesure avec des sources web et un panel épuré : le
> score reste sans pouvoir prédictif (rho = +0,007), ce qui rend le constat
> **robuste à la façon de construire la vérité terrain**.

### 5.7 Ajouter le web sans perdre la reproductibilité

*(Menée le 17 septembre 2026 — [D-044](../DECISIONS.md).)*

Le §5.5 a validé la comparaison par paires, mais sur des dossiers tirés de la
seule base. Croiser des **sources extérieures** était pourtant l'intention de
départ. Le problème est de coût : chercher le web à chaque duel demanderait
environ 7 000 recherches sur la zone entière, et une annotation adossée à des
recherches faites en direct n'est pas rejouable.

**La solution est de séparer la collecte du jugement.**

*Phase 1, des documentalistes.* Une recherche **par restaurant**, pas par duel —
467 recherches au lieu de 7 000. Leur règle tient en une phrase : **ils
observent, ils ne jugent pas.** Ils rapportent presse francophone, guides pour
visiteurs, site officiel, réseaux sociaux, avec les URL, et écrivent « aucune
mention trouvée » là où il n'y a rien. C'est le principe de [D-014](../DECISIONS.md)
— le modèle qui observe n'est pas celui qui note — appliqué à une autre tâche.

*Phase 2, les juges.* Les mêmes duels, sur dossier enrichi. Le dossier étant figé,
**l'annotation reste rejouable**.

**Les trois conditions, sur les 30 mêmes restaurants et le même panel :**

| condition | base | web | accord | kappa |
|---|---|---|---|---|
| étiquettes en 3 classes | non | oui | 50 % | 0,118 |
| duels | oui | non | 76 % | 0,519 |
| **duels enrichis** | **oui** | **oui** | **83 %** | **0,655 — substantiel** |

**Le web apporte de l'information, pas du bruit** — et c'est une distinction
qu'on peut trancher au lieu de la supposer. Chaque annotateur a révisé environ
**27 % de ses duels**, et l'accord entre eux a **monté**. Du bruit produirait
l'inverse : beaucoup de révisions, moins d'accord.

Conséquence à assumer : **le classement final change**. Les deux classements ne
corrèlent entre eux qu'à rho = +0,562. Le choix des sources déplace le résultat,
il n'est pas un réglage de second ordre.

### 5.8 Trois pièges rencontrés, et ce qu'ils valent

**Le faux signal du site multilingue.** Trois établissements déclinent leur site
dans une liste de langues quasi identique : c'est le **template d'un prestataire
web**, pas un choix éditorial. Un annotateur s'en est servi pour reclasser deux
restaurants ; un autre l'a repéré et neutralisé. À écarter explicitement des
consignes de la campagne complète.

**Une hypothèse séduisante, et fausse.** Un annotateur a soutenu que la presse
food francophone favorise les restaurants français au détriment des cuisines
étrangères — ce qui invaliderait la couverture différentielle du README.
Vérification : **44 % de couverture pour les cuisines européennes, 42 % pour les
autres.** L'hypothèse ne tient pas. Elle est notée ici parce qu'elle sonne juste,
et que c'est exactement pour ça qu'il faut la compter plutôt que la croire.

**La couverture différentielle ne fonctionne que d'un côté.** 13 restaurants sur
30 ont une mention en presse francophone, 5 seulement en guides pour visiteurs.
La soustraction `presse locale − guides touristiques` se réduit donc en pratique
à `presse locale`, ce qui rouvre le biais de notoriété que [D-001](../DECISIONS.md)
interdit. À dire dans le mémoire, et à ne pas utiliser seul.

### 5.9 Un annotateur qui échoue trois fois, et pourquoi c'est utile

Le même agent — profil « sceptique », le seul du panel sur le modèle le plus
léger — a échoué aux trois campagnes, de trois manières différentes :

| campagne | mode d'échec |
|---|---|
| étiquettes | viole l'interdit n°4 : « rue ultra-touristique face Notre-Dame » tranche son étiquette |
| duels | fonde 98 % de ses jugements sur le nombre de photos, un proxy de notoriété |
| duels enrichis | **comprend la question à l'envers** — son rapport écrit « B = dépend MOINS » |

En condition 3, son accord avec les autres tombe à 43–47 %, soit **sous le
hasard**. Inverser mécaniquement ses réponses ne le rattrape pas.

Ce qu'il faut en retenir n'est pas qu'un agent a mal travaillé, mais que **les
contrôles l'ont vu à chaque fois** — audit des justifications, corrélation entre
critères invoqués et accord, comparaison à un répondeur aléatoire simulé. Un
panel sans ces contrôles aurait intégré ses réponses sans rien remarquer.

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
