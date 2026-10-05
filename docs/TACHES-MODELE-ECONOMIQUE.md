# Tâches pour aligner le code sur le business plan

Source : mémoire, section 4.3 (tableau 27). Rédigé le 5 octobre 2026. Mis à jour le même jour : la plupart des tâches sont faites (décision D-067).

## Le modèle du mémoire, en une phrase par client

| Client | Prix HT | Ce qu'il obtient |
|---|---|---|
| Voyageur | Gratuit | Toute l'appli : résultats, score, explications, scan de carte. Publicité discrète, jamais alimentaire. |
| Restaurateur, fiche | Gratuit | Fiche et score, identiques pour tous, abonnés ou non. Demandes de table. |
| Restaurateur, Visibilité | 29 €/mois | Mention « partenaire », fiche enrichie (photos, carte à jour, traductions), statistiques de vues. |
| Restaurateur, Visibilité+ | 59 €/mois | Visibilité + présence dans l'encart « À découvrir dans le quartier » (séparé de la liste classée, étiqueté « partenaire »), rapport mensuel, mois offert si l'objectif de vues n'est pas atteint. |
| Hôtel ou conciergerie | 49 €/mois | Local Signal à ses couleurs : QR code en chambre et à la réception, page « Où manger autour de l'hôtel », intégration au livret d'accueil. |

**Règle de neutralité** : payer ne change jamais le score ni la position dans la liste classée. Les offres payantes n'achètent que de la présentation et un encart à part, toujours étiqueté.

**Pourquoi un hôtel paierait** : chaque jour, la réception se fait demander « où manger dans le coin ? ». Pour 49 €, l'hôtel offre à ses clients une page toute prête et fiable, à son logo, sans travail pour la réception. Il n'est pas noté, il ne fait que prescrire.

L'appli actuelle suit l'ancien modèle (D-063) : un Pass Voyageur payant, et les restaurateurs gratuits sans offre. Il faut l'inverser.

---

## A. Voyageur : tout devient gratuit (retirer le Pass Voyageur)

- [x] **A1. Backend : retirer les limites liées au Pass** dans `backend/main.py`, `backend/config.py` :
  - le quota de recherches (`SEARCHES_PER_DAY_NON_ABONNE`) ;
  - la limite de résultats (`ANON_RESULTS_LIMIT`) ;
  - le filtre par fourchette de score, réservé aux abonnés ;
  - les favoris réservés aux abonnés (`_require_abonne`).
- [x] **A2. Backend : supprimer** `POST /api/subscribe` et `/api/subscribe/annuler`. Basculer les comptes `subscriber` en `user` par une migration, sans perdre de données.
- [x] **A3. Web : retirer le Pass** des fichiers suivants (`apps/web/src/…`) :
  - `pages/Pricing.jsx`, à remplacer par une page « Offres pro » (restaurateurs + hôtels) ;
  - `components/LockedCard.jsx` ;
  - le cadenas de `components/Filtres.jsx` ;
  - le badge « Pass Voyageur » de `components/Nav.jsx` ;
  - le verrou des favoris dans `components/RestaurantCard.jsx` et `lib/hooks.js` ;
  - `api.js` et `App.jsx`.
