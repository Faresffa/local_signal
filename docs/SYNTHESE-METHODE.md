# Ce qui a changé dans la méthode

Synthèse à destination de l'équipe. Couvre la refonte du scoring et la récolte
des cartes. Le détail de chaque point, avec son raisonnement complet, est dans
[`DECISIONS.md`](DECISIONS.md) — les références `D-0xx` y renvoient.

Ce document ne parle ni des interfaces ni du visuel.

---

## 1. Le point de départ : l'algorithme punissait ce qu'il devait révéler

C'est le constat qui a tout déclenché, et il est apparu en relisant le README
en regard du code.

Le scoring initial faisait dépendre **45 %** de la note de signaux dérivés des
avis : 20 % pour la langue, 25 % pour les étoiles. Or `score_language`
retournait `0` quand la liste d'avis était vide, et `score_stars` retournait `0`
sans note.

> **Un restaurant invisible — donc sans avis — finissait dernier du classement.
> L'algorithme punissait exactement les restaurants que le projet prétend
> sauver.**

Toute évolution du scoring est désormais soumise à un test unique (**D-001**) :

> *Ce critère fonctionne-t-il pour un restaurant qui a 0 avis et pas de site web ?*

Si non, il ne peut pas être un critère majeur. Ce test explique chacune des
décisions qui suivent.

---

## 2. Quatre changements de méthode, et leur raison

### 2.1 Le critère géo-touristique est **inversé** (D-002)

Il pesait `0.30` — le poids le plus lourd — et donnait **plus** de points aux
restaurants **proches** d'un monument. Contradiction frontale avec l'intention
du produit.

La proximité d'un site touristique majeur est désormais une **pénalité**.

**L'argument, à reprendre tel quel en soutenance — ce n'est pas une intuition,
c'est un raisonnement économique :**

Un restaurant adossé à un monument joue un **jeu à un coup** : ses clients ne
reviendront jamais. Il n'a donc aucune incitation économique à la qualité — sa
réputation auprès d'un client donné n'a pas de valeur future.

Un restaurant de quartier vit de ses **habitués** : la relation est répétée, la
qualité devient sa condition de survie.

> L'authenticité corrèle avec le taux de retour des clients, et la distance aux
> sites touristiques en est un proxy mesurable.

Implémenté comme une **pénalité de zone** à rayon court, et non comme une
récompense linéaire à l'éloignement — sinon l'algorithme recommanderait des
zones industrielles au seul motif qu'elles sont loin de tout.

### 2.2 Le score de langue devient continu, avec lissage bayésien (D-003)

Il était **binaire** : `1` au-dessus de 50 % d'avis en langue locale, `0` en
dessous. Deux défauts distincts — un effet de seuil (49 % et 0 % donnaient le
même score), et des faux positifs sur faible volume (2 avis en français
suffisaient à obtenir le maximum).

```
score_langue = (n_locaux + α × prior) / (n_total + α)     avec α ≈ 5
```

| Cas | Ancien | Nouveau |
|---|---|---|
| 2 avis / 2 locaux | 1.00 | **0.50** |
| 45 avis / 40 locaux | 1.00 | **0.86** |
| 0 avis | 0.00 | **= prior (neutre)** |

Un restaurant sans avis n'est plus **puni**, il est **incertain**. Et le
mécanisme produit gratuitement une valeur de **confiance** — le volume de
preuves — qui permet d'afficher « indice provisoire » plutôt que de simuler une
précision qu'on n'a pas.

### 2.3 Les étoiles sortent du classement (D-007)

Elles contredisent l'intention du produit, ne discriminent rien, et dépendent
de la popularité. La note reste affichée comme simple information ; elle
n'entre plus dans le calcul.

### 2.4 Un signal indisponible voit son poids **redistribué** (D-012)

Le réflexe naturel — noter `0.0` un signal manquant — reproduit exactement le
défaut de D-001. Un restaurant peu documenté serait mal noté non parce qu'il est
mauvais, mais parce qu'on ne sait rien de lui. Or ce sont précisément ceux que
le projet veut révéler.

```
local_signal = Σ(valeur × poids) / Σ(poids des signaux DISPONIBLES)
```

L'incertitude est portée par une valeur séparée, `confidence`, et **jamais par
le score lui-même**.

> Un restaurant sur lequel on a peu d'information est **INCERTAIN**, pas **MAUVAIS**.

**Invariant testé** : un restaurant sans avis obtient un Local Signal
*supérieur* à un restaurant dont les 20 avis sont tous en langue étrangère, tout
en ayant une confiance *inférieure*. C'est la traduction opérationnelle de
D-001, et elle est vérifiée automatiquement.

---

## 3. L'architecture : deux scores de nature différente (D-008)

