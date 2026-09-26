# Module authentification — guide du module livré

> Rédigé par : Expert sécurité applicative.
> Statut : version 2.0 — étape 9, branche `feature/npi-whatsapp-login`. Ce guide décrit ce que le code fait réellement au 25 septembre 2026. Les décisions d'architecture sont l'ADR-0010 (better-auth, sessions en base, NPI chiffré) et l'ADR-0012 (connexion unique par NPI et code WhatsApp, qui remplace la connexion institutionnelle et le TOTP de l'ADR-0010) ; la recherche qui les fonde est `docs/recherche/authentification-etape-3.md` et `docs/recherche/anip-npi-api.md` ; les exigences sont au document 06.

## 1. Vue d'ensemble

L'authentification repose sur better-auth 1.7.6 avec sessions en base PostgreSQL. Un seul parcours de connexion vaut pour tous les rôles (ADR-0012) : le NPI et le numéro de téléphone qui y est relié, puis un code à six chiffres reçu sur WhatsApp (wapy.pro). Il n'y a ni mot de passe ni application d'authentification. Le NPI est lié au compte à la première connexion, en attente de vérification par l'ANIP, et une session n'est reconnue que pour un compte dont le NPI est lié. Une première connexion ne crée qu'un compte d'agriculteur (rôle `FARMER` attribué automatiquement, ADR-0013) ; les agents, le ministère, les coopératives et les acheteurs reçoivent leur compte de l'administration (`pnpm admin:compte`). L'autorisation est un moteur maison (rôle × action × portée), l'audit un journal en ajout seul.

### 1.1 Schéma des fichiers

| Chemin | Rôle |
|---|---|
| `src/lib/auth/auth.ts` | Configuration serveur de better-auth : adaptateur Prisma, sessions, limiteur de débit, crochets de contrôle du NPI, plugins `phoneNumber` et `nextCookies`. Aucun mot de passe, pas de plugin `twoFactor` |
| `src/lib/auth/auth-client.ts` | Client React de better-auth avec le plugin téléphone |
| `src/lib/auth/sign-in-intent.ts` | Intention de connexion : NPI et numéro du premier écran, NPI chiffré dans un cookie httpOnly de dix minutes (`bais.connexion`) |
| `src/lib/auth/npi-sign-in.ts` | Contrôles branchés sur better-auth : intention exigée avant l'envoi et la vérification du code, NPI libre pour créer un compte, NPI lié ou identique après vérification |
| `src/lib/auth/demo-accounts.ts` | NPI et numéros fictifs des comptes de démonstration, un par rôle ; seule source de la liste blanche `isDemoPhone` |
| `src/lib/auth/phone.ts` | Normalisation des numéros béninois en E.164 (`+229 01 XX XX XX XX`), `isDemoPhone` (liste exacte des numéros de démonstration) |
| `src/lib/auth/otp-phone-rate-limit.ts` | Limite d'envoi de code par numéro, indépendante de la limite par adresse IP |
| `src/lib/crypto/npi.ts` | Chiffrement AES-256-GCM versionné, index aveugle HMAC-SHA-256, masquage, lecture des clés |
| `src/lib/env.ts` | Validation Zod des variables d'environnement, interdictions en production |
| `src/proxy.ts` | Garde rapide des espaces protégés par présence du cookie de session |
| `src/app/api/auth/[...all]/route.ts` | Point d'entrée HTTP de better-auth |
| `src/app/(auth)/connexion/page.tsx` | Connexion unique ; liste des comptes de démonstration hors production quand `OTP_DEMO_CODE` est défini |
| `src/app/(auth)/connexion/institution/page.tsx` et `verification/page.tsx` | Anciennes adresses, redirigées vers `/connexion` |
| `src/app/(auth)/apres-connexion/page.tsx` | Atterrissage après connexion : journalise et redirige vers l'espace du rôle principal ou vers le chemin demandé |
| `src/app/(auth)/acces-refuse/page.tsx` | Page d'accès refusé |
| `src/app/(spaces)/compte/page.tsx` | Page Compte : téléphone, rôles, NPI masqué et son statut, appareils connectés |
| `src/app/(spaces)/compte/securite/page.tsx` | Ancienne adresse, redirigée vers `/compte` |
| `src/features/auth/*` | `sign-in-form` (les deux écrans de connexion), `demo-accounts-panel` (comptes de démonstration sous le formulaire), `actions.ts` (action serveur `prepareSignIn`), `session.ts` (lecture de session et gardes), `api-actor.ts`, `sign-out-button`, `session-identity-guard`, `space-header`, `space-welcome`, `safe-next-path.ts` |
| `src/features/account/sessions-list.tsx` | Appareils connectés et déconnexion à distance |
| `src/modules/authorization/*` | Matrice de permissions (`policies.matrix.ts`), moteur de décision (`authorize.ts`), filtre de périmètre pour les listes |
| `src/modules/identity/*` | Chargement de l'acteur et de ses affectations (`roles.ts`) ; contrôle de forme, liaison à la connexion, résumé et révélation du NPI (`npi.ts`) |
| `src/modules/audit/service.ts` | Journal d'audit |
| `src/services/messaging/*` | Port `MessagingChannel` et adaptateurs `wapy`, `console`, `fixture` |
| `src/services/identity/*` | Port `IdentityVerificationProvider` et adaptateurs `anip-local`, `anip-xroad` |
| `src/database/migrations/20260924203000_authentication_and_audit/` | Tables `auth_session`, `auth_account`, `auth_verification`, `auth_two_factor`, `auth_rate_limit`, `audit_log`, colonnes NPI et statut sur `user`. `auth_two_factor` et la colonne `two_factor_enabled` restent au schéma mais ne sont plus utilisées |
| `src/database/seed/steps/accounts.seed.ts` | Comptes de démonstration : NPI chiffré, numéro, rôle ; suppression des anciens identifiants par mot de passe |
| `tests/e2e/authentication.spec.ts` | Parcours de bout en bout |
| `tests/integration/authentication.test.ts` | Contrôles du NPI contre une base réelle |

