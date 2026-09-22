# Dossiers signalés comme douteux par les annotateurs

**Établi le 18 septembre 2026, pendant la campagne sur les 467.**

Chaque juge est invité à signaler tout dossier qui lui paraît incohérent, et à
baisser sa confiance plutôt que d'inventer un jugement. Cette liste rassemble ce
qui est remonté. Le contrôle vaut ce qu'il vaut : **plusieurs juges ont désigné
les mêmes fiches sans se concerter**, ce qui en fait un signal fiable — bien plus
que l'audit technique de la base, qui ne voit aucun de ces cas.

> **Pourquoi c'est important, et pas un détail de propreté.** Un dossier mal
> apparié fait entrer du **bruit d'identité** dans l'accord inter-annotateurs :
> deux juges peuvent diverger parce qu'ils lisent deux établissements différents,
> pas parce qu'ils jugent différemment. Le kappa mesure alors la qualité de la
> donnée, pas celle du protocole. Ces fiches doivent être écartées ou
> dépondérées avant l'agrégation finale.

## Avis échangés entre établissements — le défaut le plus grave

Découvert par recoupement entre juges sur les blocs 6 à 10. **Ce n'est pas une
anomalie isolée : c'est un défaut d'appariement de la collecte Outscraper**, et il
faut le chercher systématiquement avant d'exploiter les avis d'un établissement.

