# 02 — Architecture logicielle

> Rédigé par : Architecte logiciel, avec les agents Backend/Data, DevOps et Sécurité.
> Les décisions structurantes sont tracées dans `docs/adr/`.

## 1. Vue d'ensemble

BAIS est une application **full-stack Next.js 16 (App Router)** adossée à **PostgreSQL 16 + PostGIS 3.4**, organisée en **modules de domaine** indépendants du framework. Le frontend est une **PWA hors-ligne d'abord**. Les intégrations externes (identité, météo, messagerie, IA) passent par des **ports** (interfaces TypeScript) et des **adaptateurs** interchangeables.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Clients                                                                 │
│  PWA mobile agent (offline)  ·  Web agriculteur  ·  Web coopérative /   │
│  acheteur / commune  ·  Centre de pilotage ministère (desktop large)     │
└───────────────┬───────────────────────────────────────┬──────────────────┘
                │ HTTPS · Server Actions · Route Handlers│
┌───────────────▼───────────────────────────────────────▼──────────────────┐
│  Next.js 16 (Node.js runtime, Fluid Compute ou conteneur)                │
│                                                                          │
│  app/            routes, layouts, groupes par espace                     │
│  features/       tranches UI par cas d'usage (composants + hooks)        │
│  modules/        DOMAINE : entités, schémas Zod, règles, services,       │
│                  politiques d'accès, dépôts (repositories)               │
│  services/       PORTS + ADAPTATEURS : identité, météo, notifications,   │
│                  IA, géo, stockage                                       │
│  lib/            transverse : auth, env, logger, result, i18n, crypto    │
└───────────────┬───────────────────────────────────────┬──────────────────┘
                │ Prisma 7 + SQL PostGIS                 │ HTTP sortant
┌───────────────▼──────────────┐   ┌────────────────────▼──────────────────┐
│ PostgreSQL 16 + PostGIS       │   │ Externes (tous optionnels)            │
│ · registre, géométries        │   │ · Open-Meteo (météo, sans clé)        │
│ · alertes, marché, audit      │   │ · wapy.pro (WhatsApp) · SMS · e-mail  │
│ · vues matérialisées agrégats │   │ · AI Gateway / le modèle (assistant)     │
│ · pgvector (corpus IA)        │   │ · ANIP (futur) · INStaD (futur)       │
└───────────────────────────────┘   └───────────────────────────────────────┘
```

## 2. Choix techniques et justifications

| Sujet | Choix | Pourquoi (résumé, détail en ADR) |
|---|---|---|
| Framework | Next.js 16.3 App Router, TypeScript strict | Imposé ; un seul déploiement, Server Components pour la performance en faible débit, Server Actions typées pour les mutations |
| Backend | Full-stack Next.js, pas de NestJS | ADR-0001. Un service unique suffit pour la V1 ; la couche `modules/` est indépendante de Next et pourra être extraite vers NestJS ou des workers si la charge l'exige |
| Base | PostgreSQL 16 + PostGIS 3.4 + pgvector | Géométries natives, index GiST, agrégations territoriales en SQL, recherche vectorielle pour l'assistant sans service supplémentaire |
| ORM | Prisma 7 + migrations SQL manuelles pour PostGIS | ADR-0002. Prisma ne modélise pas `geometry` ; on garde les colonnes géométriques en `Unsupported` et on écrit les requêtes spatiales en SQL typé (`$queryRaw` avec Zod en sortie) |
| Validation | Zod 4 | Schémas partagés client/serveur, dérivation des types, validation à la frontière de chaque Server Action et route |
| Authentification | Auth.js v5 (next-auth) + fournisseurs personnalisés | ADR-0003. Sessions JWT courtes + rotation, OTP téléphone, identifiants e-mail pour institutions, fournisseur OIDC générique prêt pour l'ANIP |
| Autorisation | Moteur de politiques maison `can(actor, action, resource)` avec périmètre territorial | ADR-0004. RBAC seul ne suffit pas : un agent voit sa zone, pas son rôle |
| Hors-ligne | Serwist (service worker) + Dexie (IndexedDB) + file d'attente outbox | ADR-0005. Modèle simple, débogable, idempotent côté serveur |
| Cartographie | MapLibre GL JS 6, tuiles OSM (fournisseur raster public en dev, tuiles vectorielles auto-hébergées prévues), données en GeoJSON et tuiles vectorielles générées côté serveur | Imposé ; le format vectoriel permet des cartes riches en faible débit |
| UI | Tailwind 4, shadcn/ui, Motion 13 (ex Framer Motion) | Imposé ; design system custom par-dessus shadcn |
| Graphiques | Recharts via les composants chart de shadcn, D3 pour les cas avancés | Cohérence visuelle, SSR friendly |
| Tests | Vitest 5 + Testing Library, Playwright 1.63, base de test PostGIS en Docker | Unitaires co-localisés, intégration sur vraie base, parcours de bout en bout |
| Déploiement | Docker Compose (local et souverain), Vercel (démo), CI GitHub Actions | ADR-0006. Aucune API propre à un hébergeur dans le code applicatif |
| Observabilité | Logger structuré (pino), identifiant de corrélation par requête, table d'audit, OpenTelemetry prêt | Exigence d'audit du brief |

## 3. Les couches et leurs règles de dépendance

```
app  →  features  →  modules  →  lib
                 ↘  services ↗
