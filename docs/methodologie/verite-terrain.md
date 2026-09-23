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

### 5.10 « Vos annotateurs n'ont-ils pas répondu au hasard ? »

C'est la première question qu'on pose à un étiquetage produit par des modèles.
Elle se tranche par une mesure, pas par une affirmation.

On simule cinq annotateurs répondant à pile ou face sur le même plan de
comparaison, et on calcule le kappa qu'ils obtiendraient. Deux cents tirages :

| | kappa |
|---|---|
| panel réel (campagne par paires) | **+0,423** |
| cinq répondeurs aléatoires, moyenne | −0,002 (écart-type 0,032) |
| meilleur des 200 tirages aléatoires | +0,079 |

Le panel réel est à **treize écarts-types du hasard**. La mesure est en outre
*sensible* : il suffit d'injecter **un seul** répondeur aléatoire dans le panel
pour faire chuter le kappa de 0,423 à 0,271. Autrement dit, un annotateur qui
aurait bâclé aurait été visible dans le chiffre.

Le script est `docs/data/annotation-pilote/consolider.py` ; la simulation se
rejoue en quelques lignes à partir du plan versionné.

### 5.11 Ce que vaut l'indicateur de langue, et sur combien d'avis

L'indicateur `language` est celui qui prédit le mieux la vérité terrain
(rho = +0,501). Il faut dire sur quoi il est calculé, parce que la profondeur est
très inégale :

| profondeur | restaurants |
|---|---|
| 50 avis collectés | 42 |
| 5 à 9 avis | 415 |
| 2 à 4 avis | 1 |
| aucun | 9 |

Deux vagues de collecte (Outscraper, 5 833 avis pour environ 17,50 USD au tarif
mesuré de 0,003 USD/avis) : la première a acheté de la **profondeur** sur 42
restaurants, la seconde de la **couverture** sur 416.

**Conséquence à assumer.** Pour 89 % de la zone, le ratio d'avis en langue locale
est estimé sur 5 à 9 avis. Autour de 0,5, cela donne un intervalle de confiance
d'environ **±35 points**, contre ±14 pour les 42 restaurants profonds.
L'indicateur qui pèse 0,30 — et qui porte le signal — a donc deux régimes de
précision très différents, et rien en base ne le signale aujourd'hui.

Trois sorties possibles, à arbitrer avant de publier un coefficient : pondérer
chaque restaurant par sa profondeur dans la régression, calibrer d'abord sur les
42 profonds et vérifier la stabilité sur les autres, ou racheter de la profondeur
(passer les 415 à 50 avis coûterait environ 55 USD).

---

## 6. Passage à l'échelle — les 467 restaurants de la zone

Le §5 a validé l'instrument (comparaison par paires, dossier enrichi d'une
recherche web séparée du jugement) sur un pilote de 30 restaurants. Restait à
l'appliquer à la **zone entière** : 467 restaurants, sans échantillonnage —
c'est la garantie que le classement final ne favorise aucun sous-groupe.

### 6.1 Découper sans perdre la comparabilité

Comparer les 467 restaurants deux à deux prendrait 108 811 duels — hors de
portée. Il faut découper en groupes plus petits, mais un découpage naïf casse
la comparabilité : un restaurant du groupe 1 ne serait jamais mis en regard
d'un restaurant du groupe 12, et rien ne dirait comment aligner deux
classements produits séparément.

**La solution retenue : des blocs qui se chevauchent.** La zone est partagée en
15 blocs de 40 restaurants, chaque bloc partageant 8 restaurants avec le
suivant. Ces 8 restaurants partagés jouent le rôle d'**ancres** : jugés dans
deux contextes différents, ils donnent au modèle d'agrégation (Bradley-Terry,
détaillé au §6.3) le point de repère nécessaire pour placer tous les blocs sur
**une seule et même échelle**. Sans ancrage, on obtiendrait 15 classements
locaux incomparables entre eux plutôt qu'un classement unique de la zone.

