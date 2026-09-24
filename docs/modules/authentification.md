# Module authentification — guide du module livré

> Rédigé par : Expert sécurité applicative.
> Statut : version 1.0 — étape 3 de la phase 2, branche `feature/authentication`. Ce guide décrit ce que le code fait réellement au 24 septembre 2026. La décision d'architecture est l'ADR-0010 ; la recherche qui la fonde est `docs/recherche/authentification-etape-3.md` ; les exigences sont au document 06.

## 1. Vue d'ensemble

L'authentification repose sur better-auth 1.7.6 avec sessions en base PostgreSQL. Deux parcours de connexion coexistent : le téléphone avec code à usage unique pour les agriculteurs et les agents, l'e-mail avec mot de passe puis code TOTP pour les institutions. L'autorisation est un moteur maison (rôle × action × portée), l'audit un journal en ajout seul, et le NPI un attribut facultatif chiffré qui rehausse la confiance d'identité sans conditionner l'accès.

### 1.1 Schéma des fichiers

| Chemin | Rôle |
|---|---|
| `src/lib/auth/auth.ts` | Configuration serveur de better-auth : adaptateur Prisma, sessions, e-mail + mot de passe, limiteur de débit, plugins `phoneNumber`, `twoFactor`, `nextCookies` |
| `src/lib/auth/auth-client.ts` | Client React de better-auth avec les plugins téléphone et double authentification |
| `src/lib/auth/password.ts` | Hachage et vérification Argon2id (`@node-rs/argon2`, m = 19 456 Kio, t = 2, p = 1) |
| `src/lib/auth/phone.ts` | Normalisation des numéros béninois en E.164 (`+229 01 XX XX XX XX`), détection des numéros de démonstration `01 9X` |
| `src/lib/crypto/npi.ts` | Chiffrement AES-256-GCM versionné, index aveugle HMAC-SHA-256, masquage, lecture des clés |
| `src/lib/env.ts` | Validation Zod des variables d'environnement, interdictions en production |
| `src/proxy.ts` | Garde rapide des espaces protégés par présence du cookie de session |
| `src/app/api/auth/[...all]/route.ts` | Point d'entrée HTTP de better-auth |
| `src/app/(auth)/connexion/page.tsx` | Connexion par téléphone |
| `src/app/(auth)/connexion/institution/page.tsx` et `verification/page.tsx` | Connexion institutionnelle, puis saisie du code TOTP ou de secours |
| `src/app/(auth)/apres-connexion/route.ts` | Atterrissage après connexion : journalise et redirige vers l'espace du rôle principal ou vers le chemin demandé |
| `src/app/(auth)/acces-refuse/page.tsx` | Page d'accès refusé |
| `src/app/(spaces)/compte/page.tsx` | Page Compte : NPI, sessions actives |
| `src/app/(spaces)/compte/securite/page.tsx` | Activation de la double authentification |
| `src/features/auth/*` | Composants des parcours : `phone-sign-in`, `institution-sign-in`, `totp-verification`, `sign-out-button`, `space-header`, `space-welcome`, `session.ts` (lecture de session et gardes), `safe-next-path.ts` |
| `src/features/account/*` | Page Compte : `npi-form`, `two-factor-setup`, `sessions-list`, `qr.ts` (QR TOTP en SVG), `actions.ts` |
| `src/modules/authorization/*` | Matrice de permissions (`policies.matrix.ts`), moteur de décision (`authorize.ts`), filtre de périmètre pour les listes |
| `src/modules/identity/*` | Chargement de l'acteur et de ses affectations (`roles.ts`), rattachement, résumé et révélation du NPI (`npi.ts`) |
| `src/modules/audit/service.ts` | Journal d'audit |
| `src/services/messaging/*` | Port `MessagingChannel` et adaptateurs `wapy`, `console`, `fixture` |
| `src/services/identity/*` | Port `IdentityVerificationProvider` et adaptateurs `anip-local`, `anip-xroad` |
| `src/database/migrations/20260924203000_authentication_and_audit/` | Tables `auth_session`, `auth_account`, `auth_verification`, `auth_two_factor`, `auth_rate_limit`, `audit_log`, colonnes NPI et statut sur `user` |
| `src/database/seed/steps/accounts.seed.ts` | Comptes de démonstration |
| `tests/e2e/authentication.spec.ts` | Parcours de bout en bout |

