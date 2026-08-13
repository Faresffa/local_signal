# Protocole d'évaluation

Comment on démontre que le scoring fonctionne. C'est la partie du mémoire qui sera
attaquée en premier — elle doit être établie **avant** de figer les pondérations.

## Le problème à résoudre

Les pondérations initiales (0.30 / 0.25 / 0.20 / 0.25) n'avaient aucune
justification. *« Pourquoi 0.30 ? »* est la première question d'un jury, et sans
vérité terrain il n'y a pas de réponse : tout le mémoire repose alors sur du sable
([D-006](../DECISIONS.md)).

## Jeu de référence

~150 restaurants du Quartier latin, labellisés par **couverture différentielle** —
protocole complet dans [`docs/data/README.md`](../data/README.md).

Point critique rappelé ici : **les labels ne doivent jamais dériver des features du
modèle**, sous peine d'évaluation circulaire.

## Métrique principale — `precision@10`

> Sur les 10 restaurants que le système recommande, combien sont réellement locaux ?

C'est la métrique qui correspond à l'usage réel : personne ne descend au-delà des
10 premiers résultats. Une métrique globale (accuracy sur les 150) mesurerait une
tâche que l'utilisateur ne fait jamais.

## Le comparatif qui porte le mémoire

**Comparer le top 10 de Local Signal au top 10 de Google trié par note.**

C'est le graphique de la soutenance. Trois résultats possibles, tous publiables :

| Résultat | Interprétation |
|---|---|
| Les classements diffèrent **et** le nôtre est jugé plus authentique | Contribution démontrée |
| Les classements diffèrent peu | Le tri par note capture déjà l'authenticité — résultat négatif, mais un résultat |
| Les classements diffèrent **et** le nôtre est jugé moins bon | Le scoring est à revoir ; on sait enfin pourquoi |

Un résultat négatif honnête vaut mieux qu'une absence d'évaluation. C'est ce qui
distingue un mémoire d'une démo.

## Métriques secondaires

- **Précision par classe** — le système confond-il surtout les pièges en locaux
  (faux positifs, coût utilisateur élevé : il se fait avoir) ou l'inverse
  (faux négatifs, coût faible : il rate un bon plan) ? Les deux erreurs n'ont pas
  la même gravité produit.
- **Couverture à faible information** — `precision@10` restreinte aux restaurants
  ayant moins de 5 avis. C'est le test direct du paradoxe de l'invisibilité
  ([D-001](../DECISIONS.md)) : si le système n'y fonctionne pas, il ne résout pas
  le problème qu'il prétend résoudre.
- **Ablation** — retirer un signal à la fois (menu, langue, prix, zone touristique)
  et mesurer la perte. Justifie empiriquement chaque critère et donne les
  pondérations sans les choisir à la main.

## Calibration des pondérations

Les poids sont **dérivés** du jeu labellisé, pas choisis :

1. Figer le jeu de référence et le séparer en `train` / `test`.
2. Ajuster les pondérations sur `train` (optimisation directe de `precision@10`,
   ou régression logistique sur les features normalisées).
3. Rapporter les résultats **sur `test` uniquement**.
4. Consigner les poids obtenus, avec leur date et le jeu utilisé, dans
   [`DECISIONS.md`](../DECISIONS.md).

Toute constante qui ne sort pas de cette procédure reste marquée `à calibrer` dans
`backend/config.py`.

## Ordre des travaux

```
1. Constituer le jeu labellisé          ← bloquant pour tout le reste
2. Ablation → identifier les signaux utiles
3. Calibrer les pondérations sur train
4. Évaluer sur test + comparatif Google
5. Figer les poids dans config.py et documenter dans DECISIONS.md
```

Tant que l'étape 1 n'est pas faite, **les pondérations du code sont explicitement
provisoires** et le scoring ne doit pas être considéré comme stable.
