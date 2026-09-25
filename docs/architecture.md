# Architecture

Vue d'ensemble à jour du code réel, à la fin de l'étape 9 (durcissement production). Les
décisions structurantes sont tracées dans `docs/adr/` (ADR-0001 à ADR-0011, résumées en §2) ;
`docs/02-architecture.md` reste la note de cadrage initiale (antérieure à l'implémentation) et
diverge par endroits de ce document — celui-ci fait foi pour l'état actuel du code.

## 1. Vue d'ensemble

BAIS est une application **full-stack Next.js 16 (App Router, TypeScript strict)** adossée à
**PostgreSQL 16 + PostGIS**, structurée en couches (`app/` → `features/` → `modules/` /
`services/` → `lib/`) dont le sens de dépendance est vérifié par `eslint-plugin-boundaries`
(`eslint.config.*`), pas seulement par convention.

```
Clients : PWA agent (hors ligne) · web agriculteur · web coopérative/acheteur (accueil) ·
          centre de pilotage ministère
                              │ HTTPS, Server Actions, Route Handlers /api/v1
Next.js 16 (Node.js)
  app/       routes, layouts par espace, groupes (auth)/(public)/(spaces)
  features/  UI par cas d'usage (composants + hooks), jamais de Prisma direct
  modules/   domaine : analytics, audit, authorization, identity, monitoring, privacy,
             registry, sync, territory
  services/  ports + adaptateurs : identity (ANIP), messaging (wapy/console/fixture),
             weather (Open-Meteo/fixture)
  lib/       transverse : auth (better-auth), env (Zod), logger (pino), crypto, geo, offline
                              │ Prisma 7 + SQL PostGIS (src/database/sql)
PostgreSQL 16 + PostGIS — registre, géométries, alertes, audit, vues matérialisées d'agrégats
```

## 2. ADR (décisions actées)

| ADR | Décision |
|---|---|
| 0001 | Next.js full-stack plutôt que NestJS séparé |
| 0002 | Prisma + PostGIS (géométries en SQL brut typé, le reste en Prisma) |
| 0003 | Authentification par Auth.js + OTP — **remplacée en cours de route, voir ADR-0010** |
| 0004 | Autorisation RBAC + périmètre territorial (moteur `authorize()` maison) |
| 0005 | Hors ligne : outbox Dexie + Serwist |
| 0006 | Déploiement Docker Compose et Vercel, sans branchement propre à un hébergeur |
| 0007 | wapy.pro comme canal de messagerie (jamais comme fournisseur d'identité) |
| 0008 | Prisma 7, adaptateur `pg`, Serwist via Turbopack |
| 0009 | Géométries départementales dérivées des géométries communales |
| 0010 | **better-auth remplace Auth.js** (sessions en base révocables, greffons OTP téléphone et TOTP) |
| 0011 | Alertes par règles déclaratives, météo Open-Meteo |

## 3. Modules de domaine (état réel, `src/modules/`)

| Module | Responsabilité |
|---|---|
| `identity` | Utilisateurs, rôles, périmètres, rattachement NPI (ANIP) |
| `territory` | Départements, communes, géométries, référentiel géographique |
| `registry` | Agriculteurs, exploitations, parcelles, cultures, campagnes, récoltes, vérification terrain |
| `sync` | Réception des lots hors-ligne, idempotence, autorisation par commande, résolution de conflits |
| `monitoring` | Observations météo, règles déclaratives, évaluation, alertes, diffusion (wapy.pro), webhook entrant |
| `analytics` | Agrégats territoriaux et par culture, vues matérialisées, tableau de bord, secret statistique, exports |
| `authorization` | Moteur de politiques `authorize(actor, action, resource)`, périmètre territorial |
| `audit` | Journal d'audit en ajout seul, adresse IP hachée par HMAC |
| `privacy` | Purge/anonymisation périodique des données personnelles au-delà de leur délai de conservation |

Les modules `market` (mise en relation acheteurs/producteurs) et `assistant` (agricole, IA) sont
mentionnés dans la note de cadrage initiale mais **ne sont pas encore implémentés** dans ce
dépôt : les espaces acheteur et coopérative sont des écrans d'accueil en attente de ces modules
(voir `docs/guide-utilisateur.md`). Un module `assistant` est développé en parallèle sur une autre
branche, non fusionnée à la date de cette étape.

## 4. Flux principaux

### 4.1 Enregistrement hors ligne par un agent

1. Premier lancement en réseau : le service worker (`src/app/sw.ts`) précache l'app shell ; le
   référentiel et les exploitations assignées sont copiés dans IndexedDB (Dexie,
   `src/lib/offline/db.ts`, une base par utilisateur — `bais-agent-<userId>`).
2. Chaque saisie (producteur, exploitation, parcelle, culture) devient une commande immuable
   ajoutée à une file d'attente locale (l'« outbox », `src/lib/offline/outbox.ts`), avec un
   identifiant client et une clé d'idempotence.
3. Au retour du réseau, le lot est envoyé à `POST /api/v1/sync`. Le serveur (`src/modules/sync`)
   rejoue chaque commande une seule fois (table `sync_command` indexée sur la clé
   d'idempotence), l'autorise (`authorize()` sur la ressource réelle, pas déclarée par le client),
   l'applique dans une transaction, journalise l'événement et l'audit.
4. La fiabilité d'une saisie (`FIELD_VERIFIED`, `AGENT_VERIFIED`) est déduite du **rôle qui a
   autorisé la commande** (`context.grantRole`, résolu par `apply.ts` avant d'appeler le
   handler), jamais d'un champ envoyé par le client — durci à l'étape 9 (voir §6).

### 4.2 Alerte météo

1. Une tâche planifiée (`docker/scheduler` en Docker, `vercel.json` sur Vercel, protégées par
   `CRON_SECRET`) appelle `/api/v1/monitoring/ingest` : observations et prévisions Open-Meteo par
   commune, normalisées avec source et fiabilité.
2. Le moteur de règles (`src/modules/monitoring/rules`) évalue les règles actives par zone et
   culture ; une alerte est créée et rattachée aux exploitations concernées.
3. `/api/v1/monitoring/dispatch` (planifiée toutes les 10 minutes) diffuse selon le canal
   configuré (wapy.pro en production).
4. Le webhook entrant `POST /api/v1/webhooks/wapy` reçoit accusés de remise et réponses,
   authentifiés par HMAC (`X-Wapy-Signature`) et soumis depuis l'étape 9 à une fenêtre de
   fraîcheur de 15 minutes sur l'horodatage signé, contre le rejeu (`modules/monitoring/delivery/webhook.ts`).

### 4.3 Lecture du pilotage national

Les pages `/pilotage/*` et la carte publique `/carte` lisent des agrégats (vues matérialisées
`mv_farm_stats_by_commune`, `mv_crop_stats_by_commune`, rafraîchies après synchronisation et au
plus toutes les heures). Toute case résumant moins de cinq exploitations est masquée
(`k-anonymity.ts`, k = 5) — appliqué dans le module, jamais dans l'interface, y compris depuis
l'étape 9 sur l'API publique `/api/v1/territory/stats` (voir §6).

## 5. API et contrats

- Server Actions typées pour les mutations propres à une page ; `app/api/v1/*` pour la
  synchronisation hors ligne, les intégrations externes et ce que Playwright/les scripts
  appellent directement.
- Chaque route et action a un schéma Zod d'entrée (et de sortie pour les agrégats).
- `GET /api/health` : sonde de santé (base de données), sans configuration révélée — utilisée par
  le `HEALTHCHECK` Docker.
- Deux familles d'authentification API : session better-auth (cookie) pour les pages et la
  plupart des routes ; secret partagé (`CRON_SECRET`, `WAPY_WEBHOOK_SECRET`) pour les appels
  serveur-à-serveur sans session (planificateur, webhook).

## 6. Sécurité — état réel et limites connues

L'étape 9 a fait l'objet d'une revue de sécurité et d'un durcissement ciblé ; ce qui suit
distingue ce qui est traité de ce qui reste, honnêtement.

### Traité à l'étape 9

- **Secrets** : `AUTH_SECRET` obligatoire dès `NODE_ENV=production` (plus de repli codé en dur) ;
  `APP_ENV` fail-closed (défaut `production` si non précisé) ; `AUDIT_IP_HASH_KEY` obligatoire en
  production, adresse IP journalisée par HMAC plutôt qu'un hachage nu (réversible par table
  précalculée sur l'espace IPv4).
- **Comptes et code de démonstration** : liste blanche exacte des numéros de démonstration
  (`isDemoPhone`) plutôt qu'un motif large ; code fixe et comptes de démonstration entièrement
  désactivés en production ; compteur de tentatives sur le code à usage unique reproduit fidèlement
  (le greffon better-auth le désactive entièrement dès qu'on personnalise la vérification).
- **Appareil partagé** : les routes de données de registre passent de `StaleWhileRevalidate` à
  `NetworkOnly` dans le service worker ; la déconnexion vide les caches et la base locale du
  compte ; `SessionIdentityGuard` détecte une page servie depuis le cache d'un autre compte et
  force un rechargement ; le cache des pages authentifiées est réduit à un jour.
- **API** : `getApiActor` applique désormais les mêmes contrôles que les pages (suspension de
  compte, limite de 12 h pour les comptes institutionnels, double authentification obligatoire
  pour l'administration nationale) ; `/api/v1/sync` en bénéficie.
- **Confiance réseau** : `X-Forwarded-For` n'est crédité que derrière un relais listé dans
  `TRUSTED_PROXIES` ; limite d'envoi de code par numéro de téléphone, indépendante de la limite
  par IP.
- **Journalisation** : le canal `console`/`fixture` (qui n'envoie rien réellement, et journalise
  le code en clair en développement) est interdit en production ; le journal masque aussi
  `code`, `authorization`, `cookie`.
- **Confiance dans les saisies** : la fiabilité d'une saisie de terrain vient du rôle qui a
  autorisé la commande, jamais d'un champ envoyé par le client.
- **Secret statistique étendu** : l'API publique `/api/v1/territory/stats` applique désormais le
  même masquage à k = 5 que le tableau de bord interne.
- **En-têtes** : Content-Security-Policy et Strict-Transport-Security ajoutés
  (`next.config.ts`), vérifiés contre la carte MapLibre.
- **Infrastructure** : `docker-compose.yml` n'a plus de secret par défaut, ports liés à
  `127.0.0.1`, healthcheck sur l'application.
- **Rétention** : purge périodique (`pnpm db:purge`) de la charge utile des commandes de
  synchronisation après 180 jours et du détail libre du journal d'audit après un an.
- **Rejeu** : les webhooks wapy.pro rejettent un événement dont l'horodatage signé sort d'une
  fenêtre de 15 minutes.

### Limites connues, non traitées ou traitées partiellement

- **Secret statistique et croisement de filtres** : le masquage à k = 5 protège chaque réponse
  individuellement, mais rien n'empêche de reconstituer un effectif masqué en croisant plusieurs
  appels avec des filtres `verificationStatus` complémentaires (attaque par différenciation). Non
  traité à cette étape ; pistes possibles : restreindre les combinaisons de filtres autorisées sur
  la route publique, ou surveiller les séquences de requêtes similaires depuis une même origine.
- **CSP sans nonce** : la politique de sécurité du contenu autorise `'unsafe-inline'` pour les
  scripts et styles (Next.js n'injecte pas facilement un nonce par requête sans middleware dédié)
  — une protection réelle contre l'injection de script reste à construire si le besoin se
  confirme.
- **Assistant IA** : non implémenté dans ce dépôt ; ses propres garde-fous (citations obligatoires,
  seuil de confiance) restent à vérifier une fois la branche fusionnée.
- **Module marché** : non implémenté ; les espaces acheteur et coopérative sont des accueils
  d'attente.
- **HSTS sans préchargement** : `Strict-Transport-Security` est posé sans `preload` (engagement
  irréversible auprès des navigateurs, hors périmètre d'une décision technique seule).

## 7. Exploitation

- **Journalisation** : pino structuré, un identifiant de corrélation par requête d'audit,
  redaction des champs sensibles (`src/lib/logger.ts`).
- **Santé** : `GET /api/health`, utilisée par le `HEALTHCHECK` Docker.
- **Tâches planifiées** : ingestion météo quotidienne, diffusion d'alertes toutes les 10 minutes,
  purge des données personnelles (mensuelle recommandée, à ajouter au planificateur).
- **Sauvegardes** : non couvertes par ce dépôt (dépend de l'hébergeur retenu — volumes Docker ou
  service managé).
- **Vues matérialisées** : rafraîchies après synchronisation et au plus toutes les heures ; voir
  `docs/modules/tableau-de-bord.md`.

## 8. Évolutions futures

| Évolution | Point d'accroche déjà prévu |
|---|---|
| Module marché | Espaces acheteur/coopérative déjà en place comme accueils |
| Assistant IA | Branche séparée en cours ; principes de durcissement de cette étape à leur appliquer une fois fusionnée |
| API ANIP réelle | Port `IdentityVerificationProvider`, adaptateur `anip-xroad` déjà esquissé |
| Nonce CSP | Middleware dédié pour un nonce par requête |
| Rattachement coopérative | Lien exploitation ↔ organisation dans le registre |
| Multi-pays | `territory` déjà paramétré par référentiel versionné |