### 1.2 Dépendances ajoutées

`better-auth` 1.7.6, `@node-rs/argon2` 2.2.1, `@paulmillr/qr` 0.3.0, `libphonenumber-js` 1.12.13. Toutes figées sans caret.

## 2. Parcours

### 2.1 Téléphone et code à usage unique, en deux écrans

1. **Écran « Numéro »** (`/connexion`) : champ « Votre numéro de téléphone », bouton « Recevoir mon code » désactivé tant que le numéro n'est pas un numéro béninois complet (dix chiffres commençant par 01, avec ou sans indicatif, espaces tolérés). La saisie est normalisée en E.164.
2. **Écran « Code reçu »** : libellé « Code reçu au +229 XX XX XX XX XX », six cases de saisie (« Chiffre 1 sur 6 » à « Chiffre 6 sur 6 »), boutons de validation et de renvoi. Les messages restent neutres : ils ne disent jamais si un numéro est connu de la plateforme.

Côté serveur, le plugin `phoneNumber` génère un code à 6 chiffres valable 5 minutes, avec 5 tentatives ; l'envoi passe par `getMessagingChannel().send({ kind: "OTP", … })` sans attendre le fournisseur, pour que la latence ne révèle rien. À la première vérification réussie, un compte est créé avec l'adresse technique `<numéro sans +>@telephone.bais.invalid` (better-auth exige un e-mail unique). Après connexion, `/apres-connexion` journalise l'événement et envoie l'utilisateur vers l'espace de son rôle principal : `/agriculteur`, `/agent`, `/cooperative`, `/acheteur` ou `/pilotage`, ou vers le chemin demandé s'il est sûr (`safeNextPath`).

### 2.2 Institution : e-mail, mot de passe, puis TOTP

1. `/connexion/institution` : « Adresse e-mail professionnelle » et « Mot de passe ». Toute erreur affiche « Identifiants incorrects ou compte inactif. » sans distinguer les cas. L'inscription libre est désactivée : les comptes institutionnels sont créés par invitation ou par le seed.
2. Si la double authentification est active, better-auth renvoie `twoFactorRedirect` et l'écran `/connexion/institution/verification` demande le « Code de votre application d'authentification » (6 chiffres) ou, en repli, un « Code de secours » (8 caractères et plus), avec une case « appareil de confiance » (30 jours).
3. Si la double authentification n'est pas encore active et que le compte porte le rôle `ADMIN_STATE`, `requireRole` redirige vers `/compte/securite?obligatoire=1` : l'espace de pilotage reste inaccessible tant que l'activation n'est pas terminée. L'activation se fait en trois étapes (« Mot de passe », « Application », « Codes de secours ») : confirmation du mot de passe, QR code à scanner rendu en SVG côté serveur, code de contrôle, puis codes de secours à conserver.

Les sessions institutionnelles sont limitées à 12 heures par `getCurrentUser`, qui refuse une session plus ancienne même si better-auth la considère encore valide.

### 2.3 NPI facultatif

Depuis la page Compte, l'utilisateur peut rattacher son NPI en indiquant le numéro, son nom de famille et, facultativement, son année de naissance. Le module `identity` contrôle la forme (longueur `NPI_LENGTH`, chiffres, pas de répétition), vérifie l'unicité par index aveugle, chiffre le numéro, interroge le fournisseur configuré et journalise. Avec `anip-local`, le statut reste `PENDING` (« En attente de vérification ANIP ») ; seul l'affichage masqué revient au client, par exemple `•••• •••• •••6 7`. Le NPI ne conditionne aucun accès.

### 2.4 Sessions et déconnexion