| paire | ce qu'on observe |
|---|---|
| **Li Thang** ↔ **Anatolie Dürüm** | Li Thang, annoncé tibétain, porte des avis de dürüm et baklava ; Anatolie Dürüm, snack turc halal, porte des avis d'une table feutrée avec carte des vins et filet mignon de porc |
| **Le Mékong** ↔ **CROUS Censier** | Le Mékong, vietnamien tenu par un couple, porte des avis de restaurant universitaire (carte Izly, file d'attente, RU Cuvier) ; le CROUS porte des avis de brasserie familiale française |
| **Dame** ← **Notre-Dame** | le restaurant « Dame » (rue Suger) porte les avis de **la cathédrale** : restauration après l'incendie, messes, « un monument à voir une fois dans sa vie » |

Autres cas d'avis manifestement étrangers à la fiche : **Le Coupe-Chou**
(gastronomique français du XVIIᵉ, huit avis sur huit parlent de pizzas),
**Le Petit Châtelet** (français annoncé, avis décrivant du fatteh syrien),
**Hébé** (restaurant de chef à 50-75 €, avis d'un sandwich à 10 €),
**Les Balkans** (catalogué pizzeria, avis décrivant une cuisine indonésienne),
**Le Nouveau Village chez Momo** (fiche marocaine, avis taïwanais).

## Identité non résolue — à écarter du jeu

| établissement | problème | signalé par |
|---|---|---|
| **Sanuki** | site `latlas-paris.com`, les 9 avis parlent tous de « L'Atlas », brasserie de fruits de mer. Fiche Google d'un autre établissement à la même adresse | A, B, C, D |
| **La Fontaine Saint-Michel** | catégorie `attractions` — c'est un monument, les avis portent sur des travaux de restauration | A, B, C, D |
| **En face** | trois enseignes au 28 rue des Écoles (« En face », « En Face de La Petite Périgourdine », « L'Élica »), cuisine annoncée italienne, sous-types français/pizzeria, avis incohérents entre eux | A, B, C, D |
| **L'île de Crête** | trois localisations concurrentes (rue Blainville / rue Mouffetard / place de la Contrescarpe), site `auvieuxcedre.eatbu.com`, un avis décrit un kebab | A, B, C, D |
| **Saveurs d'Asie** | aucun établissement à l'adresse du CSV, un avis cite le 31 rue Monge — et trois fiches homonymes existent dans la zone au même numéro | A, B, C, D |
| **L'Époque** | aucune adresse en base, identification par élimination, au moins deux homonymes parisiens | A, B, C, D |
| **Le Nouveau Village chez Momo** | fiche annoncée marocaine à couscous, avis décrivant sans ambiguïté un taïwanais (bubble tea, bœuf braisé) | B, D |
| **NA** | nom manquant dans la source, ambigu avec une enseigne réelle « NA » au 48 rue Gay-Lussac ; aucun avis collecté | B, C, D |
| **Xiu** | site renseigné `tomygousset.com/hugo-and-co`, sans rapport avec un vietnamien de la rue Monge | A, B, D |
| **Les Pipos** | site renseigné `nossa-paris.com` | A, B |

## Établissement probablement fermé — à vérifier

| établissement | source |
|---|---|
| **La Cava Voltini** | liquidation judiciaire prononcée le 06/02/2026 (registre d'entreprises) |
| **Safran** | plusieurs avis évoquent une liquidation et des réservations non honorées |
| **Pizza Hut** (Quartier latin) | une source le donne fermé en 2026, d'autres actif |
| **Le Val de Grace** | registre suggérant une fermeture en 2016 |
| **Ribouldingue** | une source évoque une fermeture, non confirmée |

## Nom erroné dans la source OSM — à corriger

| en base | réel |
|---|---|
| Atelier Carmen | **L'Atelier Carnem** (5 rue du Pot de Fer) — aucune source sous « Carmen » |
| El Sur | **Café El Sur** |
| Bistrot Vin Sobre | **Le Vin Sobre** |
| Le Solstice | **Solstice** |
| Petit Gaston | référencé « GASTON » |

## Hors périmètre — pas des restaurants

| établissement | nature réelle |
|---|---|
| **La Fontaine Saint-Michel** | monument |
| **MONK La Taverne de Cluny** | bar à bières avec programmation live ; dossier très pauvre |

## Autres anomalies relevées

- **Gemini Family** : plusieurs avis décrivent une autre adresse du même groupe (Convention).
- **Pizzeria Luciana** : les avis 1 et 2 sont le même texte dupliqué — l'échantillon réel est de 7, pas 8.
- **Piment thaï** : un avis nomme un autre établissement (« Thai Samut »).
- **Le Petit Cluny** : au moins trois enseignes de noms proches rue de la Harpe, numéro variant de 19 à 32.
- **Le Petit Cardinal** : code postal 75015 en base pour un établissement du 5ᵉ.
- **Au grand bol** / **Hanoï** : deux identifiants OSM consécutifs pour la même adresse.
- **L'Atelier des Nouilles** : catégorisé `japanese`, décrit partout comme chinois.
- **Yokorama** : le domaine `yokorama.com` en base est devenu un site de paris sportifs.

## Défaut de génération — corrigé, mais il a affecté les blocs 1 à 9

La source encode un jour fermé par la chaîne `"Fermé"`, pas par une liste vide.
`dossier_annotation.py` comptait donc ces jours comme ouverts : **56 restaurants
sur 467** étaient annoncés « ouverts 7 jours sur 7 » alors qu'ils ferment un ou
deux jours. C'est le signal que les annotateurs utilisent en priorité, donc ces
fiches étaient systématiquement tirées vers « dépendant du passage ».

Repéré par un juge voyant le résumé contredire le détail jour par jour — lequel,
lui, était correct. Corrigé à partir du bloc 10. La version réellement soumise aux
blocs 1 à 9 est archivée sous `dossiers-v1-avec-bug-horaires.json`.

Exemples : Sushiyaki, La Ferrandaise, Hon Ki, Kitchen Ter(re) — tous annoncés 7j/7,
tous fermés le dimanche.

## Ce qu'il faut en faire

1. **Écarter du classement** les dix fiches d'identité non résolue, et les deux
   hors périmètre. Elles représentent environ **2,5 % de la zone** — la perte est
   acceptable, la contamination ne l'est pas.
2. **Vérifier les fermetures** avant de publier un classement qui les
   recommanderait.
3. **Corriger les noms** dans la source, et remonter les corrections à OSM : le
   projet consomme cette base, autant l'améliorer.
4. **Recalculer l'accord inter-annotateurs sans ces fiches** — c'est la mesure
   propre, celle qui dit ce que vaut le protocole plutôt que ce que vaut la donnée.

---

# Blocs 12 à 15 — ce que la fin de campagne a fait remonter

*Ajouté le 22 septembre 2026, à l'achèvement des 467.*

Même protocole que ci-dessus : chaque annotateur signale ce qui lui paraît
incohérent et baisse sa confiance plutôt que d'inventer un jugement. **Aucun des
quatre ne voit ce que les autres écrivent.** Quand les quatre désignent la même
fiche, ce n'est pas une impression.

## Avis appartenant à un autre établissement

Le défaut d'appariement de la collecte, déjà constaté sur les blocs 6 à 10, se
retrouve intact jusqu'à la fin de la zone.

| établissement | ce que dit la fiche | ce que disent les avis | signalé par |
|---|---|---|---|
| **Salvia** (rue Cujas) | café-restaurant d'hôtel | un **éditeur de progiciels immobiliers** — « hotline injoignable », « leader en gestion de la dette » | A, B, C |
| **Vita** (rue de l'École de Médecine) | restaurant italien, chef Angelo Cavalieri | couscous, tajines, et un établissement nommé **« La Soummam »** | A, B, C |
| **Café de la Tourelle** | « plats français de tradition », bar en zinc | lasagnes végétariennes, soba, tiramisu pistache, et le nom **« bouillon de l'île »** | les 4 (blocs 14 et 15) |
| **L'Avant Comptoir de la Mer** | enseigne « de la Mer » | un avis décrit **« De la Terre »** et son ouverture en 2010 ; le champ site web pointe vers `/avant-comptoir-de-la-terre` | B, C, D |
| **Hanoï** | vietnamien familial | des avis du **Petit Châtelet** (steaks au feu de bois) | A, D |
| **Bouillon de l'île** | — | des avis de **« Vita Ristorante »** | A, B, C, D |
| **Ayadi Gourmet** | — | une mention de **« Hebe »** | A, D |
| **SOS Chef** (rue Suger) | cuisine bio à emporter | un avis loue **« le service de réception des colis »** | les 4 |

**Le cas « Café de la Tourelle » mérite d'être raconté dans le mémoire.** Les
quatre annotateurs l'ont désigné, sur deux blocs différents, et trois d'entre eux
ont repéré que le mot « bouillon de l'île » — nom d'un *autre* établissement du
corpus — apparaissait dans ses avis. Le défaut circule donc **entre deux fiches
qui sont toutes deux dans le jeu**.

## Identité non résolue

| établissement | problème |
|---|---|
| **Maison de Gyros** | **deux fiches distinctes** portent ce nom (26 rue de la Huchette et rue de la Harpe) alors que les duels n'en désignent qu'une. Les quatre annotateurs ont jugé sur le profil commun aux deux — même format, même amplitude — mais l'appariement reste ambigu |
| **L'Ardoise** (parvis Guillaume de Champeaux) | horaires en base limités au midi en semaine, avis décrivant des dîners et situant le lieu près du Louvre. Correspond vraisemblablement à l'homonyme du 1ᵉʳ |
| **La Rôtisserie** (quai de la Tournelle) | les sources web pointent **La Rôtisserie d'Argent**, annexe d'un étoilé ; les avis décrivent une **rôtisserie-traiteur de quartier** (poulets à emporter, actifs du voisinage). Les deux profils sont incompatibles et mènent à des positions opposées dans le classement |
| **Sésame** (rue Danton) | aucune source rattachée à l'adresse ; dossier sans horaires ni attributs |
| **Quartier Général** | identification non confirmée entre « Quartier Général » et « Café Le Quartier Général » |
| **Au Vieux Cèdre** | partage l'adresse 187 rue Saint-Jacques avec **Pizzeria Luciana** dans la base |

## Établissements possiblement fermés

**Mo Sarpi** (un avis « 好像关店了 », un autre décrivant un changement
d'exploitant en mars 2024) et **Sabraj** (statut contradictoire entre Yelp et le
site officiel). Si ces établissements n'existent plus, leurs duels devraient
sortir du corpus — un classement qui ordonne des restaurants fermés ordonne du
vide.

## Erreurs de catégorie, sans mélange d'établissement

- **L'Atelier des Nouilles** — classé `japanese` en base, décrit partout comme
  chinois (nouilles de Lanzhou).
- **Kokoro** — cuisine `japanese`, sous-type « Restaurant français ». Cohérent
  avec une table franco-japonaise, mais **de nature à fausser un indicateur menu
  automatique** qui lirait la catégorie.
- **Loufoque** — bar à jeux avant d'être un restaurant ; jugé sur son modèle
  économique (réservation obligatoire, 5 €/personne pour les jeux).

## Dossiers trop pauvres pour être comparés aux autres

**Mo Sarpi**, **Quartier Général** et **Sésame** n'ont ni horaires, ni attributs
Google, ni catégorie. Les jugements qui les impliquent reposent presque
uniquement sur le contenu des avis. Les annotateurs ont baissé leur confiance en
conséquence — c'est précisément à quoi sert ce champ — mais si un désaccord
apparaît dans l'agrégation, c'est là qu'il faut regarder d'abord.

**Rocaille** n'a aucun avis collecté du tout.

## Ce qu'il faut en retenir pour le mémoire

Le contrôle par annotateurs **trouve ce que l'audit technique ne voit pas**. Une
vérification automatique de la base ne détecte aucun de ces cas : les champs sont
remplis, les types sont bons, les identifiants existent. C'est la lecture par
quelqu'un qui cherche à comprendre l'établissement qui fait apparaître qu'un
restaurant vietnamien porte les avis d'un steakhouse.

Et le défaut est **systématique, pas anecdotique** : il traverse les quinze blocs,
des premiers aux derniers. Ce n'est pas une poignée de fiches à corriger à la
main, c'est l'appariement de la collecte externe qu'il faut revoir.