- [x] **A4. Mobile : même chose** dans `apps/mobile/src/…` : `PricingScreen`, `Filtres.js`, `CompteScreen`, `DiscoverScreen` et `api.js`.
- [x] **A5. Textes** : CGU web et mobile (y écrire la règle de neutralité, le mémoire dit qu'elle est publique), page `Dons`, `About`.
- [ ] **A6. Publicité discrète** (5 % du chiffre d'affaires, annonceurs non alimentaires : musées, transports, activités). Un encart simple suffit. Priorité basse.

## B. Restaurateurs : fiche gratuite + deux offres payantes

Déjà en place : compte restaurateur, revendication de fiche validée par un admin, espace « Mon restaurant », photo déposée, compteur de visites, demandes de table.

- [x] **B1. Modèle de données de l'abonnement** : une table `abonnements`, avec :
  - type de compte (restaurant / hôtel) et identifiant du compte ;
  - offre (`visibilite`, `visibilite_plus`, `hotel`) ;
  - statut (essai / actif / résilié) ;
  - date de début et fin de l'essai gratuit d'un mois.

  Elle remplace la colonne inerte `restaurant_claims.abonne`, qu'on garde en base.
- [x] **B2. Souscription en démonstration** : bouton « Souscrire » qui active l'offre, sans paiement réel, comme l'ancien Pass. Stripe en mode test plus tard.
- [~] **B3. Offre Visibilité (29 €)** — fait : badge, détail des visites. Reste : fiche enrichie (plusieurs photos, traductions) :
  - badge « partenaire » sur la fiche et la carte ;
  - fiche enrichie : plusieurs photos, carte à jour, traductions ;
  - statistiques de vues (l'endpoint `/api/restaurateur/mon-restaurant/visites` existe déjà).
- [~] **B4. Offre Visibilité+ (59 €)** — fait : encart séparé. Reste : rapport mensuel, garantie de vues :
  - encart « À découvrir dans le quartier » dans les résultats, **séparé** de la liste classée et étiqueté « partenaire » ;
  - rapport mensuel ;
  - suivi de l'objectif de vues, avec mois offert s'il n'est pas atteint.
- [x] **B5. Test de neutralité** (le plus important, exigence du mémoire) : un test de propriété qui vérifie qu'un restaurant abonné a le même `local_signal` et la même position qu'avant l'abonnement. À mettre dans `backend/tests/`.
- [x] **B6. Pages** : `PourLesRestaurateurs.jsx` et `SignupRestaurateur.jsx` présentent les deux offres et le mois d'essai. L'espace `Restaurateur.jsx` affiche l'offre en cours.
- [ ] **B7. Demandes de table** : vérifier qu'elles arrivent bien au restaurateur (le mémoire dit : par courriel ou SMS).

## C. Hôtels : nouvel espace à 49 €/mois

- [x] **C1. Compte hôtel** : rôle `hotel`, inscription dédiée, table `hotels` (nom, adresse, coordonnées, logo, couleur, identifiant de page).
- [x] **C2. Page publique `/hotel/{identifiant}`** « Où manger autour de l'hôtel » : le classement **normal** centré sur l'hôtel, aux couleurs de l'hôtel. Même score, aucun changement d'ordre.
- [x] **C3. Kit** : QR code (PNG + PDF à imprimer) vers cette page, et un lien à coller dans le livret d'accueil.
- [x] **C4. Espace hôtel** : modifier logo et couleur, voir combien de clients ont scanné le QR code.
- [x] **C5. Abonnement hôtel** : même mécanisme que B1 et B2.

## D. Traçabilité (obligatoire, CLAUDE.md)

- [x] **D1.** Nouvelle décision dans `docs/DECISIONS.md`, qui marque D-063 `SUPERSÉDÉE` : voyageur gratuit, offres restaurateurs 29/59 €, offre hôtel 49 €, règle de neutralité.
- [x] **D2.** Mettre à jour la section 5 de `CLAUDE.md`, qui décrit encore le Pass Voyageur.

## E. Photos des restaurants

- [x] **E1.** Les photos Google stockées (462 restaurants, presque tous au Quartier latin) ont expiré : elles répondent toutes 403. Le collecteur `backend/ingestion/web/og_image.py` les traite maintenant comme absentes et les remplace par la photo que publie le site du restaurant (balise `og:image`).
- [x] **E3 bis. Photos Google officielles (API Places)** pour le Quartier latin : 462 restaurants sur 467. Les photos Panoramax ont été essayées puis retirées (360°, chaussée au lieu de la façade) — voir la révision de D-067.
- [ ] **E2. Photos de carte** (`menu_photo_urls`, page détail) : même problème, ce sont aussi des URL Google expirées.
- [ ] **E3. Restaurants sans site web** : aucune source gratuite et légale automatique. Ils gardent l'illustration générée.
  - Pistes : photos déposées par les restaurateurs (déjà possible, D-059, et argument de l'offre Visibilité) ;
  - Mapillary (photos de rue libres, demande une clé gratuite à créer par l'équipe).

## Ordre conseillé

1. **A**, retirer le Pass : c'est surtout de la suppression, et sans ça l'appli contredit le mémoire.
2. **D1 et B5** : la décision et le test de neutralité, avant d'écrire la moindre offre payante.
3. **B1 → B4**, offres restaurateurs.
4. **C**, hôtels. C'est une fonctionnalité neuve, mais simple : la page hôtel réutilise la recherche existante.