La page Compte liste les sessions actives (`listSessions`) et permet d'en révoquer une (`revokeSession`). La déconnexion passe par le client better-auth. Le proxy ne fait qu'un contrôle optimiste sur la présence du cookie `bais.session_token` ; toute page ou action d'un espace appelle `requireUser`, `requireRole` ou `requirePermission`, qui lisent la session en base (une fois par requête grâce à `cache`).

## 3. Variables d'environnement

Toutes sont documentées dans `.env.example` et validées au démarrage par `src/lib/env.ts`.

| Variable | Rôle | Règles |
|---|---|---|
| `APP_URL` | URL publique, utilisée comme `baseURL` de better-auth | Par défaut `http://localhost:3000` |
| `AUTH_SECRET` | Secret de signature des sessions et des cookies | 32 caractères minimum ; **obligatoire en production** ; en développement, un secret de repli non sûr est utilisé s'il est absent |
| `OTP_DEMO_CODE` | Code fixe accepté pour les numéros de démonstration `01 9X XX XX XX` | 6 chiffres ; **interdit en production** ; sans lui, même les numéros de démonstration reçoivent un vrai code par le canal configuré |
| `DEMO_ACCOUNT_PASSWORD` | Mot de passe des comptes institutionnels créés par le seed | Valeur par défaut du seed : `Demo-Bais-2026!` |
| `MESSAGING_PRIMARY_CHANNEL` | `console` (affiche le code dans les journaux), `wapy` (WhatsApp) ou `fixture` (tests) | `wapy` exige `WAPY_API_KEY` |
| `WAPY_API_URL`, `WAPY_API_KEY`, `WAPY_WEBHOOK_SECRET` | Passerelle wapy.pro | URL par défaut `https://wapy.pro` ; le secret de webhook est réservé pour l'accusé de remise, non encore implémenté |
| `NPI_ENCRYPTION_KEY`, `NPI_HASH_KEY` | Clé de chiffrement et clé d'index du NPI, distinctes | 32 octets en base64 (`openssl rand -base64 32`) ; sans elles, le rattachement d'un NPI est refusé et le résumé affiche `•••• ••••` |
| `NPI_LENGTH` | Longueur attendue du NPI | Entier de 10 à 13, 13 par défaut (format non publié officiellement) |
| `IDENTITY_VERIFICATION_PROVIDER` | `anip-local` (contrôle de forme, statut en attente) ou `anip-xroad` | `anip-xroad` lit `ANIP_XROAD_SECURITY_SERVER_URL`, `ANIP_XROAD_CLIENT_ID`, `ANIP_XROAD_SERVICE_ID` et lève une erreur tant que la convention n'est pas activée |

## 4. Comptes de démonstration

Créés par `pnpm db:seed` (étape `accounts.seed.ts`). Les numéros commencent par `01 9`, jamais attribués par les opérateurs ; ils acceptent `OTP_DEMO_CODE` quand il est défini. Les comptes à mot de passe partagent `DEMO_ACCOUNT_PASSWORD`.

| Compte | Identifiant | Rôle | Périmètre | Connexion |
|---|---|---|---|---|
| Analyste du ministère | `ministere@bais.demo` | `ADMIN_STATE` | National | Mot de passe, puis activation obligatoire de la double authentification |
| Agent de terrain, Djougou | `+229 01 90 00 00 01` | `AGENT_AGRICULTURE` | Commune `BJ-DON-003` (Djougou) | Téléphone + code |
| Agricultrice, Djougou | `+229 01 90 00 00 02` | `FARMER` | Ses propres données (`SELF`) | Téléphone + code |
| Gestionnaire de coopérative | `cooperative@bais.demo` | `COOPERATIVE` | `SELF` (rattachement à une organisation à venir) | Mot de passe |
| Acheteur | `acheteur@bais.demo` | `BUYER` | `SELF` | Mot de passe |

Les comptes téléphone portent l'adresse technique `+22901900000XX@telephone.bais.invalid`. Le seed est idempotent : relancé, il met à jour le nom, le statut et le mot de passe sans dupliquer les affectations.