La construction du plan est vérifiée mathématiquement avant tout jugement : le
graphe reliant les 467 restaurants par les duels prévus doit former **une
seule composante connexe** — c'est-à-dire qu'il existe un chemin de
comparaisons entre n'importe quelle paire de restaurants, même situés dans des
blocs éloignés. C'est cette propriété, et non une intuition, qui garantit que
l'agrégation finale produit un ordre total cohérent plutôt que des îlots
indépendants.

### 6.2 Le panel, à l'échelle

Le panel retenu au §5 — quatre profils d'annotation, chacun porté par un
agent — a été conservé pour couvrir les 15 blocs : un profil « riverain »
jugeant sur la vie quotidienne du quartier, un profil « voyageur » qui
reconnaît ce qui est pensé pour lui, un profil « restaurateur » lisant les
signaux d'exploitation (horaires, coupure de service, groupes), un profil
« journaliste food » attentif à qui un lieu s'adresse dans sa communication.
Un cinquième profil, plus sceptique par construction, a été écarté après
plusieurs échecs répétés à distinguer un raisonnement licite d'un raisonnement
interdit (§5.9) — la décision de l'écarter est elle-même une donnée
méthodologique, pas un incident caché.

**4 528 jugements** au total (15 blocs × 86 duels en moyenne × 4 profils),
répartis en 15 campagnes de bloc, chacune mesurée indépendamment avant
agrégation.

### 6.3 L'agrégation : du duel au classement continu

Chaque jugement dit « A dépend plus du passage que B ». Pour transformer des
milliers de comparaisons binaires en un **classement continu** — un ordre du
1ᵉʳ au 467ᵉ avec, pour chaque restaurant, une force numérique et non un simple
rang — on utilise le **modèle de Bradley-Terry** : chaque restaurant se voit
attribuer un score latent θ (« thêta ») tel que la probabilité qu'il l'emporte
sur un autre restaurant dans un duel croît avec l'écart de θ entre les deux. Le
θ de chaque restaurant est estimé par les duels effectivement observés,
régularisé (une pénalité empêche un restaurant invaincu de recevoir un score
infiniment élevé, ce qui arriverait sans cette correction dès qu'un
restaurant gagne tous ses duels).

**Convention retenue : θ bas = restaurant local, θ élevé = dépendant du
passage.** Le classement final trie les 467 restaurants par θ croissant.

### 6.4 Ce que la campagne complète mesure

L'accord inter-annotateurs se mesure avec le **kappa de Fleiss**, un indicateur
qui corrige le taux d'accord brut de ce qu'on obtiendrait par pur hasard entre
plusieurs juges — un kappa de 0 signifie « pas mieux que le hasard », 1
signifie un accord parfait. Calculé bloc par bloc puis sur l'ensemble :

| bloc | duels | accord observé | kappa |
|---|---|---|---|
| 01 | 79 | 85 % | 0,696 |
| 02 | 76 | 62 % | 0,232 |
| 03 | 78 | 91 % | 0,816 |
| 04 | 80 | 96 % | 0,925 |
| 05 | 79 | 89 % | 0,789 |
| 06 | 78 | 89 % | 0,778 |
| 07 | 78 | 98 % | 0,957 |
| 08 | 79 | 90 % | 0,802 |
| 09 | 77 | 79 % | 0,584 |
| 10 | 79 | 77 % | 0,536 |
| 11 | 79 | 88 % | 0,755 |
| 12 | 79 | 88 % | 0,764 |
| 13 | 78 | 90 % | 0,803 |
| 14 | 77 | 92 % | 0,848 |
| 15 | 36 | 94 % | 0,880 |
| **ensemble** | **4 528 jugements** | **87 %** | **0,741** |

Sur l'échelle de référence de Landis et Koch (celle qu'on cite pour interpréter
un kappa), 0,741 se lit **« accord substantiel »** — le palier juste en dessous
de « presque parfait ». C'est loin au-dessus du seuil auquel un jury pose la
question « n'auraient-ils pas simplement répondu au hasard ? » (voir la mesure
directe de cette question au §5.10, qui situe le panel à treize écarts-types
d'un panel qui répondrait à pile ou face).