La formule initiale mélangeait dans une seule moyenne pondérée deux natures de
critères : des propriétés **du restaurant**, et une propriété **de la requête**
(la distance à l'utilisateur).

Mélanger les deux empêche de précalculer quoi que ce soit — et n'a pas de sens :
la distance à l'utilisateur ne dit rien sur l'authenticité d'un restaurant.

| | **Local Signal** | **Pertinence** |
|---|---|---|
| Nature | statique, précalculé en base | dynamique, calculé à la requête |
| Répond à | *ce qu'est le restaurant* | *ce qui convient à l'utilisateur maintenant* |
| Contient | menu, langue, prix, zone touristique | distance, ouverture, budget, cuisine, régime |
| Recalcul | batch mensuel | à chaque requête |

**Règle :** ne jamais recalculer un signal statique dans le chemin d'une requête
utilisateur. L'application reste instantanée même sur une base nationale.

### Pondérations actuelles — statut : **provisoires**

| Signal | Poids | Statut |
|---|---|---|
| Menu | 0.40 | à calibrer |
| Langue | 0.30 | à calibrer |
| Prix | 0.15 | à calibrer |
| Zone touristique | 0.15 | à calibrer |

Elles seront **dérivées du jeu labellisé**, pas choisies à la main (D-006). Ne
jamais les présenter comme justifiées.

---

## 4. Le scan de carte : pourquoi c'est la stratégie, pas une fonctionnalité

### Le principe qui rend la méthode défendable (D-014)

> **Le modèle observe, il ne juge pas.**

On ne demande jamais au modèle « ce restaurant est-il authentique ? ». On lui
demande des faits vérifiables : combien de plats, quelles cuisines, quelles
langues, y a-t-il une formule touristique. **Le score est ensuite calculé par du
code déterministe.**

| | |
|---|---|
| **Reproductibilité** | Deux scans de la même carte donnent le même score |
| **Auditabilité** | Chaque point du score s'explique (D-009) |
| **Calibration** | Les seuils s'ajustent sur le jeu labellisé sans retoucher le prompt, ni relancer une seule inférence |

Un LLM à qui l'on demande directement une note produit un chiffre non
reproductible et incalibrable. Un jury le démonterait en une question.

### Comment la carte est notée

Quatre sous-signaux pondérés, puis deux malus forfaitaires :

| Sous-signal | Poids | Règle |
|---|---|---|
| Cohérence de cuisine | 0.35 | 1 cuisine → 1.0 · 4 cuisines ou + → 0.0 |
| Amplitude | 0.25 | ≤ 25 plats → 1.0 · ≥ 80 plats → 0.0 |
| Vernaculaire | 0.25 | part des plats gardant leur nom d'origine |
| Langues | 0.15 | voir §6 — modifié depuis |

`− 0.25` si formule « menu touriste ». `− 0.15` si photos des plats — une carte
photo s'adresse à un client qui ne sait pas lire les intitulés.

### Le fournisseur est interchangeable (D-017)

Groq par défaut — latence (l'utilisateur est debout devant le restaurant) et
coût. Claude comme référence de qualité, pour mesurer sur le jeu labellisé la
perte de précision d'extraction d'un modèle plus léger. Ce comparatif coûte
environ 5 € et devient un résultat du mémoire.

---

## 5. Récolter les menus : trois voies, trois biais

C'est le nerf du projet. Le signal menu pèse le plus lourd et il est le **seul
disponible sans aucun avis** — mais il faut le remplir.

### 5.1 Ce qui a été vérifié et écarté

**L'API Google Places n'expose aucun champ menu.** Plus de cent champs
documentés sur quatre paliers tarifaires, jusqu'à « sert du vin » — aucun ne
concerne la carte. La rubrique « Menu » visible dans l'application Google Maps
est construite par Google à partir de robots d'indexation et de partenaires ;
elle n'est pas exposée par l'API, et les restaurateurs eux-mêmes ne peuvent pas
l'éditer. L'API `FoodMenus` existe, mais dans Google Business Profile : elle
exige d'être **propriétaire de la fiche**.

**Le scraping de Google Maps est écarté** (D-021), pour trois raisons dans
l'ordre d'importance : il suppose de contourner la détection de robots, donc il
casserait sans prévenir ; une base construite dessus n'est ni publiable, ni
finançable, ni défendable ; les photos appartiennent à leurs auteurs.

### 5.2 Les trois voies retenues

| Voie | Ce qu'elle atteint | Statut |
|---|---|---|
| **Photos Google Places** (D-021) | les restaurants très photographiés | codée, **jamais exécutée** |
| **Cartes publiées sur le web** (D-023) | les restaurants ayant un site | **25 cartes récoltées** |
| **Scan utilisateur** (D-004) | *tous*, y compris les invisibles | codée, jamais testée en réel |

**Chaque voie a un biais, et ce sont des biais différents.** C'est ce qui les
rend complémentaires plutôt que redondantes :

- Photos Google → biaisée vers les restaurants **très fréquentés**, donc plutôt
  touristiques.
- Web → biaisée vers les restaurants **web-visibles**, donc plutôt commerciaux.
- Scan utilisateur → **aucun de ces deux biais**. C'est la seule voie qui
  atteint le restaurant de quartier que personne ne photographie et qui n'a pas
  de site.

### 5.3 La récolte web, et son résultat négatif

Nouveau module `backend/ingestion/web/`. Pipeline en quatre temps, **coût
Google nul** :

1. **Résolution** — tag OSM `website:menu`, sinon lien « carte » sur la page d'accueil
2. **Récupération** — texte de la page HTML ou du PDF
3. **Filtre à prix** — gratuit : une page sans prix ne contient pas de plats
4. **Extraction** — observations factuelles par le modèle, sur du **texte** (pas
   de vision : la carte est déjà textuelle, la faire transiter par un modèle de
   vision coûterait plus et perdrait de l'information)

Le score reste calculé par le même code déterministe. D-014 est intact.

**Résultats mesurés sur le Quartier latin, 468 restaurants :**

| | |
|---|---|
| Ont un site web ou un tag menu | 155 (33 %) |
| Sans lien de carte identifiable | 78 |
| Récupération en échec (404, 403, PDF scanné) | 12 |
| Page atteinte mais **sans aucun prix** | 36 |
| **Cartes réellement exploitables** | **25 — soit 5 % de la zone** |

**Le résultat le plus utile est négatif : 36 pages sur 65 récupérées ne
contiennent pas la liste des plats.** Les sites de restaurants modernes rendent
leur carte en JavaScript, la déportent dans un PDF derrière un second clic, ou
se contentent de la décrire en prose. Deux cas observés : une page « cartes »
remplie de `Lorem ipsum`, une page « menu » qui présente la cuisine du chef et
renvoie vers « Voir la carte ».

> Cela démontre **empiriquement** ce que D-004 posait en hypothèse : la carte
> d'un restaurant n'est pas récupérable à distance de façon fiable. **Le scan en
> vitrine n'est pas une commodité de produit, c'est la seule voie d'accès à la
> donnée.**

Formulation défendable : *« la récolte web couvre 5 % de la zone d'évaluation ;
55 % des pages de carte atteintes ne contiennent pas la liste des plats. »*

### 5.4 Coût de la voie Google — l'erreur d'appréciation à corriger

Chaque SKU Google offre **1 000 requêtes par mois**. Une zone de moins de 500
restaurants tient donc **intégralement dans le quota gratuit**.

> D-021 a été laissée de côté en supposant qu'elle serait coûteuse. Elle est
> **gratuite à l'échelle du jeu labellisé**. C'est la voie la plus rapide vers
> des cartes réelles, et elle est déjà codée.

---

## 6. L'alerte, et elle est sérieuse

Après récolte de 25 cartes sur 468 restaurants :

| | Avec carte (25) | Sans carte (443) |
|---|---|---|
| Confiance | 0.55 | 0.15 |
| Local Signal moyen | **60.8** | **40.7** |

**Les 12 premiers du classement sont les 12 restaurants qui ont une carte.**
Sans exception.

Le signal menu pesant 0.40 et les cartes récoltées obtenant 0.83 en moyenne, tout
restaurant qui en possède une devance mécaniquement ceux dont le poids est
redistribué. Or avoir une carte en ligne = **avoir un site web**.

> **La récolte web, branchée telle quelle sur le classement, inverse l'intention
> du produit** : elle propulse en tête les établissements web-visibles,
> c'est-à-dire exactement ceux que D-001 cherche à ne pas privilégier.

Ce n'est pas un défaut d'implémentation. C'est la conséquence arithmétique de la
redistribution de poids **quand la disponibilité du signal est corrélée à la
variable mesurée**. D-012 protège du faux zéro ; il ne protège pas de ce
biais-là.

**Trois conséquences à traiter avant toute mise en avant du classement :**

1. Deux Local Signal de confiances différentes **ne sont pas comparables**.
   60.8 à confiance 0.55 et 40.7 à confiance 0.15 ne se classent pas l'un contre
   l'autre.
2. La confiance doit peser dans le classement affiché, ou être montrée — elle ne
   peut pas rester une colonne interne.
3. La calibration doit être menée **séparément par régime de disponibilité**,
   sinon elle apprendra le biais au lieu de le corriger.

Le biais reste mesurable : `menus.provider` (`web-osm`, `web-crawl`) et
`menus.source_url` sont enregistrés. **Un biais mesuré est un résultat ; un
biais ignoré est une faute de méthode.**

---

## 7. Correction sur le signal de langue (D-024)

Constatée sur les données réelles : `score_languages` ne comptait que le
**nombre** de langues d'une carte, jamais lesquelles. *Indonesia* et *Bian Bian
Nouilles*, cartes rédigées **uniquement en anglais**, obtenaient le score
maximal — au même titre qu'un bistrot francophone. Or au Quartier latin, une
carte exclusivement en anglais est l'un des signaux d'attrape-touristes les plus
forts qui soient.

**Le piège écarté :** pénaliser toute carte sans français aurait retourné le
produit contre son objectif. Une carte uniquement en chinois, vietnamien ou
arabe s'adresse à une **clientèle de diaspora installée** — signal local fort,
exactement le type d'établissement que D-001 veut révéler.

Le critère n'est donc pas « absence de la langue locale », mais **substitution
de la langue locale par une langue véhiculaire**.

| Carte | Score | Lecture |
|---|---|---|
| `['fr']` | 1.00 | bistrot de quartier |
| `['zh']` | **1.00** | diaspora — non pénalisé |
| `['en']` | **0.50** | s'adresse au passage international |
| `['fr','en']` | 0.75 | pénalisé par le nombre seulement |
| `['en','es','it']` | 0.25 | ciblage touristique assumé |

La pénalité ne s'applique que si la langue locale est absente **et** qu'une
véhiculaire est présente — sinon `['fr','en']` serait compté deux fois pour le
même fait.

**Effet mesuré :** *Indonesia* passe de la 4ᵉ à la 9ᵉ place (68.85 → 65.32).

Six invariants ajoutés à la suite de tests, dont un qui garde explicitement le
cas diaspora : c'est la régression la plus coûteuse possible pour ce projet.

> **Limite connue :** `LINGUA_FRANCA_LANGUAGES = {"en"}` vaut pour la France. À
> Barcelone, l'espagnol serait local et le catalan vernaculaire ; à Bruxelles il
> y a deux langues locales. Dès qu'une zone hors de France est ajoutée, cette
> constante doit devenir un **paramètre de zone**.

---

## 8. Où en est la donnée

| Zone | Restaurants | Cartes | Photos |
|---|---|---|---|
| Quartier latin | 468 | 25 | 63 |
| Montreuil | 268 | 0 | 0 |

**Vérité terrain : 0 label.**

### Les deux constats de calibration déjà obtenus (D-020)

**1. La pénalité de zone touristique ne discrimine plus rien ici.** Sur 468
restaurants, aucun n'est hors zone touristique. Le Quartier latin compte 47
monuments sur ~1,5 km² : avec un rayon de 500 m, *tout* est dans la zone d'au
moins un site. Le critère ne sépare plus deux classes, il produit un dégradé
de « plus ou moins central ».

C'est un vrai résultat, pas un bug. Deux pistes à trancher sur le jeu labellisé :
réduire fortement le rayon en zone dense, ou remplacer « distance au site le
plus proche » par une **densité de monuments** — plus fidèle à l'intuition de
D-002.

**2. Deux signaux sur quatre restent indisponibles** pour la majorité des
restaurants. La redistribution fonctionne comme prévu, mais le classement repose
de fait sur peu de signaux.

> **Les scores en base ne sont pas encore interprétables.** Ils prouvent que le
> pipeline tourne de bout en bout sur des données réelles, rien de plus. Ne pas
> les présenter comme un résultat.

---

## 9. Ce qui bloque, par ordre

1. **La vérité terrain n'existe pas.** Risque n°1, et il n'est pas technique.
   Sans elle : ni calibration, ni évaluation, ni mémoire défendable — seulement
   une application qui produit des chiffres invérifiables.
2. **Le biais de disponibilité du signal menu** (§6) doit être traité avant de
   présenter un classement.
3. **Le scan de carte n'a jamais été testé sur une vraie photo.** Le pipeline
   texte fonctionne ; la voie vision attend un test en conditions réelles.
4. **D-021 n'a jamais tourné**, alors qu'elle est gratuite à cette échelle.

### Le chemin le plus court

1. Lancer **D-021 sur ~150 restaurants** — gratuit, déjà codé, et cela teste
   enfin un pipeline jamais exécuté
2. Compléter par la **récolte web**, dont le biais est différent
3. **Scanner sur place** les restaurants sans site ni photos — seule voie vers
   la classe « local », et c'est ce que prévoit déjà la roadmap
4. Labelliser, puis **calibrer les pondérations séparément par régime de
   disponibilité**

---

## Références

| | |
|---|---|
| [`DECISIONS.md`](DECISIONS.md) | les 26 décisions, avec leur raisonnement complet |
| [`ROADMAP.md`](ROADMAP.md) | plan, données, authentification, hébergement |
| [`methodologie/evaluation.md`](methodologie/evaluation.md) | protocole d'évaluation |
| [`data/README.md`](data/README.md) | constitution de la vérité terrain |
