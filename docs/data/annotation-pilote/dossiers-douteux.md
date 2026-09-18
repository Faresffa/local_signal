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
