# Registre national des exploitations

Ce document décrit le registre livré à l'étape 5 : ce que voient l'agent de terrain et le producteur, comment les saisies faites sans réseau rejoignent la base nationale, et comment étendre le module. La spécification écran par écran reste dans `docs/modules/registre-parcours-ux.md` ; les décisions d'architecture sont dans ADR-0005 (hors-ligne) et docs/04 §10 (`SyncCommand`).

## Ce que voit l'utilisateur

### Agent de terrain (`/agent`)

- **Accueil** : périmètre (communes affectées), trois chiffres (exploitations, à vérifier, vérifiées sur le terrain), raccourcis, dernières mises à jour, et un rappel « Préparez le travail sans réseau » tant que le référentiel n'est pas téléchargé.
- **Premier lancement** (`/agent/premier-lancement`) : téléchargement en un geste du référentiel du périmètre (communes avec géométrie simplifiée, cultures, campagnes, unités) et des exploitations connues ; « Mettre à jour » ensuite.
- **Enregistrer une exploitation** (`/agent/enregistrer`) : sept écrans courts, chaque écran validé est écrit dans un brouillon local ; la commune est déduite de la position GPS par point-dans-polygone sur les géométries embarquées ; superficie en hectares, faire-valoir, irrigation ; parcelles déclarées (superficie seule) ; cultures de la campagne proposées selon la zone agro-écologique ; récapitulatif avec l'origine de chaque valeur et consentement ; code provisoire remplacé par le code officiel à la synchronisation.
- **En cours** (`/agent/en-cours`) : brouillons à reprendre, étape atteinte, ancienneté.
- **Exploitations** (`/agent/exploitations`) : recherche par nom, numéro ou code, filtre par statut, exploitations enregistrées sur l'appareil en tête ; fiche avec onglets Résumé, Parcelles, Historique (récoltes et fil d'événements), Activité (commandes de l'appareil pour cette exploitation).
- **À vérifier** (`/agent/verification`) : exploitations déclarées sans visite, motifs de priorité calculés (écart de surface, grande surface, sans parcelle, ancienne) ; visite en trois écrans (identité, position, résultat) ; le résultat fait passer le statut (`FIELD_VERIFIED` ou `DISPUTED`).
- **Synchronisation** (`/agent/synchronisation`) : toutes les commandes avec leur état, l'erreur en français, « Réessayer » ou « Abandonner » ; conflits de version affichés champ par champ.
- **Puce de synchronisation** : toujours visible (à jour, N en attente, en cours, hors ligne, erreur) ; un tap synchronise.

### Producteur (`/agriculteur`)

- **Mon exploitation** : nom, code, commune et village, superficie déclarée et mesurée avec leur fiabilité, cultures de la campagne en pictogrammes, dernière récolte, bouton « Déclarer ma récolte ».
- **Déclarer ma récolte** (`/agriculteur/recolte`) : trois questions (culture, quantité dans l'unité locale avec équivalent en kilogrammes, pertes facultatives) et un écran de confirmation ; l'écran de la culture est sauté quand il n'y en a qu'une.
- **Mon historique** (`/agriculteur/historique`) : par campagne, cultures, surfaces, récoltes déclarées et fil d'événements, comparaison avec la campagne précédente.

## Architecture

| Couche | Emplacement | Rôle |
|---|---|---|
| Contrat de commande | `src/modules/sync/commands.ts` | schémas Zod des sept commandes (`farmer.create`, `farm.create`, `parcel.create`, `parcel.geometry.set`, `cropSeason.declare`, `harvest.declare`, `verification.record`), enveloppe, lot de 50 au plus |
| Serveur de synchronisation | `src/modules/sync/apply.ts`, `src/modules/sync/handlers/*` | idempotence par clé, dépendances dans le lot, autorisation sur la ressource réelle, une transaction par commande, `FarmEvent` et `sync_command` écrits avec la donnée, audit hors transaction |
| Route | `src/app/api/v1/sync/route.ts` | session requise, `X-Device-Id` obligatoire, corps ≤ 2 Mo, `{ results, receivedAt }` |
| Lectures du registre | `src/modules/registry/farms.ts`, `harvest.ts`, `referentiel.ts`, `scope.ts` | listes et fiches filtrées par périmètre en base, file de vérification, cultures déclarables et historique, référentiel embarqué, périmètre en communes |
| Routes de lecture | `src/app/api/v1/registry/farms`, `/farms/[id]`, `/api/v1/referentiel` | mêmes services, réponses privées (`no-store`) |
| Socle hors-ligne | `src/lib/offline/*` | base Dexie par utilisateur (`drafts`, `outbox`, `referentiel`, `farms`), file de commandes numérotées, client de synchronisation par lots, cache du référentiel, identifiant d'appareil, hook `useSync` |
| Interface agent | `src/features/registry/agent/*`, `src/features/registry/enrolment/*`, `src/features/registry/verification/*` | coque et navigation, listes et fiche, assistant d'enregistrement, visite, file de synchronisation, premier lancement |
| Interface producteur | `src/features/registry/harvest/*` | assistant de déclaration de récolte (Server Action), sélecteur de campagne |
| Composants de saisie | `src/components/forms/{unit-amount-field,crop-picker,location-picker,gps-precision-hint,sync-status-chip}.tsx` | quantité et unité locale, pictogrammes de cultures, position GPS avec précision et saisie manuelle, puce d'état |

## Cycle d'une saisie hors ligne

1. L'agent valide un écran : la section est écrite dans `drafts` (Dexie). Fermer l'application ne perd rien.
2. À l'enregistrement, le brouillon devient une suite de commandes dans `outbox`, numérotées, avec leurs dépendances (`farm.create` dépend de `farmer.create`, etc.). L'exploitation apparaît aussitôt dans `farms` avec un code provisoire et l'état `LOCAL_ONLY`.
3. `useSync` envoie l'outbox par lots de 50 quand le réseau revient, toutes les cinq minutes s'il reste des commandes, et à la demande. Chaque lot porte `X-Device-Id`.
4. Le serveur répond commande par commande : `APPLIED` (avec identifiant, code et version serveur), `DUPLICATE` (clé déjà vue, résultat mémorisé), `REJECTED` (code et message en français), `CONFLICT` (version serveur des champs divergents).
5. Le client met à jour `outbox` et reflète les résultats dans `farms` : code officiel, version, `SYNCED`. Une commande refusée reste visible avec son message ; celles qui en dépendent sont refusées par le serveur (`DEPENDENCY_FAILED`) et peuvent être renvoyées après correction.

## Données et confidentialité

- Le périmètre est appliqué dans la requête (`scopeFilter` traduit en clause Prisma ou en liste d'identifiants de communes) : aucune ligne hors périmètre ne quitte la base, une fiche hors périmètre répond 404.
- Les points d'exploitations de la carte (`/api/tiles/farms/…`) ne sont servis qu'à un compte connecté, dans son périmètre ; un visiteur anonyme reçoit une tuile vide.
- La base locale porte l'identifiant du compte dans son nom : un téléphone partagé ne mélange pas les saisies. Elle est effacée à la révocation de l'appareil (`deleteAgentDatabase`).
- Chaque commande appliquée écrit un `FarmEvent` et une ligne `sync_command` (appareil, utilisateur, horodatages, résultat), et une entrée d'audit `registry.*`.
- Le consentement du producteur est obligatoire à l'enregistrement et conservé dans l'audit.

## Reste à faire

- Relevé de contour (marche GPS, dessin sur carte) : les commandes `parcel.geometry.set` et le calcul de surface serveur sont en place ; l'interface de tracé viendra avec les tuiles hors ligne (étape 9).
- Photos de visite (`attachment.upload`) et changement de numéro du producteur (`farmer.phoneChange`).
- Résolution de conflit champ par champ : le conflit est affiché ; l'écran « Garder la mienne / Prendre celle-là » viendra avec les premières commandes `*.update`.
- Chiffrement applicatif de la base locale (clé dérivée de la session).

## Vérifier

```bash
pnpm test -- src/lib/offline src/features/registry src/modules/sync src/components/forms   # unitaires
pnpm test:integration                                                                    # synchronisation, récolte, périmètre, tuiles
pnpm build && pnpm test:e2e                                                              # parcours agent et producteur, hors ligne compris
```