## 5. Matrice des permissions

Source : `src/modules/authorization/policies.matrix.ts`. Portées : **ALL** toute ressource, **SCOPE** ressources du périmètre territorial ou organisationnel de l'affectation, **SELF** ressources de l'acteur, **NONE** jamais. Une affectation porte un type de périmètre (`NATIONAL`, `DEPARTEMENT`, `COMMUNE`, `ORGANIZATION`, `SELF`) et un identifiant ; les affectations départementales sont résolues en listes de communes au chargement de l'acteur. Plusieurs affectations peuvent coexister, la première qui autorise suffit.

| Action | ADMIN_STATE | AGENT_AGRICULTURE | FARMER | COOPERATIVE | BUYER |
|---|---|---|---|---|---|
| `farm.read` | ALL | SCOPE | SELF | SCOPE | NONE |
| `farm.create` | NONE | SCOPE | SELF | NONE | NONE |
| `farm.update` | NONE | SCOPE | SELF | NONE | NONE |
| `farm.verify` | NONE | SCOPE | NONE | NONE | NONE |
| `farm.archive` | ALL | NONE | NONE | NONE | NONE |
| `farmer.read` | ALL | SCOPE | SELF | SCOPE | NONE |
| `farmer.contact.read` | ALL | SCOPE | SELF | SCOPE | NONE |
| `parcel.geometry.read` | ALL | SCOPE | SELF | NONE | NONE |
| `analytics.read` | ALL | SCOPE | SCOPE | SCOPE | ALL |
| `alert.read` | ALL | SCOPE | SELF | SCOPE | NONE |
| `alert.create` | ALL | SCOPE | NONE | NONE | NONE |
| `rule.manage` | ALL | NONE | NONE | NONE | NONE |
| `listing.read` | ALL | ALL | ALL | ALL | ALL |
| `listing.create` | NONE | SCOPE | SELF | SCOPE | NONE |
| `purchase.create` | NONE | NONE | NONE | ALL | ALL |
| `user.role.grant` | ALL | NONE | NONE | NONE | NONE |
| `user.npi.reveal` | ALL | NONE | NONE | NONE | NONE |
| `audit.read` | ALL | NONE | NONE | NONE | NONE |

Les tests unitaires du moteur (`src/modules/authorization/__tests__/authorize.test.ts`) sont générés à partir de cette matrice : chaque cellule produit au moins un cas autorisé et un cas refusé. `scopeFilter` traduit l'union des affectations en filtre de liste (`all`, `none`, `self` ou `territory` avec communes, départements et organisations) que les dépôts convertissent en clause SQL.

## 6. Journal d'audit

Table `audit_log`, en ajout seul, écrite par `recordAudit` (`src/modules/audit/service.ts`) : action, acteur, type et identifiant de ressource, issue (`SUCCESS`, `DENIED`, `FAILURE`), détails JSON, empreinte SHA-256 tronquée de l'adresse IP, agent utilisateur tronqué à 255 caractères, identifiant de corrélation. Un échec d'écriture est journalisé par `pino` mais ne bloque jamais l'action métier. `listAudit` renvoie les entrées les plus récentes avec le nom de l'acteur.

| Action | Déclencheur | État |
|---|---|---|
| `auth.sign_in` | Passage par `/apres-connexion` | Enregistrée, avec IP hachée et agent utilisateur |
| `user.role.granted`, `user.role.revoked` | `grantRole`, `revokeRole` | Enregistrées |
| `user.npi.attached` | Rattachement d'un NPI | Enregistrée, avec statut et fournisseur |
| `user.npi.revealed` | Révélation en clair, réussie (avec justification) ou refusée (`DENIED`) | Enregistrée |
| `auth.sign_in_failed`, `auth.sign_out`, `auth.otp_requested`, `auth.two_factor_enabled`, `auth.two_factor_disabled`, `auth.session_revoked`, `user.npi.verification_requested` | Définies dans le type `AuditAction` | Pas encore émises par le code |

## 7. Limitation de débit