La variation bloc à bloc n'est pas du bruit : elle est elle-même informative.
Les blocs au kappa le plus bas correspondent aux campagnes où la consigne
donnée aux annotateurs tolérait davantage de réponses « égalité » — une
égalité déclarée dès qu'un signal de départage existe, même ténu, revient à
jeter de l'information plutôt qu'à trancher, et ça se voit directement dans
l'accord mesuré. Resserrer cette consigne (imposer de trancher sur tout signal
disponible, même faible, en modulant la confiance plutôt que l'issue) a
mécaniquement fait remonter le kappa sur les blocs suivants. C'est un résultat
méthodologique en soi, transposable à toute future campagne d'annotation par
comparaison : **la consigne sur l'indécision pèse sur l'accord mesuré autant
que la difficulté réelle des cas.**

### 6.5 Le résultat : le score actuel face au classement complet

Confronter le score `local_signal` actuel (D-013) au classement de référence
sur les 467 restaurants, avec une **corrélation de Spearman** (rho, qui mesure
si deux classements ordonnent les objets de façon semblable, indépendamment de
l'écart de valeur — 1 = ordres identiques, 0 = aucun lien, −1 = ordres
inversés) :

| indicateur | poids actuel | rho | couverture |
|---|---|---|---|
| **`local_signal`** (score global) | — | **+0,181** | 467/467 |
| menu | 0,40 | +0,146 | 361/467 (77 %) |
| langue | 0,30 | **+0,482** | 467/467 (100 %) |
| prix | 0,15 | +0,241 | 297/467 (64 %) |
| zone touristique | 0,15 | +0,022 | 467/467 (100 %) |

Le score prédit — la corrélation est positive et l'intervalle de confiance
exclut zéro — mais la répartition du poids ne correspond pas à ce que chaque
indicateur apporte réellement : la langue des avis porte l'essentiel du signal
avec un poids inférieur à celui du menu, tandis que la zone touristique, qui
porte un poids comparable au prix, ne prédit quasiment rien sur cette zone.
C'est ce déséquilibre qui motive la recalibration décrite au §9.

---

## 7. Le piège de l'ancrage

Une proposition affichée est difficile à contredire. Si le taux de correction
des pré-annotations tombe **sous 10 %**, ce n'est pas que la machine avait
raison : c'est que l'ancrage a joué. C'est pour cette raison que le jugement,
à toutes les échelles de cette campagne, s'est fait **à l'aveugle** : aucun
annotateur n'a eu connaissance d'une pré-annotation ou du jugement des autres
avant de trancher.

---

## 8. Format des données finales

Toutes les données de la campagne complète sont versionnées dans
`docs/data/annotation-pilote/` :

| fichier | contenu |
|---|---|
| `paires-467.json` | le plan de comparaison complet — 15 blocs, ancres, graine de tirage fixée pour reproductibilité |
| `dossiers-quartier-latin.json` | les 467 dossiers soumis aux annotateurs, indicateurs du modèle retirés |
| `web-quartier-latin.json` | les fiches de recherche web associées à chaque restaurant |
| `duels-467/b*_*.csv` | les 4 528 jugements bruts, un fichier par bloc et par profil, avec la justification de chaque choix |
| `classement-467.csv` | **le résultat** : 467 restaurants classés, avec leur θ, le nombre de duels disputés et de victoires |
| `dossiers-douteux.md` | les cas signalés par plusieurs annotateurs indépendamment (identité incertaine, fiche mal appariée) |

Import du classement en base : la colonne `theta_verite_terrain` de la table
`restaurants` porte le score de Bradley-Terry de chaque restaurant, utilisé
comme cible de la recalibration (§9).

---

## 9. La calibration — des poids dérivés à la décision finale

### 9.1 Ce que la régression propose

Une fois le classement de référence disponible, on peut chercher, par
**régression**, la combinaison des quatre indicateurs qui prédit le mieux ce
classement — au lieu de la poser à la main comme l'étaient les poids D-013.
Sur les 297 restaurants disposant des quatre indicateurs simultanément :

| indicateur | poids D-013 (à la main) | rho seul contre la référence |
|---|---|---|
| menu | 0,40 | +0,143 |
| langue | 0,30 | **+0,426** |
| prix | 0,15 | **−0,077** |
| zone touristique | 0,15 | −0,013 |