Retirés par l'ADR-0012 : `src/features/auth/institution-sign-in.tsx`, `totp-verification.tsx`, `phone-sign-in.tsx`, `src/features/account/two-factor-setup.tsx`, `qr.ts`, `npi-form.tsx`, `actions.ts` (rattachement du NPI depuis la page Compte) et `src/lib/auth/password.ts`.

### 1.2 Dépendances

`better-auth` 1.7.6 et `libphonenumber-js` 1.12.13, figées sans caret. `@node-rs/argon2` (hachage des mots de passe) et `@paulmillr/qr` (QR code TOTP) ont été retirées avec l'ADR-0012.

## 2. Parcours

### 2.1 NPI, numéro relié, puis code WhatsApp, en deux écrans

1. **Premier écran** (`/connexion`) : champs « Votre NPI » (13 chiffres, chiffres seuls) et « Numéro de téléphone relié à votre NPI » (`PhoneField`, indicatif +229 fixe), bouton « Recevoir mon code sur WhatsApp », désactivé tant que le NPI est vide ou que le numéro n'a pas dix chiffres. L'action serveur `prepareSignIn` contrôle la forme du NPI (longueur `NPI_LENGTH`, pas de répétition) et du numéro (dix chiffres commençant par 01), puis dépose l'intention de connexion : le NPI chiffré (AES-256-GCM, clé `NPI_ENCRYPTION_KEY`, données associées liées au numéro et à l'échéance) dans le cookie httpOnly `bais.connexion`, valable dix minutes. Rien n'est lu en base à cet écran : il ne révèle jamais si un NPI ou un numéro est connu. Le navigateur demande ensuite l'envoi du code à better-auth.
2. **Second écran** : libellé « Code reçu sur WhatsApp au +229 XX XX XX XX XX », six cases (« Chiffre 1 sur 6 » à « Chiffre 6 sur 6 »), validation automatique à la sixième, bouton « Me connecter », lien « Modifier mes informations » et « Renvoyer le code » au bout de 60 secondes.

Côté serveur, le plugin `phoneNumber` génère un code à 6 chiffres valable 5 minutes, avec 5 tentatives ; l'envoi passe par `getMessagingChannel().send({ kind: "OTP", … })` sans attendre le fournisseur, pour que la latence ne révèle rien. Trois contrôles s'ajoutent (`src/lib/auth/npi-sign-in.ts`) :

