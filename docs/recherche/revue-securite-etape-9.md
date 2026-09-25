# Revue de sécurité de l'application — plan de l'étape 9

- Date : 25 septembre 2026.
- Portée : application entière sur la branche du tableau de bord (develop et étape 7) et assistant agricole (étape 8). Revue en lecture seule : aucune modification pendant l'analyse ; chaque constat critique ou élevé a été vérifié dans le code.
- Axes : en-têtes HTTP et CSP, cookies et sessions, limites de débit, contrôle d'accès de chaque route API, Server Action et page (IDOR), requêtes SQL brutes, données personnelles dans les journaux, l'audit et les erreurs, secrets, export CSV, webhook et tâches planifiées, SSRF, service worker et données hors ligne, dépendances, images Docker, RGPD et APDP (loi 2017-20 portant code du numérique).
- Statut : les constats de l'assistant sont **corrigés à l'étape 8** ; tous les autres forment le plan de l'étape 9.

Gravité : Critique, Élevée, Moyenne, Faible. Chaque constat dit s'il bloque une **présentation** au ministère ou seulement un **déploiement réel**.

## Synthèse

Aucune injection SQL ; aucune fuite de secret côté client ; l'autorisation des listes, fiches et commandes de synchronisation est bien faite dans le domaine. Les failles se situent aux jointures : configuration par défaut de l'authentification, routes API moins contrôlées que les pages, cache du service worker partagé entre comptes, secret statistique incomplet, absence de politique de conservation.

## A. Bloque la présentation au ministère

### A1 — Critique : secret de session public si `AUTH_SECRET` manque
- `src/lib/auth/auth.ts:25` (`env.AUTH_SECRET ?? "secret-de-developpement-a-remplacer…"`), `src/lib/env.ts:61-84` (exigé seulement si `APP_ENV=production`, qui vaut `development` par défaut).
- Scénario : le cache de session est activé (`auth.ts:42`) ; le cookie `session_data` est signé avec ce secret. Sur une instance de démonstration où `APP_ENV` ou `AUTH_SECRET` est oublié, un attaquant forge une session `ADMIN_STATE` avec double authentification « activée », sans passer par la base.
- Correction : supprimer le repli ; exiger `AUTH_SECRET` dès `NODE_ENV=production` (hors phase de build) ; `APP_ENV` par défaut à `production`.

### A2 — Élevée : code OTP de démonstration sur une plage de numéros réels, sans compteur d'essais
- `src/lib/auth/phone.ts:30` (`isDemoPhone` = `^\+229019\d{7}$`), `auth.ts:104-109` et `138-144`.
- Dès qu'un `verifyOTP` personnalisé est fourni, better-auth 1.7.6 saute sa vérification native et son compteur (`plugins/phone-number/routes.mjs:177-183`) ; `verifyStoredOtp` compare sans incrément.
- Scénarios : si 01 9X correspond à d'anciens mobiles attribués (à vérifier auprès de l'ARCEP), le code fixe connecte, ou crée, le compte de n'importe quel abonné réel ; pour les autres numéros, force brute du code freinée seulement par la limite par IP, contournable (B4). Le code fixe est public dans le dépôt (`scripts/capture-screens.mjs:12`, repli `246810`).
- Correction : liste blanche exacte des numéros semés ; aucun `verifyOTP` personnalisé pour les autres numéros (chemin natif avec compteur) ; retirer le repli.

### A3 — Critique si deux comptes utilisent le même appareil : registre d'un utilisateur servi à un autre
- `src/app/sw.ts:72-81` : `StaleWhileRevalidate` sur `/api/v1/registry/farms*` et `/api/v1/referentiel`, clé = URL seule ; Serwist ignore `Cache-Control: private, no-store`. La déconnexion n'efface rien : `deleteAgentDatabase` (`src/lib/offline/db.ts:94`) n'est jamais appelée, aucun `caches.delete` (`sign-out-button.tsx:19-24`).
- Scénario : l'agent A télécharge ses données ; l'agent B se connecte sur le même téléphone et fait « premier lancement » ; la stratégie répond d'abord depuis le cache, même en ligne : B reçoit la liste de A (noms, téléphones hors de son périmètre) et l'écrit dans sa base locale.
- Correction : `NetworkOnly` pour `/api/v1/registry/**` et `/api/v1/referentiel` (la base locale assure le hors-ligne) ; à la déconnexion, suppression des caches `bais-registry-data`, `bais-spaces-*`, `bais-pages` et de la base locale, après avertissement s'il reste des saisies non envoyées.