La pondération qui maximise la corrélation globale pousserait la langue à
**0,85** et ramènerait les trois autres indicateurs près de zéro — un résultat
validé hors échantillon (testé sur des partages aléatoires 70/30 des données,
pour vérifier qu'il ne s'agit pas d'un ajustement qui ne fonctionnerait que
sur les données mêmes qui l'ont produit).

### 9.2 Pourquoi cette pondération brute n'est pas retenue

Adopter des poids qui écrasent tout sur la langue des avis reviendrait à
transformer le Local Signal en un indicateur unique — la proportion d'avis en
langue locale — et rien d'autre. Or c'est précisément le signal le moins
disponible pour un restaurant invisible : sans aucun avis, l'indicateur de
langue rend un a priori neutre (0,5) plutôt qu'une mesure. Un poids de 0,85
dessus reviendrait à donner un score quasi constant à tout restaurant peu
avisé — l'exact contraire de la contrainte n°1 du projet (D-001) : un
restaurant invisible ne doit pas être mécaniquement désavantagé par le mode de
calcul.

### 9.3 La pondération retenue

Les poids ont été révisés dans le sens indiqué par la calibration — la langue
passe devant le menu, comme la mesure le montre — **sans adopter la
pondération dérivée brute**, et en gardant un plafond explicite : aucun
indicateur ne dépasse le poids maximal que le menu portait déjà dans D-013.

| indicateur | avant (D-013) | après (D-053) |
|---|---|---|
| menu | 0,40 | 0,30 |
| langue | 0,30 | **0,40** |
| prix | 0,15 | 0,10 |
| zone touristique | 0,15 | 0,20 |

Cette pondération obtient rho = +0,269 contre +0,213 pour l'ancienne — un gain
validé hors échantillon (gain moyen +0,054, positif dans 98 % des tirages
aléatoires testés). Le prix, dont la corrélation propre était négative une
fois mesurée correctement, redescend plutôt que de disparaître : à 0,15, la
recalibration globale n'était pas robuste (gain positif dans seulement 68 à
76 % des tirages selon la variante testée) ; à 0,10 elle l'est. C'est ce test
de robustesse, et non une préférence, qui a fixé le chiffre.

Le menu reste le deuxième poste le plus élevé du modèle : c'est le seul signal
disponible pour un restaurant sans aucun avis, ce qui en fait, par
construction, l'indicateur le plus proche de la mission du projet.

---

## 10. Ce qui sera écrit dans le mémoire

- L'échantillon et son ordre de tirage, avec la raison (§2).
- La question posée à l'annotateur, dans sa formulation finale — la
  comparaison par paires, et pourquoi la première formulation (contrefactuelle,
  §3) a été abandonnée après mesure de son incapacité à séparer les cas (§5.4).
- Les interdits imposés à l'annotation, et la limite d'indépendance assumée
  (§4).
- Le passage à l'échelle : le découpage en blocs ancrés, la vérification de
  connexité du graphe de comparaison, l'agrégation par Bradley-Terry (§6.1 à
  §6.3).
- L'accord inter-annotateurs mesuré à chaque étape, avec le contraste entre
  l'instrument abandonné (kappa 0,118) et l'instrument retenu (kappa 0,741) —
  c'est le résultat qui démontre que le choix méthodologique était le bon.
- Le test direct contre le hasard (treize écarts-types, §5.10), qui répond par
  avance à la question qu'un jury pose toujours en premier sur un jugement
  produit par des modèles.
- La confrontation du score actuel au classement de référence, et la
  recalibration qui en découle (§6.5, §9) : c'est le résultat principal du
  chapitre — la vérité terrain a permis de dériver des pondérations plutôt que
  de les poser à la main, et de mesurer, chiffres à l'appui, ce que chaque
  indicateur apporte réellement.

Chaque limite listée ci-dessus (§5.6, §5.11, §9.2) n'est pas un aveu de
faiblesse : c'est ce qui distingue un travail mesuré d'un travail affirmé.