```

- `app/` ne contient que du routage, des layouts et de la composition. Pas de logique métier.
- `features/` contient l'UI d'un cas d'usage et appelle les **services applicatifs** des modules via Server Actions. Une feature ne parle jamais directement à Prisma.
- `modules/` est le cœur : **aucune importation de `next/*`, de React ni de `features/`**. Un module expose `schemas` (Zod), `types`, `service` (cas d'usage), `repository` (accès données), `policies` (autorisations), `events` (événements de domaine).
- `services/` regroupe les ports (`interfaces`) et adaptateurs (`open-meteo`, `wapy`, `anip-stub`, `ai-gateway`). Les modules dépendent des ports, jamais des adaptateurs ; l'injection se fait dans `lib/container.ts`.
- `lib/` est technique et sans dépendance métier.

Cette règle est vérifiée par ESLint (`eslint-plugin-boundaries`) pour ne pas dépendre de la discipline seule.

## 4. Modules de domaine

| Module | Responsabilité | Dépend de |
|---|---|---|
| `identity` | Utilisateurs, comptes, rôles, périmètres, OTP, liens ANIP | — |
| `territory` | Départements, communes, arrondissements, villages, géométries, recherche géographique | — |
| `registry` | Agriculteurs, exploitations, parcelles, cultures, campagnes, déclarations, vérification | identity, territory |
| `monitoring` | Observations météo, règles, évaluation, alertes, diffusion | territory, registry |
| `market` | Offres, demandes d'achat, mises en relation | identity, registry |
| `assistant` | Sessions de conversation, corpus documentaire, recherche, scoring de confiance | registry, monitoring |
| `analytics` | Agrégats, vues matérialisées, indicateurs du centre de pilotage, qualité des données | tous (lecture seule) |
| `sync` | Réception des lots hors-ligne, idempotence, résolution de conflits | registry |
| `audit` | Journal immuable des actions sensibles | — |
| `notifications` | Orchestration multicanal (WhatsApp, SMS, e-mail, in-app) | identity |

## 5. Flux critiques

### 5.1 Enregistrement hors-ligne par un agent

1. L'agent ouvre la PWA ; le service worker sert l'app shell et le référentiel (communes, cultures, campagnes) mis en cache à la dernière connexion.
2. Il crée une exploitation : l'objet reçoit un **identifiant client UUIDv7**, est écrit dans Dexie (`drafts`) et une commande est ajoutée dans `outbox` avec une **clé d'idempotence**.
3. Le tracé de parcelle utilise la géolocalisation du navigateur ; les points sont stockés localement en GeoJSON.
4. Au retour du réseau, `sync` envoie les commandes par lots ordonnés. Le serveur rejoue chaque commande une seule fois (table `sync_command` indexée sur la clé d'idempotence), valide avec Zod, applique la politique d'accès de l'agent, écrit et renvoie l'état canonique.
5. Conflit (la même exploitation modifiée entre-temps par un autre acteur) : le serveur applique la règle « la vérification terrain gagne, sinon dernière écriture » et signale le conflit ; le client affiche une réconciliation manuelle uniquement si des champs métiers divergent.

### 5.2 Alerte hydrique

1. Une tâche planifiée (cron Vercel ou conteneur `worker`) récupère chaque jour les prévisions et observations par centroïde de commune via Open-Meteo.
2. Les observations sont normalisées et stockées avec source, date et fiabilité.
3. Le moteur de règles évalue les règles actives (ex. : température maximale supérieure à 36 °C sur 3 jours ET précipitations cumulées inférieures à 5 mm sur 10 jours ET cultures en phase sensible dans la zone).
4. Une alerte est créée par zone, rattachée aux exploitations concernées, et diffusée selon les préférences (WhatsApp via wapy.pro, SMS, in-app).
5. Le centre de pilotage la fait remonter avec le nombre d'exploitations et d'hectares touchés.

### 5.3 Question au ministère

Toutes les vues du centre de pilotage lisent des **vues matérialisées** rafraîchies à l'événement (après synchronisation) et au plus toutes les 5 minutes. Les filtres territoire × culture × campagne sont des index composites. Aucune requête du dashboard ne touche les tables de détail.

## 6. API et contrats

- **Interne** : Server Actions typées (mutation) et Server Components (lecture) ; un dossier `app/api/v1/` expose les mêmes cas d'usage en REST JSON pour la PWA hors-ligne (lots de synchronisation), les intégrations et les tests.
- **Contrat** : chaque route et action a un schéma Zod d'entrée et de sortie ; une spécification OpenAPI 3.1 est générée à partir des schémas pour la documentation partenaires.
- **Versionnage** : préfixe `/api/v1` ; toute rupture crée `/v2`.
- **Réponses** : enveloppe `{ data, meta: { source, generatedAt, reliability } }` sur les agrégats ; erreurs au format RFC 9457 (Problem Details).

## 7. Performance et faible débit

- Server Components par défaut, composants clients réservés à la carte, aux formulaires et aux graphiques interactifs.
- Budget : moins de 170 ko de JavaScript compressé sur l'espace agriculteur ; MapLibre chargé paresseusement.
- Compression Brotli, images AVIF, polices auto-hébergées avec sous-ensembles latins.
- Référentiels (communes, cultures) servis avec `Cache-Control: immutable` et versionnés.
- Données cartographiques en tuiles vectorielles simplifiées par niveau de zoom (`ST_SimplifyPreserveTopology`).

## 8. Déploiement

Deux cibles équivalentes, sans branchement dans le code :

- **Docker Compose** : `app` (Next standalone), `worker` (tâches planifiées), `db` (postgis/postgis:16-3.4 + pgvector), `tiles` (optionnel, Martin pour les tuiles vectorielles), reverse proxy Caddy avec TLS. C'est la cible « souveraine » recommandée pour un hébergement national.
- **Vercel** : app Next, Postgres avec PostGIS via une intégration du Marketplace (Neon ou Supabase), crons Vercel pour le worker.

Configuration par variables d'environnement validées au démarrage (`lib/env.ts`, Zod) ; l'application refuse de démarrer si une variable obligatoire manque.

## 9. Évolutions prévues par conception

| Évolution | Point d'accroche déjà prévu |
|---|---|
| API ANIP | Port `IdentityVerificationProvider` ; champ `npiHash` et `npiVerifiedAt` |
| Satellite / NDVI | Table `raster_layer` et couche MapLibre configurable ; port `RemoteSensingProvider` |
| USSD / SMS bidirectionnel | Module `notifications` avec canal entrant ; cas d'usage exposés hors UI |
| Extraction de services | Modules sans dépendance Next ; événements de domaine déjà émis |
| Multi-pays | `territory` paramétré par pays ; référentiels versionnés |
| API partenaires | OAuth2 client credentials + consentement par agriculteur, sur `/api/v1` déjà versionnée |
