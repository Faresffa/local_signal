# Politique de confidentialité — Local Signal

*Dernière mise à jour : 14 septembre 2026*

> **À faire relire avant toute mise en ligne publique.** Ce document a été rédigé
> à partir de ce que le code fait réellement — chaque affirmation est vérifiable
> dans le dépôt. Il n'a pas été relu par un juriste, et il le faudrait avant
> d'ouvrir le service à des utilisateurs qui ne sont pas l'équipe.

---

## 1. Qui traite vos données

Local Signal est un projet de mémoire mené à HETIC. Le service n'est pas
exploité commercialement à ce jour.

**Contact :** *(adresse de contact à renseigner avant la mise en ligne)*

## 2. Ce que nous collectons, et pourquoi

Nous ne collectons que ce dont le service a besoin pour fonctionner.

| Donnée | Pourquoi | Base légale |
|---|---|---|
| Adresse e-mail | identifier votre compte, vous envoyer une confirmation de réservation | exécution du service que vous demandez |
| Mot de passe | protéger votre compte — **stocké sous forme d'empreinte, jamais en clair** | exécution du service |
| Prénom ou nom, si vous le donnez | vous nommer dans l'interface et sur une réservation | exécution du service |
| Réservations | transmettre votre demande au restaurant | exécution du service |
| Avis que vous laissez | les afficher aux autres utilisateurs | exécution du service |
| Sessions ouvertes | vous garder connecté sans redemander le mot de passe | exécution du service |

**Nous ne collectons pas** : votre position en dehors de la recherche en cours,
votre carnet d'adresses, votre historique de navigation hors du service, ni
aucune donnée de paiement.

## 3. Votre position

Quand vous cherchez un restaurant, votre position est envoyée à notre serveur
pour calculer les distances. **Elle n'est pas enregistrée** : elle sert à
répondre à la requête, puis disparaît. Aucun historique de vos déplacements
n'existe.

Vous pouvez refuser la géolocalisation : le service fonctionne alors en
saisissant une adresse ou en posant un point sur la carte.

## 4. Les photos de carte

Quand vous photographiez la carte d'un restaurant, l'image est analysée, puis
**conservée dans un corpus interne**. Ce corpus nous sert à vérifier ce que la
lecture automatique en a tiré, et à la refaire si nos méthodes s'améliorent —
sans vous redemander la photo.

**Ce corpus n'est jamais publié.** Les images ne sont pas servies par
l'application, pas diffusées, pas revendues. L'application affiche les photos
depuis leur hébergeur d'origine, jamais depuis nos serveurs.

**Une photo de carte ne vous identifie pas** : c'est la carte d'un restaurant,
pas une donnée vous concernant. Si vous supprimez votre compte, le lien entre
vous et les photos que vous avez envoyées disparaît — les photos, elles,
restent dans le corpus.

## 5. Combien de temps nous gardons vos données

| Donnée | Durée |
|---|---|
| Compte | jusqu'à ce que vous le supprimiez |
| Session | 30 jours, puis suppression automatique |
| Réservation | supprimée avec votre compte |
| Avis laissé | supprimé avec votre compte |
| Photo de carte que vous envoyez | conservée dans le corpus interne, mais **déliée de vous** à la suppression du compte |
| Position | non conservée |

Les sessions expirées sont effacées automatiquement au démarrage du service.

## 6. Vos droits, et comment les exercer

Le règlement européen vous donne des droits sur vos données. Ils sont
directement accessibles dans le service, sans avoir à nous écrire.

**Accéder à vos données et les récupérer.** Une fois connecté, l'ensemble de ce
que nous détenons vous est rendu en JSON — un format structuré, lisible par
vous comme par un autre service.

```
GET /api/auth/mes-donnees
```

**Supprimer votre compte.** La suppression est immédiate et définitive. Elle
efface le compte, ses sessions, ses réservations et les avis que vous avez
laissés. Ce n'est pas une désactivation : votre adresse e-mail disparaît de la
base.

Les photos de carte que vous avez envoyées sont **déliées de vous** plutôt que
supprimées : elles documentent un restaurant, pas vous, et le corpus perdrait
sa valeur à chaque départ. Plus rien ne permet alors de savoir que vous en êtes
l'auteur.

```
DELETE /api/auth/compte
```

**Rectifier une donnée inexacte.** Écrivez-nous ; nous n'avons pas encore
d'écran pour cela.

**Vous opposer, ou retirer votre consentement.** Supprimez votre compte : c'est
la forme la plus complète de l'opposition, et elle est immédiate.

Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la
CNIL — [cnil.fr](https://www.cnil.fr).

## 7. Qui d'autre voit vos données

**Personne, sauf ce qui suit.**

Nous ne vendons aucune donnée, ne faisons aucune publicité, et n'utilisons
aucun traceur publicitaire.

Le service s'appuie sur des prestataires techniques :

| Prestataire | Rôle | Ce qu'il voit |
|---|---|---|
| Railway | hébergement du service et de la base | les données stockées, comme tout hébergeur |
| OpenStreetMap | fond de carte et référentiel des lieux | votre position approximative lors du chargement d'une carte |

Les données des restaurants — cartes, notes, horaires — proviennent de sources
publiques et d'un collecteur commercial. **Elles ne vous concernent pas** : ce
sont des informations sur des établissements, pas sur des personnes.

## 8. Sécurité

- Les mots de passe sont stockés sous forme d'**empreinte bcrypt**, jamais en
  clair ni de façon réversible.
- Les sessions reposent sur un **jeton opaque** — une suite de caractères
  tirée au hasard, qui ne contient aucune information sur vous.
  - **Sur le site**, il est transmis par un cookie `httpOnly` : aucun script de
    la page ne peut le lire, ce qui limite le vol de session.
  - **Dans l'application mobile**, il est conservé dans l'espace sécurisé du
    téléphone — le Trousseau sur iOS, le Keystore sur Android — chiffré par le
    système et effacé à la désinstallation.
  - C'est **le même compte** des deux côtés, et la même session : vous
    déconnecter d'un côté n'affecte pas l'autre, chaque appareil ayant la
    sienne.
- Les tentatives de connexion sont **limitées en nombre**, pour empêcher qu'un
  mot de passe soit deviné par essais répétés.
- Les journaux du service **masquent systématiquement** mots de passe, jetons et
  clés.

Aucune de ces mesures ne rend un service invulnérable, et nous ne le
prétendons pas.

## 9. Changements

Toute modification de ce document sera datée en tête. Si un changement affecte
ce que nous collectons ou pourquoi, nous en informerons les personnes
concernées.
