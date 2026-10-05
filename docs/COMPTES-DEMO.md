# Comptes de démonstration (base locale)

Créés par `python -m backend.db.comptes_demo` (relançable sans risque ;
`--supprimer` retire tout). Valeurs de démonstration, publiques : **ne pas les
réutiliser ailleurs**, et ne jamais les créer sur la base en ligne (le script
le refuse).

Les adresses sont en `@example.com` : un domaine réservé aux exemples, qui a
l'air d'une vraie adresse mais n'appartient à personne.

Connexion : http://localhost:5173 → « Se connecter ».

| Rôle | E-mail | Mot de passe | Ce qu'on y voit |
|---|---|---|---|
| Voyageur | `camille.martin@example.com` | `password123` | Recherche complète, filtre de score, favoris (tout est gratuit) |
| Restaurateur | `antoine.dubois@example.com` | `password123` | Fiche « Papillon » validée, offre Visibilité+ (badge Partenaire, encart « À découvrir »), 170 consultations sur 30 jours dont le détail de 34 visites de voyageurs connectés |
| Restaurateur sans offre | `nadia.haddad@example.com` | `password123` | Fiche « Les Crêpes de Louis-Marie » validée, aucune offre : fiche gratuite, total des consultations, détail réservé, boutons « Essayer un mois gratuitement » |
| Hôtel | `reception@hotel-pantheon.example.com` | `password123` | « Hôtel du Panthéon (démo) », offre 49 € en essai, QR code, 64 ouvertures de la page, page publique `/hotel/hotel-de-demonstration` |

## Données fictives créées avec ces comptes

- **15 faux voyageurs** (Léa Bernard, Thomas Petit, Yuki Tanaka…, adresses
  `prenom.nom@example.com`) : ils ne peuvent pas se connecter, ils servent à
  remplir le détail des visites du restaurateur.
- **170 consultations** de la fiche « Papillon » sur les 30 derniers jours,
  surtout aux heures de repas ; une sur quatre par un voyageur connecté.
- **6 demandes de table** pour les deux semaines à venir.
- **64 ouvertures** de la page de l'hôtel (scans du QR code).

Compte administrateur : celui qui existait déjà dans la base (non modifié).

Source des valeurs : `COMPTES` dans [`backend/db/comptes_demo.py`](../backend/db/comptes_demo.py).
Si tu les changes là-bas, change-les ici aussi.
