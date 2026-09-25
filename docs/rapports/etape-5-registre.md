# Rapport d'étape 5 — Registre national agricole

- Branche : `feature/farm-registry` (fusionnée dans `develop`)
- Date : 25 septembre 2026
- Périmètre : registre des exploitations côté agent de terrain (hors ligne d'abord) et côté producteur, synchronisation idempotente, file de vérification, déclaration de récolte, restriction des données individuelles au périmètre de chaque compte.

## Terminé

- **Espace agent** (`/agent`) : accueil avec périmètre, chiffres et dernières mises à jour ; liste des exploitations avec recherche (nom, numéro, code) et filtre par statut ; fiche en quatre onglets (résumé, parcelles, historique des récoltes et des événements, activité de l'appareil) ; navigation basse sur téléphone, puce de synchronisation toujours visible.
- **Enregistrement hors ligne** (`/agent/enregistrer`) : sept écrans courts, brouillon écrit à chaque écran et repris depuis `/agent/en-cours` ; commune déduite de la position GPS sur l'appareil (point-dans-polygone sur les limites embarquées) avec saisie manuelle de repli ; parcelles déclarées ; cultures proposées selon la zone agro-écologique ; sous-saison déduite du mois et du régime des pluies ; consentement obligatoire ; code provisoire remplacé par le code officiel à la synchronisation.
- **Premier lancement** (`/agent/premier-lancement`) : téléchargement en un geste du référentiel du périmètre et des exploitations connues.
- **Vérification terrain** (`/agent/verification`) : file priorisée (écart de surface, grande surface, sans parcelle, ancienneté) ; visite en trois écrans (identité, position, résultat) ; le résultat fait passer l'exploitation en « Vérifiée sur le terrain » ou « Contestée ».
- **Synchronisation** : commandes numérotées dans une file locale (Dexie), envoi par lots de 50 au retour du réseau, toutes les cinq minutes et à la demande ; serveur idempotent (clé par commande), dépendances résolues dans le lot, autorisation sur la ressource réelle, une transaction par commande avec fil d'événements et journal ; une seule synchronisation à la fois par compte (onglets et composants) et verrou par clé côté serveur ; erreurs en français, « Réessayer » et « Abandonner » dans `/agent/synchronisation`.
- **Espace producteur** (`/agriculteur`) : « Mon exploitation » (superficies déclarée et mesurée avec leur fiabilité, cultures de la campagne, dernière récolte) ; déclaration de récolte en trois questions dans l'unité locale avec équivalent en kilogrammes ; historique par campagne.
- **Hors ligne réel** : le service worker garde en cache les pages de l'agent et du producteur déjà visitées, le référentiel et la liste des exploitations ; une page de repli s'affiche pour une page jamais visitée ; la synchronisation et l'authentification ne passent jamais par le cache.
- **Confidentialité** : listes, fiches et points de la carte filtrés par périmètre dans la requête ; une fiche hors périmètre répond 404 ; les points d'exploitations ne sont plus servis à un visiteur anonyme.
- **API** : `POST /api/v1/sync`, `GET /api/v1/registry/farms`, `GET /api/v1/registry/farms/{id}`, `GET /api/v1/referentiel`.
- **Données de démonstration** : l'agricultrice de démonstration est rattachée à une exploitation de Djougou avec cultures de la campagne ouverte.
- **Base de démonstration propre** : les tests de bout en bout notent l'état de la base avant la suite et retirent ensuite tout ce qu'ils ont créé (producteurs de test, visites, récoltes, journal de synchronisation), en restaurant exactement les exploitations visitées ; `pnpm e2e:clean` fait le même ménage à la demande.
- **Documentation** : `docs/modules/registre.md` (module, cycle d'une saisie hors ligne, confidentialité, vérification), `docs/modules/carte.md` et `docs/modules/database.md` mis à jour.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires (file locale et synchronisation, contrat de lot, synchronisation unique, applicateur serveur et concurrence, rattachement de commune, commandes d'enregistrement et de visite, priorités, libellés, composants de saisie, parcours de récolte, existant) | `pnpm test` | 302 tests OK (32 fichiers) |
| Intégration (serveur de synchronisation sur PostgreSQL, récolte, périmètre des listes, fiches, référentiel et tuiles, existant) | `pnpm test:integration` | 44 tests OK (8 fichiers) |
| Bout en bout desktop et mobile (espace agent, premier lancement, enregistrement hors ligne puis synchronisation, visite de vérification, récolte de l'agricultrice, périmètre des API et des tuiles, pages ouvertes sans réseau par le service worker, existant) | `pnpm test:e2e` | 61 tests OK, 5 ignorés volontairement (profil desktop ou mobile uniquement) |
| Build, lint, types | `pnpm build`, `pnpm lint`, `pnpm typecheck` | OK |
| Vérification manuelle | captures desktop et mobile ci-dessous | OK |

## Résultat

OK.

## Captures

- [Accueil de l'agent](captures/etape-5/agent-accueil-desktop.png)
- [Enregistrement, écran de position, mobile](captures/etape-5/agent-enregistrer-mobile.png)
- [Fiche exploitation](captures/etape-5/agent-fiche-desktop.png)
- [File de vérification, mobile](captures/etape-5/agent-verification-mobile.png)
- [Synchronisation](captures/etape-5/synchronisation-desktop.png)
- [Accueil de l'agricultrice, mobile](captures/etape-5/agriculteur-accueil-mobile.png)
- [Déclaration de récolte, quantité, mobile](captures/etape-5/agriculteur-recolte-mobile.png)

## Problèmes rencontrés et décisions

- **Lots refusés en bloc** : le client n'envoyait l'identifiant d'appareil qu'en en-tête alors que le contrat l'exige dans chaque commande ; tout lot était refusé et la file restait en attente. Corrigé, et le test unitaire vérifie désormais que le lot envoyé passe le schéma du serveur tel quel.
- **Envois concurrents** : la puce d'en-tête et l'écran de fin d'enregistrement lançaient chacun une synchronisation ; deux lots identiques partaient ensemble et le second échouait sur les clés primaires. Double correction : une seule synchronisation par compte côté client (verrou partagé, Web Locks entre onglets) et verrou consultatif PostgreSQL par clé d'idempotence côté serveur ; un échec ne remplace jamais une application réussie.
- **Renvoi reconnu** : une commande renvoyée après une coupure au mauvais moment revient « DUPLICATE » ; elle s'affiche « Enregistrée », comme le prévoit le contrat.
- **Barre d'action mobile** : la barre fixe des formulaires passait sous la navigation basse ; elle se pose désormais au-dessus.
- **Frontières de couches** : le socle hors ligne (`lib/offline`) partage les contrats du domaine en types seulement ; la règle ESLint l'autorise explicitement pour les imports de type.
- **Adresse de l'assistant hors ligne** : à l'ouverture, l'assistant ajoutait l'identifiant du brouillon à l'adresse par une navigation Next, donc par un aller-retour serveur ; hors ligne, la page basculait ailleurs. L'adresse est désormais mise à jour par l'API d'historique du navigateur, sans réseau.
- **Préchargement d'un point de contrôle** : le lien « État du service » du pied de page était préchargé comme une page et restait en attente ; c'est désormais un lien simple.
- **Tracé de parcelle** : le serveur accepte déjà les contours (`parcel.geometry.set`, surface calculée par PostGIS, conflit de version) ; l'interface de tracé (marche GPS, dessin) est reportée à l'étape 9 avec les fonds de carte hors ligne.

## Reste à faire (suivi)

- Interface de tracé de parcelle, photos de visite, changement de numéro du producteur.
- Écran de résolution de conflit champ par champ avec les premières commandes de modification.
- Chiffrement applicatif de la base locale.

## Commits

```
feat(database): add declarations, verifications, events and sync log
feat(sync): add offline command contract, server applier and outbox client
feat(registry): add scoped farm services, referentiel and read api
feat(ui): add registry form components for amounts, crops, position and sync
feat(farm): build the agent registry space with offline enrolment
feat(farm): build the farmer space with harvest declaration and history
fix(sync): send the device id with each command and reflect server codes
fix(farm): keep wizard actions above the agent bottom navigation
docs(registry): document the registry module and adjust the farmer e2e check
fix(sync): serialize concurrent batches per idempotency key and per account
fix(farm): show a resent command recognized by the server as saved
feat(pwa): cache the agent and farmer spaces for offline use
test(farm): cover agent enrolment, sync, visit and harvest end to end
fix(ui): stop prefetching the health endpoint as a page
fix(farm): show french labels and positions on the agent farm card
fix(farm): show harvest quantities with french unit labels
test(farm): clean end to end data from the demonstration database
fix(farm): update the enrolment address without a server round trip
test(farm): wait for the synced farmer in the server rendered list
docs(farm): add the step 5 report and screenshots
```

## Prochaine étape

Étape 6 — Monitoring agricole : données météorologiques par commune, règles d'alerte déclaratives en JSON (sécheresse, excès de pluie, calendrier cultural), génération et diffusion des alertes (WhatsApp par wapy.pro, SMS, application), tableau de suivi. Branche `feature/agri-monitoring`.

## Guide de test

```bash
git checkout develop && pnpm install
pnpm db:migrate && pnpm db:seed
pnpm build && pnpm start          # le service worker n'est actif qu'en production
```

1. **Agent** : http://localhost:3000/connexion, numéro `01 90 00 00 01`, code `246810`. L'accueil montre le périmètre (Djougou) et le rappel « Préparez le travail sans réseau ».
2. **Premier lancement** : « Télécharger maintenant », attendez « Terminé ».
3. **Hors ligne** : ouvrez « Enregistrer » une fois, puis coupez le réseau (outils du navigateur, onglet Réseau, « Hors ligne », ou mode avion sur téléphone). Déroulez l'enregistrement : nouveau producteur, « Saisir la position à la main » (9,70 et 1,67), la commune Djougou est déduite ; superficie, parcelle, culture, consentement, « Enregistrer ». La puce indique « 1 en attente » ou plus.
4. **Retour du réseau** : réactivez-le ; la puce passe à « À jour » et « Exploitations » montre le producteur avec son code officiel `BJ-DON-DJO-…`.
5. **Vérification** : « À vérifier », choisissez une exploitation, « Oui », position, « Confirmée », « Valider la visite » ; la fiche passe à « Vérifiée sur le terrain ».
6. **Agricultrice** : déconnectez-vous, connectez-vous avec `01 90 00 00 02`. « Déclarer ma récolte » : culture, quantité en sacs de 100 kg (l'équivalent en kilogrammes s'affiche), pertes ; « Mon historique » montre la récolte.
7. **Confidentialité** : sans être connecté, `curl -i http://localhost:3000/api/v1/registry/farms` répond 401 et `curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/tiles/farms/8/129/121.pbf` répond 204.
