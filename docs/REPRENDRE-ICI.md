# Reprendre le chantier vérité terrain — état au 22 septembre 2026

**Ce document s'adresse à quelqu'un — humain ou agent — qui arrive sans rien
savoir de ce qui précède.** Il dit où en est le chantier, ce qui est acquis, ce
qui reste, et comment le faire. Lis-le en entier avant d'agir.

Le contexte général du projet est dans [`CLAUDE.md`](../CLAUDE.md). Le raisonnement
derrière chaque choix est dans [`DECISIONS.md`](DECISIONS.md), entrées **D-042 à
D-045**. Le protocole d'annotation est dans
[`methodologie/verite-terrain.md`](methodologie/verite-terrain.md), sections 5.4 à 5.11.

---

## 1. Ce qui est acquis

**Une vérité terrain de 360 restaurants sur 467**, classés du plus local au plus
dépendant de la clientèle de passage. 3 448 jugements par comparaison de paires,
accord inter-annotateurs **kappa = 0,717** (substantiel).

Fichier : [`data/annotation-pilote/classement-467.csv`](data/annotation-pilote/classement-467.csv)

**Et le résultat qui justifie tout le reste** — le score actuel confronté à ce
classement (corrélation de Spearman, n = 360) :

| indicateur | poids actuel | rho | IC 95 % | verdict |
|---|---|---|---|---|
| **`local_signal`** (score global) | — | **+0,229** | [+0,129 ; +0,325] | prédit, significatif |
| menu | **0,40** | +0,115 | [−0,002 ; +0,229] | **non significatif** |
| **langue** | 0,30 | **+0,510** | [+0,429 ; +0,583] | le seul vraiment fort |
| prix | 0,15 | +0,245 | [+0,120 ; +0,362] | significatif |
| zone touristique | 0,15 | +0,048 | [−0,056 ; +0,151] | **non significatif** |

**Lecture : les deux indicateurs qui portent 0,55 du poids ne prédisent rien, et
la langue porte l'essentiel du signal à elle seule.** C'est le point de départ de
la recalibration, et c'est le résultat principal à écrire dans le mémoire.

---

## 2. La prochaine chose à faire

**Dériver les pondérations du jeu labellisé**, ce qui était l'objectif depuis le
départ (D-006, LS-09). Le module existe déjà et n'attend que les étiquettes en base.

```bash
python -m backend.db.verite_terrain --importer docs/data/annotation-pilote/classement-467.csv
```

⚠️ **Cette commande ne marchera pas telle quelle.** `backend/db/verite_terrain.py`
attend les colonnes `etiquette_1`, `etiquette_2`, `arbitrage` — un format à trois
classes hérité d'un protocole abandonné (voir D-042). Le classement produit est
**continu** (un rang et un θ par restaurant), pas catégoriel.

**Deux options, à trancher :**

1. **Adapter l'importeur** pour écrire le rang et le θ dans de nouvelles colonnes
   (`rang_verite_terrain`, `theta_verite_terrain`). C'est le plus fidèle : le
   classement continu est plus riche qu'une étiquette.
2. **Seuiller** le classement en trois classes pour réutiliser l'existant. Plus
   simple, mais on jette de l'information — et le passage aux trois classes est
   précisément ce qui avait échoué en D-042.

**L'option 1 est recommandée.** Il faudra alors aussi adapter
`backend/core/scoring/calibration.py`, qui fait une régression logistique sur une
cible binaire : avec un classement continu, une régression ordinale ou une
corrélation de rang est plus adaptée.

---

## 3. Ce qui reste à annoter (optionnel)

**107 restaurants sur 467 ne sont pas classés** — les blocs 12 à 15 du plan.

C'est optionnel : les corrélations n'ont quasiment plus bougé entre n = 168 et
n = 360 (le score global est passé de +0,300 à +0,229, la langue de +0,508 à
+0,510). **L'échantillon est suffisant pour calibrer.** Les 107 restants
resserreraient les intervalles, sans changer les conclusions.

Si tu veux quand même les faire, tout est prêt :

```bash
python -m backend.db.missions --plan paires-467.json --web --bloc 12
```