- **Envoi et vérification** : refusés (`NPI_REQUIRED`) sans intention de connexion valable pour le même numéro. L'écran affiche « Votre saisie a expiré. Saisissez de nouveau votre NPI et votre numéro. » et revient au premier écran.
- **Création de compte** (numéro inconnu, une fois le code vérifié) : refusée (`NPI_MISMATCH`) si le NPI appartient déjà à un autre compte. Sinon le compte est créé avec l'adresse technique `<numéro sans +>@telephone.bais.invalid` (better-auth exige un e-mail unique), puis reçoit le rôle `FARMER` sur lui-même (`provisionFarmerSignUp`, ADR-0013) ; s'il existe une seule fiche producteur non reliée enregistrée avec ce numéro, le compte y est relié et en prend le nom (journal `user.farmer.linked`).
- **Liaison du NPI** (code vérifié, session pas encore ouverte, `bindNpiOnSignIn`) : un compte déjà lié doit présenter le même NPI ; un compte sans NPI (créé avant l'ADR-0012, ou tout juste créé) reçoit celui qui a été saisi, au statut `PENDING`, avec l'entrée d'audit `user.npi.attached`. Deux connexions simultanées avec le même NPI sont départagées par l'index unique.

Un refus « Ce NPI et ce numéro ne sont pas reliés au même compte. Vérifiez votre NPI ou adressez-vous à un agent de votre commune. » n'est donc donné qu'à qui a prouvé détenir le numéro saisi. Après connexion, `/apres-connexion` journalise l'événement et envoie l'utilisateur vers l'espace de son rôle principal : `/agriculteur`, `/agent`, `/cooperative`, `/acheteur` ou `/pilotage`, ou vers le chemin demandé s'il est sûr (`safeNextPath`) ; un compte sans rôle arrive sur `/compte`.

### 2.2 Rôles institutionnels

Le ministère, les coopératives et les acheteurs se connectent par le même formulaire. Comme les agents, ils ne peuvent pas créer leur compte par la connexion (ADR-0013) : l'administration l'ouvre, après vérification du NPI et du numéro de la personne, avec `pnpm admin:compte --npi … --telephone … --role … [--commune … | --departement …] [--nom …]` (`scripts/admin-accounts.ts`, `provisionAccount`). Si un compte existe déjà pour ce numéro, il doit porter le même NPI ; le rôle y est ajouté et le rôle d'agriculteur automatique retiré s'il n'est relié à aucune fiche producteur. Il n'existe pas encore d'écran d'administration ; en démonstration, le seed crée ces comptes avec leur rôle. `/connexion/institution` et `/connexion/institution/verification` redirigent vers `/connexion`, `/compte/securite` vers `/compte`.

Les sessions institutionnelles (`ADMIN_STATE`, `COOPERATIVE`, `BUYER`) sont limitées à 12 heures par `resolveSession`, qui refuse une session plus ancienne même si better-auth la considère encore valide. La gouvernance des règles d'alerte (`src/modules/monitoring/rule-admin/service.ts`) exige un compte dont le NPI est lié, en lieu et place de la double authentification TOTP.

### 2.3 NPI lié au compte

Le NPI est saisi à chaque connexion et lié au compte à la première. La page Compte affiche sa forme masquée (par exemple `•••• •••• •••6 7`) et son statut : « En attente de vérification ANIP » (`PENDING`), « Vérifié par l'ANIP » ou « Vérification en échec ». Elle ne propose plus de formulaire de saisie. Avec `anip-local`, le statut reste `PENDING` ; seul l'affichage masqué revient au client.

### 2.4 Sessions et déconnexion

`resolveSession` (`src/features/auth/session.ts`), commun aux pages (`getCurrentUser`) et à l'API (`getApiActor`), écarte une session dont le compte est suspendu ou supprimé, dont le compte n'a pas de NPI lié (`npiStatus` à `NONE`, session ouverte avant l'ADR-0012) ou, pour un rôle institutionnel, plus ancienne que 12 heures. La page Compte liste les appareils connectés (`listSessions`) et permet d'en déconnecter un ou tous les autres. La déconnexion passe par le client better-auth. Le proxy ne fait qu'un contrôle optimiste sur la présence du cookie `bais.session_token` ; toute page ou action d'un espace appelle `requireUser`, `requireRole` ou `requirePermission`, qui lisent la session en base (une fois par requête grâce à `cache`).

## 3. Variables d'environnement

Toutes sont documentées dans `.env.example` et validées au démarrage par `src/lib/env.ts`.

| Variable | Rôle | Règles |
|---|---|---|
| `APP_URL` | URL publique, utilisée comme `baseURL` de better-auth | Par défaut `http://localhost:3000` ; en `https://`, le cookie d'intention est marqué `secure` |
| `AUTH_SECRET` | Secret de signature des sessions et des cookies | 32 caractères minimum ; **obligatoire dès `NODE_ENV=production`** ; en développement, un secret éphémère est généré par process s'il est absent |
| `OTP_DEMO_CODE` | Code fixe accepté pour les seuls numéros de démonstration (`src/lib/auth/demo-accounts.ts`) | 6 chiffres ; **interdit en production** ; défini, il fait aussi afficher la liste des comptes de démonstration sous le formulaire ; sans lui, les numéros de démonstration reçoivent un code ordinaire par le canal configuré |
| `MESSAGING_PRIMARY_CHANNEL` | `console` (affiche le code dans les journaux), `wapy` (WhatsApp) ou `fixture` (tests) | `wapy` exige `WAPY_API_KEY` ; seul `wapy` est admis en production |
| `WAPY_API_URL`, `WAPY_API_KEY`, `WAPY_WEBHOOK_SECRET` | Passerelle wapy.pro | URL par défaut `https://wapy.pro` ; le secret de webhook authentifie les accusés de remise entrants |
| `NPI_ENCRYPTION_KEY`, `NPI_HASH_KEY` | Clé de chiffrement et clé d'index du NPI, distinctes | 32 octets en base64 (`openssl rand -base64 32`) ; **indispensables à toute connexion** : sans elles, le premier écran échoue et le seed crée les comptes de démonstration sans NPI |
| `NPI_LENGTH` | Longueur attendue du NPI | Entier de 10 à 13, 13 par défaut (format non publié officiellement) |
| `IDENTITY_VERIFICATION_PROVIDER` | `anip-local` (contrôle de forme, statut en attente) ou `anip-xroad` | `anip-xroad` lit `ANIP_XROAD_SECURITY_SERVER_URL`, `ANIP_XROAD_CLIENT_ID`, `ANIP_XROAD_SERVICE_ID` et lève une erreur tant que la convention n'est pas activée |
| `TRUSTED_PROXIES` | Relais inverses dont `X-Forwarded-For` est crédité | Vide en accès direct ; sinon la limite par IP verrait une adresse indistincte |

## 4. Comptes de démonstration

Créés par `pnpm db:seed` (étape `accounts.seed.ts`), jamais en `APP_ENV=production`. Chaque rôle a un NPI et un numéro fictifs (`src/lib/auth/demo-accounts.ts`) et se connecte comme tout le monde : NPI, numéro, puis `OTP_DEMO_CODE`. Aucun message WhatsApp n'est envoyé à ces numéros quand `OTP_DEMO_CODE` est défini, et ils sont exemptés de la limite d'envoi par numéro. Le NPI de démonstration est semé chiffré, au statut `PENDING` (il faut donc `NPI_ENCRYPTION_KEY` et `NPI_HASH_KEY` au moment du seed).

| Compte | NPI | Numéro | Rôle | Périmètre |
|---|---|---|---|---|
| Agent de terrain, Djougou | `1000000000001` | `01 90 00 00 01` | `AGENT_AGRICULTURE` | Commune `BJ-DON-003` (Djougou) |
| Agricultrice, Djougou | `1000000000002` | `01 90 00 00 02` | `FARMER` | Ses propres données (`SELF`) |
| Analyste du ministère | `1000000000003` | `01 90 00 00 03` | `ADMIN_STATE` | National |
| Gestionnaire de coopérative | `1000000000004` | `01 90 00 00 04` | `COOPERATIVE` | `SELF` (rattachement à une organisation à venir) |
| Acheteur | `1000000000005` | `01 90 00 00 05` | `BUYER` | `SELF` |

Hors production et avec `OTP_DEMO_CODE` défini, `/connexion` affiche ces comptes sous le formulaire (« Comptes de démonstration »), avec le code et un bouton « Utiliser » qui remplit le NPI et le numéro. Les comptes agent et agricultrice portent l'adresse technique `+22901900000XX@telephone.bais.invalid` ; les comptes ministère, coopérative et acheteur gardent leur adresse `@bais.demo`, qui ne sert plus à se connecter. Le seed est idempotent : relancé, il met à jour le nom, le statut, le numéro et le NPI, supprime tout identifiant par mot de passe hérité et ne duplique pas les affectations.

## 5. Matrice des permissions

Source : `src/modules/authorization/policies.matrix.ts`. Portées : **ALL** toute ressource, **SCOPE** ressources du périmètre territorial ou organisationnel de l'affectation, **SELF** ressources de l'acteur, **OWN** ressources enregistrées par l'acteur (agent, ADR-0014), **NONE** jamais. Une affectation porte un type de périmètre (`NATIONAL`, `DEPARTEMENT`, `COMMUNE`, `ORGANIZATION`, `SELF`) et un identifiant ; les affectations départementales sont résolues en listes de communes au chargement de l'acteur. Plusieurs affectations peuvent coexister, la première qui autorise suffit.

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
| `report.create` | NONE | OWN | SELF | NONE | NONE |
| `report.read` | ALL | OWN | SELF | NONE | NONE |
| `report.review` | ALL | OWN | NONE | NONE | NONE |
| `assistance.request` | NONE | NONE | SELF | NONE | NONE |
| `assistance.read` | NONE | SCOPE | SELF | NONE | NONE |
| `assistance.handle` | NONE | SCOPE | NONE | NONE | NONE |
| `consent.manage` | NONE | NONE | SELF | NONE | NONE |

Les tests unitaires du moteur (`src/modules/authorization/__tests__/authorize.test.ts`) sont générés à partir de cette matrice : chaque cellule produit au moins un cas autorisé et un cas refusé. `scopeFilter` traduit l'union des affectations en filtre de liste (`all`, `none`, `self` ou `territory` avec communes, départements et organisations) que les dépôts convertissent en clause SQL.

## 6. Journal d'audit

Table `audit_log`, en ajout seul, écrite par `recordAudit` (`src/modules/audit/service.ts`) : action, acteur, type et identifiant de ressource, issue (`SUCCESS`, `DENIED`, `FAILURE`), détails JSON, empreinte HMAC de l'adresse IP, agent utilisateur tronqué à 255 caractères, identifiant de corrélation. Un échec d'écriture est journalisé par `pino` mais ne bloque jamais l'action métier. `listAudit` renvoie les entrées les plus récentes avec le nom de l'acteur.

| Action | Déclencheur | État |
|---|---|---|
| `auth.sign_in` | Passage par `/apres-connexion` | Enregistrée, avec IP hachée et agent utilisateur |
| `auth.otp_requested`, `auth.sign_out`, `auth.session_revoked` | Chemins better-auth correspondants (crochet `after` de `auth.ts`) | Enregistrées |
| `user.role.granted`, `user.role.revoked` | `grantRole`, `revokeRole` | Enregistrées |
| `user.npi.attached` | Liaison du NPI à la première connexion (`bindNpiOnSignIn`, détail `via: "sign-in"`) | Enregistrée, avec statut et fournisseur |
| `user.npi.revealed` | Révélation en clair, réussie (avec justification) ou refusée (`DENIED`) | Enregistrée |
| `auth.sign_in_failed`, `user.npi.verification_requested` | Définies dans le type `AuditAction` | Pas encore émises par le code |
| `auth.two_factor_enabled`, `auth.two_factor_disabled` | Définies dans le type `AuditAction` | Plus émises depuis le retrait du TOTP (ADR-0012) |

## 7. Limitation de débit

Limiteur intégré de better-auth, stockage `database` (table `auth_rate_limit`), donc partagé entre répliques Docker et instances Vercel, activé explicitement dans tous les environnements. Règles par adresse IP : 60 requêtes par minute par défaut sur les routes d'authentification ; `/phone-number/send-otp` 30 par quart d'heure ; `/phone-number/verify` 60 par quart d'heure. Ces fenêtres restent larges parce qu'une même adresse peut regrouper un quartier entier derrière le CGNAT d'un opérateur mobile. S'y ajoutent une limite de 5 codes par quart d'heure et par numéro (`otp-phone-rate-limit.ts`, numéros de démonstration exemptés), 5 tentatives par code, et le quota de wapy.pro (2 codes par heure et par destinataire, 60 messages par heure, 500 par jour). Les routes hors authentification (recherche marché, assistant, webhooks) n'ont pas encore de limiteur.

## 8. Limites connues

- **Occupation d'un NPI avant la vérification ANIP (risque accepté, ADR-0012)** : tant que le couple NPI et numéro n'est pas vérifié par l'ANIP, une personne qui connaît le NPI d'une autre et se connecte la première avec son propre numéro l'occupe ; le vrai titulaire est ensuite refusé. Mesures : le NPI reste `PENDING` et ce statut est visible ; un administrateur n'attribue un rôle institutionnel qu'après avoir vérifié le NPI et le numéro de la personne ; l'adaptateur X-Road (`anip-xroad`) tranchera les conflits dès son ouverture.
- **Sécurité fondée sur WhatsApp** : pour tous les rôles, ministère compris, un compte WhatsApp compromis compromet le compte BAIS. La confirmation par code à la volée des actions les plus sensibles (révélation d'un NPI, attribution de rôle) reste à ajouter.
- **Oracle limité** : le refus « NPI et numéro non reliés » n'intervient qu'après un code valide, donc face à qui détient le numéro saisi ; l'envoi reste limité par adresse IP, par numéro et par le quota wapy.pro.
- **Pas d'écran d'attribution des rôles** : `grantRole` existe côté module, l'attribution passe aujourd'hui par le seed ou par une intervention en base.
- **Adresse e-mail technique** pour chaque compte créé par téléphone (`@telephone.bais.invalid`) : contrainte de better-auth, masquée dans les interfaces.
- **Journal d'audit incomplet** : les échecs de connexion ne sont pas encore enregistrés (voir tableau de la section 6).
- **Pas de limiteur de débit hors authentification** : `rate-limiter-flexible` avec stockage PostgreSQL est prévu, non installé.
- **Coopératives** : la portée `ORGANIZATION` existe dans le moteur, mais le plugin `organization` de better-auth n'est pas installé ; le compte de démonstration `COOPERATIVE` est en portée `SELF`.
- **wapy.pro** : quotas de la passerelle (2 codes par heure et par destinataire, 60 messages par heure, 500 par jour) à respecter par l'interface, qui ne renvoie un code qu'à la demande explicite, au plus tôt 60 secondes après le précédent.
- **ANIP** : `anip-xroad` est un squelette qui lève `NOT_CONFIGURED` ou `UNAVAILABLE` ; le format du NPI (13 chiffres) reste une hypothèse paramétrable ; la conservation du NPI exige une autorisation APDP.
- **Clés NPI** en variables d'environnement, une seule version de clé chargée ; la rotation et le KMS sont à venir, le format stocké les permet déjà. Leur perte rend toute connexion impossible.
- **Session institutionnelle** : la limite de 12 heures est appliquée à la lecture, la session en base reste valable 30 jours jusqu'à révocation.
- **Schéma** : la table `auth_two_factor` et la colonne `two_factor_enabled` subsistent, inutilisées ; leur suppression demande une migration.

## 9. Comment tester

| Vérification | Commande ou action |
|---|---|
| Tests unitaires (moteur d'autorisation généré depuis la matrice, chiffrement et index du NPI) | `pnpm test` |
| Tests d'intégration (base PostGIS réelle, `docker compose up -d db` au préalable) : intention exigée, création et liaison du NPI, refus d'un autre NPI, refus d'un NPI déjà lié, connexion du ministère de démonstration, refus de la connexion par mot de passe | `pnpm test:integration` |
| Parcours de bout en bout (seed chargé, `OTP_DEMO_CODE=246810`, clés NPI renseignées) | `pnpm test:e2e tests/e2e/authentication.spec.ts` |
| Test manuel de la connexion | Ouvrir `/connexion`, saisir le NPI `1000000000002` et le numéro `01 90 00 00 02` (ou « Utiliser » sur la ligne Agricultrice), cliquer « Recevoir mon code sur WhatsApp », saisir `246810` : arrivée sur `/agriculteur` |
| Test manuel du ministère | Même parcours avec `1000000000003` et `01 90 00 00 03` : arrivée sur `/pilotage`, sans second facteur |
| Test manuel du refus | NPI `1000000000009` avec le numéro `01 90 00 00 02`, puis le code de démonstration : « Ce NPI et ce numéro ne sont pas reliés au même compte » |
| Test manuel de la garde d'espace | Ouvrir `/agent` sans session : redirection vers `/connexion?suite=%2Fagent` ; connecté comme agent, ouvrir `/pilotage` : page `/acces-refuse` |
| Test manuel des anciennes adresses | `/connexion/institution` et `/connexion/institution/verification` mènent à `/connexion` ; `/compte/securite` à `/compte` |

Les tests de bout en bout couvrent : connexion agricultrice en deux écrans, agent refusé sur le pilotage, connexion du ministère par le même formulaire sans second facteur, NPI mal formé puis mauvais code refusés par des messages neutres, NPI qui n'est pas celui relié au numéro refusé après le code, remplissage par un compte de démonstration, redirection des anciennes adresses de connexion, redirection d'un visiteur anonyme avec le chemin demandé, NPI masqué sur la page Compte sans formulaire de saisie.