### A4 — Élevée (présentation publique) : mot de passe institutionnel public, seed sans garde-fou
- `src/database/seed/steps/accounts.seed.ts:9` (`?? "Demo-Bais-2026!"`), `src/database/seed/index.ts:35` (crée le compte national du ministère quel que soit `APP_ENV`).
- Scénario : instance accessible sur Internet ; quiconque lit le dépôt se connecte en ministère et active lui-même la double authentification.
- Correction : `DEMO_ACCOUNT_PASSWORD` obligatoire et aléatoire par instance ; aucun compte ni registre de démonstration si `APP_ENV=production`.

Si la présentation se fait sur un portable en Wi-Fi public avec Docker, ajouter C7.

## B. Élevé — bloque un déploiement réel

### B1 — Les routes API ignorent suspension, limite de 12 h et double authentification du ministère
- `src/features/auth/api-actor.ts:12-17` et `src/app/api/v1/sync/route.ts:14-48` : session et chargement de l'acteur seulement ; les contrôles de `session.ts:36-43` et `:78` ne valent que pour les pages.
- Scénario : un compte `ADMIN_STATE` sans double authentification, un agent suspendu ou une session de 20 jours aspire le registre national par `GET /api/v1/registry/farms` (curseur), appelle l'export CSV et la levée d'alertes, écrit via la synchronisation. Les routes des règles restent protégées (double authentification revérifiée par le service).
- Correction : un `getApiActor` unique qui applique les contrôles de `getCurrentUser`, utilisé aussi par la synchronisation.

