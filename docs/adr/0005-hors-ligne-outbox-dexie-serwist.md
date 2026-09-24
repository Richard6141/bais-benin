# ADR-0005 — Hors-ligne d'abord : Serwist, Dexie et file d'attente outbox avec idempotence serveur

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Architecte, Frontend, QA

## Contexte

L'agent de terrain doit ouvrir l'application, enregistrer une exploitation, saisir des informations, sauvegarder localement et synchroniser plus tard, dans des zones sans réseau. Les référentiels (communes, cultures) doivent être disponibles hors-ligne.

## Options étudiées

1. Base répliquée automatiquement (RxDB, PouchDB/CouchDB, ElectricSQL, PowerSync) — puissantes, mais elles imposent un modèle de réplication, une infrastructure supplémentaire ou une dépendance commerciale, et rendent le débogage plus opaque pour une équipe réduite.
2. Cache de requêtes avec réessai (TanStack Query persist) — insuffisant pour des créations multi-entités ordonnées.
3. Service worker Serwist + IndexedDB via Dexie + file d'attente de commandes (outbox) + point d'entrée de synchronisation idempotent — retenu.

## Décision

- Serwist met en cache l'app shell, les référentiels versionnés et les dernières tuiles consultées.
- Dexie stocke les brouillons et les entités connues de l'agent, chiffrés applicativement.
- Chaque mutation hors-ligne devient une commande (`type`, `payload`, `clientId` UUIDv7, `idempotencyKey`, `clientCreatedAt`) dans la table `outbox`.
- Au retour du réseau, un envoi par lots ordonnés vers `/api/v1/sync` ; le serveur enregistre chaque clé dans `sync_command`, valide, autorise, applique et renvoie l'état canonique ou un conflit.
- Résolution de conflits : la vérification terrain l'emporte ; sinon la dernière écriture, avec journalisation ; les divergences de champs métiers sont présentées à l'agent.

## Conséquences

- Modèle explicite et testable (rejouer un lot deux fois produit le même état).
- Le périmètre de la réplication est volontairement limité aux entités du registre créées ou modifiées par l'agent ; les lectures globales restent en ligne.
- Migration possible vers une solution de réplication complète si le besoin de collaboration temps réel apparaît.