Puis lancer **4 agents** (un par profil d'annotateur) sur les fichiers
`mission_b12_A.md` … `mission_b12_D.md`. Le prompt exact de chaque profil est
reconstituable depuis le §4 ci-dessous. Enfin :

```bash
python -m backend.db.bradley_terry
```

**Utilise Opus, pas Sonnet.** C'est mesuré : blocs Opus kappa 0,75–0,96, blocs
Sonnet 0,23–0,70. **Compter ~9,5 points de fenêtre 5 h par agent Opus**, soit ~38
points par bloc — mesuré, et la différence persiste à consigne identique. Haiku échoue
franchement (trois modes d'échec différents, voir D-042/D-044).

---

## 4. Comment fonctionne le dispositif

Quatre modules, tous dans `backend/db/` :

| module | rôle |
|---|---|
| `dossier_annotation.py` | construit le dossier soumis à l'annotateur, **d'où les quatre indicateurs du modèle sont retirés** — c'est ce qui empêche la circularité |
| `paires.py` | le plan de comparaison : blocs de 40 qui se chevauchent de 8, graine fixe, graphe connexe |
| `missions.py` | assemble dossiers + duels en un fichier par annotateur et par bloc |
| `bradley_terry.py` | agrège les duels en classement, mesure le kappa et le biais de position |

**Le panel** : quatre profils distincts, chacun avec son angle — le riverain
(vie ordinaire du quartier), le voyageur (reconnaît ce qui est fait pour lui), le
restaurateur (modèle économique, horaires), la journaliste food (à qui le lieu
s'adresse). Un cinquième profil, le sceptique, a été **écarté** après trois échecs.

**La question posée**, et c'est elle qui fait tout fonctionner :

> Lequel de ces deux restaurants dépend le plus de la clientèle de passage — les
> visiteurs, les touristes — pour remplir sa salle ?

Elle est **relative**. La question absolue du protocole d'origine (« si on
retirait tous les touristes, survivrait-il ? ») a échoué : 59 % de réponses
« local », kappa 0,118. Voir D-042.

**Les deux interdits** maintenus dans chaque consigne : ne pas raisonner sur la
langue des avis clients, ne pas raisonner par la distance à un monument ni par la
réputation d'une rue.

---

## 5. Les limites à écrire dans le mémoire

Elles sont toutes documentées, aucune n'est cachée. Les énoncer vaut mieux que de
les laisser trouver.

1. **La vérité terrain est agentique, pas humaine.** Ce qui est établi, c'est que
   l'instrument par paires fonctionne ; pas que ces jugements valent ceux d'un
   panel d'habitants. Un sous-échantillon validé par de vrais humains reste à faire.
2. **Un bug d'horaires a affecté 56 des 467 dossiers** (blocs 1 à 9) : la source
   encode un jour fermé par la chaîne `"Fermé"`, que le générateur comptait comme
   un jour d'ouverture. Corrigé au bloc 10. La version soumise est archivée sous
   `dossiers-v1-avec-bug-horaires.json` — la campagne reste rejouable.
3. **Le modèle d'annotation compte**, et plus que la consigne : Opus 0,75–0,96,
   Sonnet 0,23–0,70.
4. **Des dossiers sont mal appariés**, en nombre non négligeable — voir
   [`dossiers-douteux.md`](data/annotation-pilote/dossiers-douteux.md). Trois cas
   de **swap d'avis entre établissements** ont été identifiés, dont un restaurant
   « Dame » portant les avis de la cathédrale Notre-Dame.
5. **Les horaires ne peuvent pas devenir un indicateur** évalué contre cette
   vérité terrain : ils étaient visibles dans le dossier, les annotateurs s'en
   sont servis. La corrélation apparente (+0,765 pour le service continu) est
   circulaire. Il faudrait une campagne où ils sont masqués.

---

## 6. Où est quoi

```
docs/
  REPRENDRE-ICI.md                    ce fichier
  DECISIONS.md                        D-042 à D-045 : tout le raisonnement
  methodologie/verite-terrain.md      §5.4 à 5.11 : le protocole et ses mesures
  data/annotation-pilote/
    classement-467.csv                LE RÉSULTAT — 360 restaurants classés
    dossiers-douteux.md               les fiches à écarter et pourquoi
    dossiers-quartier-latin.json      les 467 dossiers (version corrigée)
    dossiers-v1-avec-bug-horaires.json  la version réellement soumise aux blocs 1-9
    web-quartier-latin.json           les 467 fiches de recherche web
    paires-467.json                   le plan de comparaison, reproductible
    duels-467/                        les 3 132 jugements bruts, avec leurs raisons
    web-lots/                         la collecte web, lot par lot
    README.md                         les trois campagnes pilotes et leurs mesures

backend/db/
  dossier_annotation.py · paires.py · missions.py · bradley_terry.py
```

---

## 7. Si tu ne dois retenir qu'une chose

Le projet a désormais **un jeu de référence et une mesure**. La question n'est
plus « comment labelliser ? » mais « que valent les pondérations une fois
dérivées ? ». Tout le reste — l'instrument, le panel, la collecte, les contrôles
— existe et a été mesuré.

**Ne recommence pas l'annotation depuis zéro.** Elle a coûté trois campagnes
pilotes pour trouver le bon instrument, et deux d'entre elles ont échoué. Le
chemin est documenté précisément pour ne pas être refait.