### B2 — Pages authentifiées et file de saisies rejouées sous la session d'un autre
- `sw.ts:90-119` : réseau d'abord, 8 s, puis cache 30 jours pour le HTML et le RSC des espaces, 7 jours pour toutes les autres pages (pilotage compris) ; le HTML en cache porte l'identifiant de l'utilisateur précédent. `sw.ts:47` : le statut 0 est mis en cache (redirections).
- Scénario : hors ligne ou en 2G, l'utilisateur suivant ouvre `/agent`, voit les pages et la file de saisies du précédent ; au retour du réseau, cette file est synchronisée avec son propre cookie, et les commandes lui sont attribuées (`sync/route.ts:48-49`).
- Correction : pas de cache du HTML et du RSC authentifiés (ou lié à l'utilisateur) ; vérifier côté client que l'utilisateur de la page est celui de la session avant de synchroniser ; propriétaire de la file enregistré dans chaque commande et rejet s'il diffère de la session ; statuts `[200]` seulement.

### B3 — Secret statistique absent de l'API publique des statistiques territoriales
- `src/app/api/v1/territory/stats/route.ts:18-36` (sans authentification, `Cache-Control: public`), `src/modules/analytics/territory-stats.ts:161-199` (aucun masquage).
- Scénario : un visiteur anonyme filtre par culture et statut et obtient des communes de 1 à 4 exploitations avec leur superficie exacte, en contradiction avec la règle k = 5 du tableau de bord.
- Correction : `maskSmallCells` avec masquage secondaire, ou refus du filtre de statut en accès public.

### B4 — Limites de débit contournables par `X-Forwarded-For`
- `auth.ts:51-66` sans `advanced.ipAddress.trustedProxies` ni en-tête d'IP de confiance.
- Scénarios : exposé directement (`docker-compose.yml:43-44`), un client change l'en-tête à chaque requête : envois d'OTP illimités (coût, harcèlement), force brute des codes. Derrière un proxy qui ajoute son adresse, l'IP devient nulle et tous partagent un compteur : une trentaine d'envois bloque la connexion du pays. Aucune limite sur synchronisation, registre, export et tuiles ; le plafond de corps de la synchronisation ne lit que `Content-Length` (`sync/route.ts:25-32`).
- Correction : proxys de confiance ; limite par numéro sur l'envoi d'OTP ; limites par utilisateur sur synchronisation et export ; lecture du flux avec plafond d'octets.

### B5 — Codes OTP en clair dans les journaux, possible en production
- `src/lib/env.ts:44` (canal `console` par défaut), `console-channel.ts:18` (journalise le code), `src/lib/logger.ts:6` (masquage d'un seul niveau, sans `code`, `authorization`, `cookie`).
- Correction : interdire `console` et `fixture` en production ; exiger `WAPY_API_KEY` et `WAPY_WEBHOOK_SECRET` ; étendre le masquage.

### B6 — Assistant : contrôles contournables par un vrai modèle — **corrigé à l'étape 8**
- Couverture non bloquante (une réponse inventée atteignait le seuil avec une seule citation réelle) ; négations traitées comme mots vides et citations par sous-chaîne (« traiter en floraison » tiré de « Ne pas traiter en floraison ») ; doses comparées par sous-chaîne (« 1 l/ha » accepté contre « 11 l/ha ») et formes non détectées (lettres, « à l'hectare », « pour 15 L », « 480 g/L », délai reformulé).
- Correction livrée : citations en phrases entières, soutien de chaque phrase avec la même polarité, couverture minimale 0,8, auto-évaluation plafonnée à la pertinence, repérage des quantités en chiffres et en lettres avec comparaison exacte valeur et unité, refus en cas de doute. Tests dédiés à chaque attaque (`docs/modules/assistant.md`).

## C. Moyen — déploiement réel

### C1 — Secret statistique contournable en croisant les filtres
- `src/database/sql/dashboard.sql.ts:31-35`, `src/modules/analytics/export.ts:125-150`.
- « Tous statuts » 7 moins « vérifiées » 5 révèle une cellule de 2 ; un groupe à une seule ligne masquée sans autre ligne n'a pas de masquage secondaire. Le rôle acheteur a `analytics.read: ALL` (`policies.matrix.ts:153`) et `requireNational` (`scope.ts:32`) ne vérifie pas le rôle.
- Correction : masquer aussi le complément du filtre, pas de filtre de statut au grain commune pour les rôles non habilités, masquer le total sans ligne secondaire ; `requireNational` exige `ADMIN_STATE` ; confirmer la portée nationale de l'acheteur.

### C2 — Synchronisation
- `handlers/farm-create.ts:10-25` : commune du producteur non vérifiée ; un agent rattache dans sa commune un producteur d'ailleurs puis lit ses contacts.
- `harvest-declare.ts:64,71`, `parcel-create.ts:75`, `parcel-geometry-set.ts:57` : `declaredBy` et `captureMethod` pris dans la charge ; un producteur auto-certifie ses données. Correction : déduire du rôle ; fiabilité vérifiée seulement si `farm.verify` est accordé.
- `apply.ts:113-137` : idempotence non cloisonnée par utilisateur ; `apply.ts:140-154` et `*-create.ts` : réponses qui révèlent l'existence d'identifiants étrangers.

### C3 — NPI
- `src/modules/identity/npi.ts:41-45` : rattachement possible du NPI d'un tiers tant que la vérification est en attente, et message qui révèle un NPI déjà rattaché ; pas de limite de débit.
- `npi.ts:99-127` : révélation sans double authentification récente, contrairement à docs/06 (latent : aucune route ne l'appelle).

### C4 — RGPD et APDP
- Aucune purge ni anonymisation hors assistant : `audit_log`, `sync_command.payload` (nom, téléphone, géométrie), `alert_recipient.phoneE164`, `farm_event.payload`, `auth_verification`, `auth_rate_limit` conservés indéfiniment.
- Pas d'effacement ni d'export pour la personne concernée ; `ChannelConsent` supprimé en cascade avec le producteur (la preuve du consentement disparaît) ; pas de registre des traitements (`docs/legal/`).
- IP hachée sans sel (`src/modules/audit/service.ts:53-55`), donc réversible pour IPv4 : HMAC à clé. OTP stocké en clair, contrairement à docs/06.

### C5 — Assistant : données envoyées au fournisseur et conservation — **corrigé à l'étape 8**
- Question brute envoyée au fournisseur et conservée 365 jours ; code d'exploitation transmis ; limite de débit non atomique ; pas de plafond global.
- Correction livrée : masquage des téléphones, NPI et adresses avant envoi et avant écriture ; code d'exploitation jamais transmis ; texte effacé après 90 jours ; réservation atomique sous verrous consultatifs, 20 questions par heure et par utilisateur, plafond global du jour configurable (`ASSISTANT_DAILY_LIMIT`).

### C6 — Pas de CSP ni de HSTS
- `next.config.ts:7-16` : nosniff, `X-Frame-Options`, Referrer-Policy et Permissions-Policy seulement.
- Correction : CSP à nonce dans `proxy.ts` (`connect-src` des tuiles, `worker-src 'self'`, `blob:` pour la carte), `frame-ancestors 'none'`, HSTS.

### C7 — Docker Compose
- `docker-compose.yml:10-15, 39, 44` : mot de passe de base `bais` par défaut, base publiée sur `0.0.0.0:5432`, application sur `0.0.0.0:3000` ; profil complet qui ne démarre pas avec `CRON_SECRET` vide ; clés NPI non transmises ; pas de `HEALTHCHECK` applicatif.
- Correction : variables obligatoires, liaisons sur `127.0.0.1`, application derrière le proxy TLS, contrôle de santé.

## D. Faible — durcissement

- Webhook wapy : pas d'horodatage signé (rejeu) ; un destinataire sans exploitation marque lues toutes les lignes utilisateur de l'alerte ; audit même quand rien n'est modifié (`delivery/webhook.ts:97-122`).
- Réponses 404 et 403 distinctes : `monitoring/resolve.ts:21-24`, `delivery/acknowledge.ts:40-48`.
- Erreurs brutes : `/api/health` (message Prisma, `platform/health.ts:31`), exceptions renvoyées à l'agent (`sync/apply.ts:184-188`), `features/account/actions.ts:57`.
- CSV : la neutralisation des formules laisse passer « -1+cmd|… » et un retour chariot initial (`analytics/csv.ts:20`) ; préfixer sauf nombre strict.
- Total non masqué de la production par culture (`analytics/dashboard.ts:128-136`), latent.
- `totpQrSvg` sans contrôle de session ni borne de longueur (`account/qr.ts:7-10`).
- Rotation de clé NPI impossible ; cache de session de 5 minutes après révocation.
- Dépendances (`pnpm audit`) : 0 critique, 6 élevées, 1 modérée ; `sharp` 0.34.5 (libvips) à monter en 0.35.4 ou plus ; `deepmerge-ts`, `browserslist`, `mysql2` ne servent qu'au build ou ne sont pas utilisés (surcharges de version).
- Assistant — **corrigé à l'étape 8** : erreur du modèle de plongement non capturée (500), identifiant non UUID dans les demandes à l'agent (500), point d'accès du modèle accepté en http.

## Vérifié, conforme

SQL entièrement paramétré (les rares fragments bruts sont des constantes ou une liste fermée) ; tuiles validées ; pas de SSRF (Open-Meteo, wapy et modèle configurés par l'environnement) ; une seule variable `NEXT_PUBLIC_` (style de carte) ; aucun composant client n'importe la configuration serveur ; `.env` jamais versionné ; cookies httpOnly, SameSite=Lax, `__Secure-` en https ; Argon2id ; envoi d'OTP sans énumération ; tâches planifiées et webhook comparés en temps constant et fermés sans secret ; tuiles d'exploitations vides pour un visiteur anonyme ; pages d'espace filtrées par périmètre avec 404 hors périmètre ; commandes de synchronisation autorisées sur la cible réelle ; NPI chiffré AES-256-GCM avec index HMAC distinct et révélation auditée ; export CSV limité au périmètre, masqué, audité ; images Docker sans utilisateur root ni secret ; assistant : conversations, réponses et exploitations cloisonnées par utilisateur et par périmètre, journal filtré par liste blanche, indicateurs en liste fermée.

## Ordre de l'étape 9

1. Avant la présentation : A1, A2, A4, A3, puis B3 (cohérence du discours sur le secret statistique).
2. Avant un déploiement réel : B1 à B5, puis C1 à C4, C6, C7, puis D (hors assistant).
