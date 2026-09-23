# Pilotes d'annotation à cinq agents — 17 septembre 2026

**Trois campagnes** menées le même jour sur les 30 mêmes restaurants, avec le
**même panel** — mêmes profils, mêmes modèles — pour n'isoler qu'une variable à
la fois : d'abord l'instrument d'annotation, puis les sources d'information.

| campagne | instrument | accord observé | kappa |
|---|---|---|---|
| 1 — [D-042](../../DECISIONS.md) | étiquette en 3 classes | 50 % | 0,118 — négligeable |
| 2 — [D-043](../../DECISIONS.md) | comparaison par paires | 76 % | 0,519 — modéré |
| 3 — [D-044](../../DECISIONS.md) | **par paires + recherche web** | **83 %** | **0,655 — substantiel** |

*(campagnes 2 et 3 sur le panel A+B+C+D ; l'annotateur E est écarté, voir plus bas.)*

**Changer l'instrument multiplie le kappa par plus de cinq**, et ajouter des
sources extérieures le pousse au palier « substantiel ». C'est le résultat
principal, et il vaut pour le panel humain autant que pour celui-ci.

## Le panel

| agent | profil | modèle |
|---|---|---|
| A | le riverain — habite le 5ᵉ, juge sur la vie ordinaire du quartier | Opus |
| B | le voyageur — reconnaît ce qui est conçu pour les gens comme lui | Sonnet |
| C | le restaurateur — lit les signaux d'exploitation, horaires, modèle | Sonnet |
| D | la journaliste food — à qui le lieu s'adresse, comment il se raconte | Opus |
| E | le sceptique — cherche la preuve à charge | Haiku |

---

## Campagne 1 — étiquetage en trois classes

**Résultat négatif, conservé.** Voir [§5.4 du protocole](../methodologie/verite-terrain.md).

Chaque agent a répondu aux trois questions du protocole — étiquette, confiance,
preuve — en cherchant sur le web, **sans voir la pré-annotation machine** et sous
les quatre interdits du §4.

**Kappa de Fleiss = 0,118.** Campagne non étendue aux 467, **aucune étiquette
entrée en base**. Cause : 59 % des 150 jugements disent `local`, 7 % disent
`touristique`. La question *« si on retirait tous les touristes, survivrait-il ? »*
est asymétrique — presque tout établissement survit en perdant une partie de son
chiffre. Elle est décidable, elle ne sépare pas.

| fichier | contenu |
|---|---|
| `lot30.csv` | ce qui a été soumis — sans `proposition` ni `indices` |
| `annot-A.csv` … `annot-E.csv` | les cinq annotations, avec justification et sources |
| `consolide.csv` | les cinq étiquettes côte à côte, le consensus, la comparaison à la machine |
| `consolider.py` | le script de mesure |

```bash
python docs/data/annotation-pilote/consolider.py
```

### Ce qui en reste d'utilisable

- **4 restaurants unanimes 5/5** (La Ferrandaise, Bicla, Pirosmani, L'Estrapade)
  et 9 à 4/5 : sur les cas francs, le panel converge.
- **Une correction de donnée source** : le rang 23 est nommé « Atelier Carmen »
  dans OSM ; l'établissement au 5 rue du Pot de Fer est « L'Atelier Carnem ».
  Trouvé indépendamment par deux annotateurs.
- **Une violation d'interdit mesurée** : 1 sur 150 jugements, agent E, interdit
  n°4 (raisonnement par la zone). Le chiffre compte autant que l'interdit.

---

## Campagne 2 — comparaison par paires

Même panel, même échantillon, instrument différent. 86 duels, 430 jugements,
**aucune recherche web** : les annotateurs ont travaillé sur des dossiers figés
produits depuis la base, donc la campagne est **rejouable à l'identique** — ce
qu'une annotation adossée au web ne permet pas.

La question posée : *« Lequel de ces deux restaurants dépend le plus de la
clientèle de passage ? »*

| fichier | contenu |
|---|---|
| `dossiers-quartier-latin.json` | les 30 dossiers soumis — les quatre indicateurs en sont retirés |
| `paires.json` | le plan de comparaison, et l'ordre gauche/droite propre à chaque annotateur |
| `paires-A.csv` … `paires-E.csv` | les 86 jugements de chacun, avec leur raison |
| `classement-base.csv` | le classement Bradley-Terry, du plus local au plus dépendant du passage |

```bash
python -m backend.db.bradley_terry --campagne base --annotateurs ABCD
```

Régénérer les dossiers et le plan depuis la base :

```bash
python -m backend.db.dossier_annotation --zone quartier-latin --taille 30
```

```bash
python -m backend.db.paires --taille 30 --tours 3
```

**Attention :** les jugements versionnés ici ont été rendus sur une version du
dossier qui contenait encore le champ « nombre de photos », retiré depuis. Les
régénérer ne reproduit donc plus exactement ce qui a été soumis — c'est
volontaire, et c'est documenté dans le module.

### Biais de position : aucun

42 % à 57 % de réponses « celui de gauche » selon l'annotateur, tous sous le seuil
d'alerte. L'ordre ayant été tiré indépendamment pour chacun, l'écart serait
visible s'il existait.

### Le contrôle qui a servi à quelque chose

Le champ « nombre de photos publiées » figurait dans la première version du
dossier : il semblait décrire l'activité d'un lieu. L'audit des justifications a
montré qu'un annotateur en avait tiré **98 % de ses motifs** — contre 13 % et 1 %
pour deux autres — et que son accord avec le reste du panel chutait d'une
vingtaine de points. Le nombre de photos est un proxy de notoriété : un
restaurant invisible a peu de photos *parce qu'il est invisible*
([D-001](../../DECISIONS.md)). Le champ a été retiré.

**Un champ n'est pas neutre parce qu'on l'a jugé neutre ; il l'est quand on a
regardé ce que les annotateurs en font.**

### Le score actuel face à ce classement

Sur le panel complet, `local_signal` donne rho = +0,081 · IC95 % [−0,29 ; +0,43].
Aucun pouvoir prédictif mesurable, et une pondération qui semble inversée : les
deux indicateurs qui portent 0,45 du poids ne corrèlent pas, celui qui corrèle le
mieux en porte 0,15. Le détail par indicateur, et la reprise de la mesure avec le
panel épuré, figurent au tableau de la campagne 3 ci-dessous.

**n = 30 : tous les intervalles contiennent zéro.** C'est une direction, pas une
preuve — et c'est le point de départ dont le chapitre calibration avait besoin.

---

## Campagne 3 — comparaison par paires, dossier enrichi d'une recherche web

Mêmes 30 restaurants, mêmes 86 duels, même panel. Deux phases :

**Phase 1 — les documentalistes.** Trois agents ont enquêté sur le web, dix
restaurants chacun. Leur règle : **observer, pas juger**. Ils rapportent presse
francophone, guides pour visiteurs, site officiel, réseaux sociaux, avec les URL.

**Phase 2 — les juges.** Les mêmes duels, sur dossier enrichi. Le dossier étant
figé, l'annotation reste rejouable.

| fichier | contenu |
|---|---|
| `web-quartier-latin.json` | les 30 fiches web collectées, avec leurs sources |
| `paires2-A.csv` … `paires2-E.csv` | les 86 jugements de chacun sur dossier enrichi |
| `classement-web.csv` | **le classement de référence retenu** (panel A+B+C+D) |
| `classement-base.csv` | le classement de la campagne 2, pour comparaison |

```bash
python -m backend.db.bradley_terry --campagne web --annotateurs ABCD
```

### Ce que le web a changé

Chaque annotateur a révisé **environ 27 % de ses duels** — et l'accord entre eux
a **monté** (A–D passe de 84 % à 90 %). Du bruit produirait l'inverse. Le
classement final en est nettement modifié : les deux classements ne corrèlent
entre eux qu'à rho = +0,562.

Couverture collectée : site officiel 29/30, réseaux sociaux 23/30, presse
francophone 13/30, guides visiteurs 5/30. Et **14 doutes d'identification sur 30**.

### Le score reste sans pouvoir prédictif

| | poids | base seule | base + web |
|---|---|---|---|
| **`local_signal`** | — | +0,037 | **+0,007** |
| menu | 0,40 | +0,229 | +0,057 |
| langue | 0,30 | −0,037 | +0,097 |
| prix | 0,15 | +0,397 | +0,232 |
| zone | 0,15 | +0,055 | +0,047 |

Le constat de la campagne 2 est donc **robuste à la façon de construire la vérité
terrain** — ce qui le renforce plutôt que de l'affaiblir.

### L'annotateur E : trois échecs, trois causes

| campagne | mode d'échec |
|---|---|
| 1 | viole l'interdit n°4 (raisonnement par la zone) |
| 2 | 98 % de ses jugements fondés sur le nombre de photos |
| 3 | **comprend la question à l'envers** — accord tombé à 43–47 %, sous le hasard |

Seul agent du panel sur le modèle le plus léger. Écarté des mesures des campagnes
2 et 3, mais ses fichiers restent versionnés : un échec documenté vaut mieux
qu'un échec effacé. **Les contrôles l'ont vu à chaque fois** — c'est ce qui
compte.

---

## Ce que ces pilotes n'établissent pas

Un kappa de 0,423 à 0,605 rend la campagne exploitable ; il ne transforme pas
cinq agents en cinq humains. Ce qui est établi, c'est que **l'instrument par
paires fonctionne là où l'instrument par classes échouait**. Le panel humain du
§5.2 devrait adopter le même instrument — rien n'indique que cinq personnes
échapperaient à une question qui pousse 59 % des réponses dans la même classe.
