# docs/data — Jeu de données labellisé (vérité terrain)

**Statut : à constituer.**

## Objet

~150 restaurants d'une zone urbaine, labellisés **local** / **touristique**, servant
à calibrer les pondérations du scoring et à évaluer le système ([D-006](../DECISIONS.md)).

## Zone retenue

**Quartier latin (Paris 5e / 6e).**

Critère de choix : le local et le touristique y sont **géographiquement imbriqués**.
Rue de la Huchette est un cas d'école d'attrape-touristes, et de vrais bistrots de
quartier existent à 400 m. Si les deux classes étaient séparées dans l'espace, la
distance seule suffirait à les distinguer et le modèle ne démontrerait rien.

> Montreuil — le jeu de données de départ — est un mauvais terrain d'évaluation :
> quasi intégralement local, la classe « piège » y serait vide.

## Méthode de labellisation — couverture différentielle

**Contrainte absolue : ne jamais labelliser à partir des features du modèle.**
Utiliser la distance aux monuments ou la langue des avis pour produire les labels
rendrait l'évaluation circulaire — on mesurerait si l'algorithme reproduit
l'algorithme. C'est une faille qu'un jury identifie immédiatement.

Le label provient donc d'une source indépendante : **le jugement éditorial d'humains.**

```
label = présence dans la presse food locale francophone
      − présence dans les guides touristiques anglophones
```

| Signal | Sources |
|---|---|
| **Local** | presse food francophone s'adressant à des habitants, recommandations entre résidents — *et absence* des guides touristiques |
| **Touristique** | listes « à proximité de tel monument », sélections de tour-opérateurs — *et absence* de la presse food locale |

Indépendant de la distance, de la langue des avis et du contenu du menu.
Relève de la **supervision faible** (*weak supervision*) — méthode reconnue, à
présenter comme telle dans le mémoire.

## Conditions de validité

1. **Ce sont des labels faibles, pas de l'or.** À assumer explicitement. Un
   sous-échantillon stratifié de 30-40 restaurants doit être validé par de vrais
   humains (habitants de la zone) pour ancrer les labels faibles.
2. **Chaque entrée est traçable.** Toute ligne porte sa ou ses sources. Un
   restaurant fermé ou inexistant dans le jeu de référence est pire que pas de jeu
   du tout — les coordonnées et l'existence doivent être revérifiées.

## Format attendu

`ground_truth.csv` — une ligne par restaurant :

| Colonne | Description |
|---|---|
| `id` | identifiant interne |
| `name` | nom |
| `address`, `lat`, `lng` | localisation, à vérifier |
| `label` | `local` / `touristique` / `ambigu` |
| `label_confidence` | `forte` / `faible` |
| `sources_local` | URLs presse locale |
| `sources_tourist` | URLs guides touristiques |
| `human_validated` | booléen — fait partie du sous-échantillon validé |
| `notes` | observations |