Limiteur intégré de better-auth, stockage `database` (table `auth_rate_limit`), donc partagé entre répliques Docker et instances Vercel. Règles : 30 requêtes par minute par défaut sur les routes d'authentification ; `/phone-number/send-otp` 5 par heure ; `/phone-number/verify` 5 par quart d'heure ; `/sign-in/email` 10 par quart d'heure ; `/two-factor/verify-totp` 10 par quart d'heure. Le limiteur est désactivé en développement par better-auth. Les routes hors authentification (recherche marché, assistant, webhooks) n'ont pas encore de limiteur.

## 8. Limites connues

- **Adresse e-mail technique** pour chaque compte téléphone (`@telephone.bais.invalid`) : contrainte de better-auth, à masquer dans toutes les interfaces.
- **Journal d'audit incomplet** : échecs de connexion, déconnexions, activation ou désactivation de la double authentification et révocations de session ne sont pas encore enregistrés (voir tableau de la section 6).
- **Pas de limiteur de débit hors authentification** : `rate-limiter-flexible` avec stockage PostgreSQL est prévu, non installé.
- **Coopératives** : la portée `ORGANIZATION` existe dans le moteur, mais le plugin `organization` de better-auth n'est pas installé ; le compte de démonstration `COOPERATIVE` est en portée `SELF`.
- **wapy.pro** : envoi seulement ; le webhook d'accusé de remise (`X-Wapy-Signature`) n'est pas implémenté ; quotas de la passerelle (2 codes par heure et par destinataire, 500 envois par jour) à respecter par l'interface, qui ne renvoie un code qu'à la demande explicite.
- **ANIP** : `anip-xroad` est un squelette qui lève `NOT_CONFIGURED` ou `UNAVAILABLE` ; le format du NPI (13 chiffres) reste une hypothèse paramétrable ; la conservation du NPI exige une autorisation APDP.
- **Clés NPI** en variables d'environnement, une seule version de clé chargée ; la rotation et le KMS sont à venir, le format stocké les permet déjà.
- **Secret de développement** : sans `AUTH_SECRET`, un secret de repli lisible dans le code est utilisé hors production.
- **Session institutionnelle** : la limite de 12 heures est appliquée à la lecture, la session en base reste valable 30 jours jusqu'à révocation.

## 9. Comment tester

| Vérification | Commande ou action |
|---|---|
| Tests unitaires (moteur d'autorisation généré depuis la matrice, chiffrement et index du NPI) | `pnpm test` |
| Tests d'intégration (base PostGIS réelle, `docker compose up -d db` au préalable) | `pnpm test:integration` |
| Parcours de bout en bout (seed chargé, `OTP_DEMO_CODE=246810`, `DEMO_ACCOUNT_PASSWORD` par défaut) | `pnpm test:e2e tests/e2e/authentication.spec.ts` |
| Test manuel du parcours téléphone | Ouvrir `/connexion`, saisir `01 90 00 00 02`, cliquer « Recevoir mon code », saisir `246810` : arrivée sur `/agriculteur` |
| Test manuel du parcours institution | Ouvrir `/connexion/institution`, `ministere@bais.demo` et le mot de passe de démonstration : redirection vers `/compte/securite?obligatoire=1`, activer la double authentification avec une application TOTP, puis accès à `/pilotage` |
| Test manuel de la garde d'espace | Ouvrir `/agent` sans session : redirection vers `/connexion?suite=%2Fagent` ; connecté comme agent, ouvrir `/pilotage` : page `/acces-refuse` |
| Test manuel du NPI | Sur `/compte`, saisir un NPI de 13 chiffres et un nom : message « NPI enregistré », affichage masqué et statut « En attente de vérification ANIP » après rechargement |

Les tests de bout en bout couvrent : connexion agricultrice en deux écrans, agent refusé sur le pilotage, numéro incomplet et mauvais code, double authentification obligatoire pour le ministère, message neutre sur mauvais mot de passe, redirection d'un visiteur anonyme avec le chemin demandé, NPI masqué après enregistrement.
