# Recherche — Pile d'authentification de l'étape 3

> Rédigé par : Expert sécurité applicative et intégration.
> Statut : version 1.0 — note de recherche du 24 septembre 2026, préparatoire à une décision d'architecture. Toutes les pages citées ont été consultées le 2026-09-24 ; les versions « installées » sont lues dans `node_modules` du dépôt. Aucun fichier de code n'a été modifié.

## 1. Objet, contraintes et besoins

### 1.1 Ce que la pile doit couvrir

Le document 06 et l'ADR-0003 fixent les besoins fonctionnels :

- **Agriculteurs et agents** : numéro de téléphone et code à usage unique de 6 chiffres, valable 5 minutes, 5 tentatives, verrouillage progressif ; envoi par WhatsApp (wapy.pro), repli SMS, console en développement ; code stocké haché.
- **Institutions** : e-mail et mot de passe Argon2id, 12 caractères minimum, contrôle contre les listes de mots de passe compromis, **MFA TOTP obligatoire** pour les rôles d'administration.
- **Sessions** : 12 heures pour les institutions, 30 jours glissants pour le terrain, rotation, révocation par liste de sessions côté serveur, jeton portant rôles et périmètre territorial.
- **Appareils** : identifiant d'appareil lié au compte, révocable par un superviseur.
- **Extensibilité** : fournisseur OIDC générique activable par configuration (ANIP ou autre fournisseur national).
- **Limitation de débit** par IP et par compte sur l'OTP, la connexion, la recherche marché et l'assistant.
- **NPI** : jamais en clair, chiffré au repos, index d'unicité sans divulgation.

### 1.2 Contraintes techniques constatées dans le dépôt

| Contrainte | Valeur constatée | Source |
|---|---|---|
| Next.js | 16.3.6, App Router, Turbopack, `output: "standalone"` | `package.json`, `next.config.ts` |
| React | 19.2.8 | `package.json` |
| Prisma | 7.10.0 avec `@prisma/adapter-pg` 7.10.0 et `pg` 8.16 (driver adapter obligatoire en Prisma 7) | `package.json`, ADR-0008 |
| Zod | 4.6.5 | `package.json` |
| Node.js | 22 (image Docker `node:22-alpine`, donc libc musl) | `docker/Dockerfile` |
| Cibles | Docker souverain (une ou plusieurs répliques derrière un reverse proxy) et, en option, Vercel Fluid Compute | ADR-0006 |
| Redis | Non prévu en V1 | ADR-0006 |
| Middleware | Next 16 renomme `middleware.ts` en `proxy.ts` ; la documentation embarquée précise que le proxy sert à des « vérifications optimistes » et n'est « pas une solution complète de gestion de session ou d'autorisation » | `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` |
| Bibliothèques recommandées par Next | Le guide d'authentification embarqué liste Better Auth et NextAuth.js parmi les bibliothèques, et Jose ou iron-session pour la gestion de session maison | `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, section « Auth Libraries » |

Deux conséquences structurantes : d'une part, tout module natif (Argon2 compilé) doit fournir un binaire **musl** pour l'image Alpine ou l'image doit passer en Debian slim ; d'autre part, l'état en mémoire (compteurs de débit, sessions) n'est pas partagé entre répliques Docker ni entre instances Vercel, donc toute donnée d'authentification qui doit être cohérente vit en base PostgreSQL.

## 2. Auth.js / next-auth v5

### 2.1 État du projet

Sur le registre npm, le tag `latest` de `next-auth` reste la version 4.24.15 et le tag `beta` pointe sur 5.0.0-beta.32, tous deux publiés le 20 juillet 2026 (https://registry.npmjs.org/next-auth). La v5 n'est donc jamais sortie de bêta. Les publications de la branche v5 s'espacent de trois à six mois (beta.30 le 27 octobre 2025, beta.31 le 14 avril 2026, beta.32 le 20 juillet 2026) et beta.32 est essentiellement un lot de correctifs de sécurité : jeton Bearer malformé dans `getToken`, cookies de vérification OAuth liés au fournisseur, normalisation NFKC des adresses e-mail, contrôles d'authentification qui « échouaient ouverts » (https://github.com/nextauthjs/next-auth/releases/tag/next-auth%405.0.0-beta.32).

Le fait déterminant est organisationnel : depuis le 22 septembre 2025, Auth.js est maintenu par l'équipe de Better Auth, qui annonce se limiter aux correctifs de sécurité et aux urgences et « recommande fortement aux nouveaux projets de démarrer avec Better Auth, sauf besoin très spécifique » (https://better-auth.com/blog/authjs-joins-better-auth). Le README du dépôt reprend cette recommandation en précisant que le seul cas d'usage encore réservé à Auth.js est la session sans état, sans base de données (https://raw.githubusercontent.com/nextauthjs/next-auth/main/README.md). Le dépôt compte 393 issues et 210 pull requests ouvertes ; une discussion ouverte le 18 février 2026 demandant un calendrier de version stable est restée sans réponse des mainteneurs (https://github.com/nextauthjs/next-auth/discussions/13382).

### 2.2 Compatibilité Next 16, React 19.2, Turbopack

- Les dépendances de pairs de next-auth 5.0.0-beta.32 acceptent `next ^16.0.0` et `react ^19.0.0` (registre npm, 2026-09-24). Une issue d'installation sous Next 16 (`--legacy-peer-deps` nécessaire) a été fermée après correction (https://github.com/nextauthjs/next-auth/issues/13302).
- Le guide de migration documente l'usage dans `proxy.ts` par l'export renommé `export { auth as proxy } from "@/auth"` ; sans cet alias Next refuse le fichier (https://authjs.dev/getting-started/migrating-to-v5 ; https://github.com/nextauthjs/next-auth/discussions/13315).
- Une issue ouverte le 4 janvier 2026 signale une page de connexion personnalisée non fonctionnelle sous Turbopack avec beta.30 et React 19.2.3 (https://github.com/nextauthjs/next-auth/issues/13353).
- La documentation de l'adaptateur Prisma note qu'en Next 16 le proxy s'exécute sur Node.js, ce qui rend inutile le découpage `auth.config.ts` / `auth.ts` conçu pour le runtime Edge (https://authjs.dev/getting-started/adapters/prisma).

### 2.3 Adaptateur Prisma avec Prisma 7

`@auth/prisma-adapter` 2.11.3 (20 juillet 2026) déclare `@prisma/client >=6` en dépendance de pairs, ce qui couvre la 7.x. La documentation Auth.js ne mentionne ni `prisma.config.ts` ni les driver adapters ; c'est le guide officiel de Prisma qui décrit l'assemblage avec Prisma ORM 7, `prisma.config.ts` et `@prisma/adapter-pg`, en précisant qu'aucune variante Prisma 8 n'existe parce que l'adaptateur exige Prisma Client (https://www.prisma.io/docs/guides/authjs-nextjs). Aucune issue ouverte spécifique à Prisma 7 n'a été trouvée sur le dépôt.

### 2.4 Fournisseur Credentials, OTP téléphone et sessions

C'est le point bloquant pour BAIS. Le fournisseur Credentials, seul moyen d'implémenter téléphone + OTP, impose la stratégie de session JWT : l'erreur `UnsupportedStrategy` est levée « lorsqu'un fournisseur Credentials est présent sans que la stratégie JWT soit activée » (https://authjs.dev/reference/core/errors ; https://github.com/nextauthjs/next-auth/issues/10966). Or la documentation des stratégies de session est explicite : « faire expirer un JWT avant son échéance n'est pas possible sans maintenir une liste de blocage côté serveur », la déconnexion de toutes les sessions n'étant offerte que par la stratégie base (https://authjs.dev/concepts/session-strategies). La page Credentials ajoute que le fournisseur ne persiste rien et que le hachage, la limitation de débit et le reste de la logique sont à la charge du projet (https://authjs.dev/getting-started/authentication/credentials).

Conséquences : révocation de session, liste d'appareils, TOTP, organisations et limitation de débit seraient tous à écrire par-dessus Auth.js, c'est-à-dire l'essentiel de ce que l'ADR-0003 attendait de la bibliothèque.

## 3. Alternatives

### 3.1 better-auth

**Versions et cadence.** `better-auth` 1.7.6 est la version `latest`, publiée le 24 septembre 2026 ; la 1.7.0 stable date du 18 août 2026 après six versions candidates, et deux branches de maintenance (1.6.33 du 14 septembre 2026, 1.4.22) reçoivent encore des correctifs (https://registry.npmjs.org/better-auth). Le dépôt compte 30 100 étoiles, 336 issues et 397 pull requests ouvertes (https://github.com/better-auth/better-auth). Vercel a acquis Better Auth le 7 juillet 2026 ; la bibliothèque reste gratuite sous licence MIT avec la même équipe (https://vercel.com/blog/vercel-acquires-better-auth).

**Next 16.** Dépendances de pairs `next ^14 || ^15 || ^16`, `react ^18 || ^19`, `prisma` et `@prisma/client ^5 || ^6 || ^7`. La documentation d'intégration couvre Next 16 et `proxy.ts` : `getSessionCookie` sert aux redirections optimistes avec l'avertissement explicite que ce contrôle n'est pas sûr et que la session doit toujours être validée côté serveur ; le plugin `nextCookies` est requis pour poser les cookies depuis les Server Actions (https://www.better-auth.com/docs/integrations/next). Issues Next 16 relevées : exclusion de Next 16 par la dépendance de pairs en 1.4.4, corrigée (https://github.com/better-auth/better-auth/issues/6439) ; build Bun + Turbopack (https://github.com/better-auth/better-auth/issues/6781) ; `getServerSession` avec `use cache` (https://github.com/better-auth/better-auth/issues/5584) ; décalage d'hydratation de `useSession` (https://github.com/better-auth/better-auth/issues/10972).

**Plugins officiels couvrant les besoins de BAIS.**

| Besoin BAIS | Plugin | Points documentés | Source |
|---|---|---|---|
| Téléphone + OTP WhatsApp | `phoneNumber` | Callback `sendOTP` libre (donc WhatsApp via wapy.pro), `otpLength` 6, `expiresIn` 300 s, `allowedAttempts` 3 puis suppression du code, création de compte à la vérification, connexion sans mot de passe | https://www.better-auth.com/docs/plugins/phone-number |
| MFA TOTP administrateurs | `twoFactor` | TOTP, codes de secours, appareils de confiance 30 jours, `issuer`, verrouillage après échecs | https://www.better-auth.com/docs/plugins/2fa |
| Coopératives, communes | `organization` | Rôles owner/admin/member, invitations, équipes, `createAccessControl` pour des permissions personnalisées, organisation active en session, hooks | https://www.better-auth.com/docs/plugins/organization |
| Supervision, révocation | `admin` | `banUser` (révoque toutes les sessions), `revokeUserSessions`, `listUserSessions`, rôles personnalisés | https://www.better-auth.com/docs/plugins/admin |

Les valeurs par défaut du plugin téléphone (6 chiffres, 5 minutes) coïncident avec le document 06 ; le nombre de tentatives (3 par défaut, 5 souhaité) se paramètre.

**Limitation de débit intégrée.** Active par défaut en production : fenêtre de 60 s et 100 requêtes, règle intégrée de 3 requêtes par 10 s sur la connexion par e-mail, règles personnalisées par chemin, stockage `memory` par défaut (inadapté au serverless et aux répliques), `database` (modèle `rateLimit`), stockage secondaire ou stockage personnalisé avec consommation atomique, en-tête `X-Retry-After` (https://www.better-auth.com/docs/concepts/rate-limit). Pour Docker multi-répliques comme pour Vercel, le stockage `database` est le bon réglage.

**Sessions.** Sessions en base (`token`, `userId`, `expiresAt`, `ipAddress`, `userAgent`), durée 7 jours et rafraîchissement quotidien par défaut, cache de cookie optionnel de 5 minutes (stratégies `compact`, `jwt`, `jwe`), fonctions `revokeSession`, `revokeOtherSessions`, `revokeSessions`, `listSessions` (https://www.better-auth.com/docs/concepts/session-management). Les durées de 12 heures et de 30 jours du document 06 se règlent par type de compte via les hooks.

**Prisma 7.** La documentation de l'adaptateur cible explicitement Prisma 7 et PostgreSQL avec `PrismaPg` de `@prisma/adapter-pg`, et le schéma est généré par `npx @better-auth/cli generate` (https://www.better-auth.com/docs/adapters/prisma) ; Prisma publie un guide dédié Next.js + Better Auth + Prisma 7 (https://www.prisma.io/docs/guides/betterauth-nextjs). Trois régressions Prisma 7 ont été corrigées entre décembre 2025 et janvier 2026 : dépendance de pairs épinglée sur 5.22 (https://github.com/better-auth/better-auth/issues/6746), génération de schéma obsolète par le CLI (https://github.com/better-auth/better-auth/issues/6277), erreur P2025 non interceptée à la déconnexion (https://github.com/better-auth/better-auth/issues/7129).

**Sécurité.** Le dépôt publie ses avis : le 11 août 2026 (SSO, gravité haute), le 26 juin 2026 (pré-détournement de compte sur magic-link et OTP e-mail, gravité haute ; SSO ; Stripe ; SCIM, critique), le 31 mai 2026 (cinq avis sur oauth-provider, oidc-provider, SSO, SCIM) (https://github.com/better-auth/better-auth/security/advisories). La plupart touchent des plugins hors périmètre de BAIS ; l'avis magic-link / OTP e-mail concerne un mécanisme voisin de l'OTP téléphone et justifie de suivre les avis et de figer les versions. La cadence des correctifs est rapide.

### 3.2 Lucia et Oslo

`lucia` 3.2.2 (20 octobre 2024) est marqué déprécié sur npm ; le site officiel indique « Lucia a été dépréciée en mars 2025 » et ne propose plus qu'un fichier de session de référence et un guide (https://registry.npmjs.org/lucia ; https://lucia-auth.com/). Le 29 juillet 2026, l'auteur a annoncé la dépréciation de la quasi-totalité des paquets Oslo, seul `@oslojs/encoding` restant maintenu ; `@oslojs/otp` 1.1.0 est marqué « no longer supported » (https://pilcrowonpaper.com/blog/18 ; https://registry.npmjs.org/@oslojs/otp). Ni Lucia ni Oslo ne sont donc des dépendances envisageables ; le guide reste une lecture utile.

### 3.3 Implémentation maison avec jose et cookies signés

- `jose` 6.2.12 (5 septembre 2026), douze versions 6.2.x depuis mars 2026, auteur Filip Skokan, licence MIT, fonctionne sur Node, navigateur, Workers, Deno et Bun (https://registry.npmjs.org/jose ; https://github.com/panva/jose).
- Next 16 : `proxy.ts` remplace `middleware.ts` et s'exécute sur Node.js, avec un codemod `middleware-to-proxy` ; la documentation insiste : « vérifiez toujours l'authentification et l'autorisation dans chaque Server Function plutôt que de vous reposer sur le proxy » (https://nextjs.org/docs/app/api-reference/file-conventions/proxy). `cookies()` est asynchrone ; `set` et `delete` ne fonctionnent que dans les Server Functions et les Route Handlers (https://nextjs.org/docs/app/api-reference/functions/cookies).
- Le guide d'authentification de Next montre une session HS256 signée avec jose dans un cookie `httpOnly`, `secure`, `sameSite: lax`, des sessions en base avec identifiant chiffré pour les vérifications optimistes et une couche d'accès aux données avec `verifySession()`, mais prévient qu'une solution maison « devient vite complexe » et conseille une bibliothèque (https://nextjs.org/docs/app/guides/authentication).
- Risques documentés : CVE-2025-29927 (contournement du middleware par l'en-tête `x-middleware-subrequest`, corrigé en 15.2.3) rappelle qu'aucune protection ne doit reposer sur le seul proxy (https://github.com/advisories/GHSA-f82v-jwr5-mffw) ; la fuite du secret de session permet de forger des cookies pour n'importe quel utilisateur (https://embracethered.com/blog/posts/2026/minting-next-auth-nextjs-auth-cookies-react2shell-threat/).
- Bilan : contrôle total et souveraineté, mais OTP, TOTP (RFC 6238 à implémenter, Oslo étant déprécié), organisations, limitation de débit, révocation et rotation sont tous à écrire, à tester et à faire auditer.

### 3.4 Tableau comparatif des piles

| Critère | Auth.js v5 (next-auth 5.0.0-beta.32) | better-auth 1.7.6 | Maison (jose 6.2.12 + Prisma 7) |
|---|---|---|---|
| Maturité et gouvernance | Bêta depuis trois ans, maintenance de sécurité seulement, ses mainteneurs orientent vers Better Auth | Stable 1.x, releases hebdomadaires, équipe chez Vercel, licence MIT | Dépend de l'équipe BAIS ; jose est mature |
| Next 16 / proxy.ts / Turbopack | Pairs OK, alias `auth as proxy`, bug Turbopack ouvert | Documentation Next 16 dédiée, pairs OK, quelques issues d'hydratation et `use cache` | Natif |
| Prisma 7 + driver adapter | Accepté par les pairs, guide Prisma, doc Auth.js non à jour | Documentation dédiée Prisma 7, régressions corrigées | Contrôle total |
| Téléphone + OTP | Credentials à coder, impose JWT | Plugin `phoneNumber`, canal libre | À coder |
| TOTP administrateurs | Rien d'officiel | Plugin `twoFactor` | À coder sans bibliothèque maintenue |
| Organisations et rôles | Rien d'officiel | Plugin `organization` avec ACL | À coder |
| Limitation de débit | Aucune | Intégrée, stockage base | À coder |
| Sessions révocables et appareils | Impossible avec Credentials sans liste de blocage maison | Sessions en base, révocation unitaire ou globale | Oui si sessions en base |
| Fournisseur OIDC futur (ANIP) | Fournisseur générique | Fournisseur générique et plugin SSO | À coder |
| Risques principaux | Stagnation, JWT non révocable, dette dès le départ | Surface étendue (avis de sécurité fréquents sur les plugins SSO/OAuth), dépendance à la feuille de route Vercel | Erreurs de conception, charge d'audit, tout à maintenir |

## 4. Hachage des mots de passe et des codes OTP

### 4.1 Bibliothèques

| Paquet | Version, date | Nature | Alpine (musl) | Vercel | Défauts | Source |
|---|---|---|---|---|---|---|
| `argon2` (node-argon2) | 0.45.1, 21 juillet 2026 | Module natif N-API, binaires `prebuilds/` embarqués dans le tarball (`linux-x64/argon2.glibc.node`, `linux-x64/argon2.musl.node`, arm64 glibc et musl, darwin, win32, freebsd), `node-gyp-build` en repli | Oui, binaire musl inclus, sans compilation | Listé dans `serverExternalPackages` par défaut de Next, mais erreur « No native build was found » documentée sur Vercel tant que `outputFileTracingIncludes` n'inclut pas `node_modules/argon2/prebuilds/linux-x64/*` | argon2id, m = 65536 (64 Mio), t = 3, p = 4 | https://raw.githubusercontent.com/ranisalt/node-argon2/v0.45.1/README.md ; https://github.com/ranisalt/node-argon2/wiki/Options ; https://github.com/vercel/next.js/discussions/65978 |
| `@node-rs/argon2` | 2.2.1, 10 septembre 2026 | Binaires napi-rs en dépendances optionnelles par plateforme, dont `@node-rs/argon2-linux-x64-musl` et `-linux-arm64-musl`, plus un repli WASM `@node-rs/argon2-wasm32-wasi` | Oui, paquet musl dédié, zéro node-gyp | Listé dans `serverExternalPackages` ; une issue signale une tentative de résolution du repli WASM par le bundler | argon2id, m = 19456 (19 Mio), t = 2, p = 1, sel 16 octets, option `secret` (pepper) | https://raw.githubusercontent.com/napi-rs/node-rs/main/packages/argon2/README.md ; https://github.com/vercel/next.js/issues/65996 |
| `bcryptjs` | 3.0.3, 2 novembre 2025 | JavaScript pur, zéro dépendance, types inclus | Oui | Oui | `$2b$`, 10 tours, entrée limitée à 72 octets, environ 30 % plus lent que le natif | https://raw.githubusercontent.com/dcodeIO/bcrypt.js/main/README.md |

Le README de node-argon2 est incohérent sur la version minimale de Node (texte « Node 22 et plus », champ `engines` à 16.17) ; la matrice de binaires annoncée couvre Alpine 3.18. L'image de build de Vercel est Amazon Linux 2023, donc glibc (https://vercel.com/docs/builds/build-image).

### 4.2 Paramètres recommandés

L'aide-mémoire OWASP sur le stockage des mots de passe recommande Argon2id avec l'une de cinq configurations équivalentes, dont m = 47104 Kio, t = 1, p = 1 ou m = 19456 Kio, t = 2, p = 1 ; pour bcrypt, un facteur de travail d'au moins 10 et un pré-hachage HMAC-SHA-384 avec pepper si l'entrée dépasse 72 octets (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Les défauts de `@node-rs/argon2` correspondent exactement à la seconde configuration OWASP.

### 4.3 Codes OTP courts

L'ASVS 5.0 (chapitre V6) exige que les secrets de consultation de moins de 112 bits d'entropie soient hachés avec un algorithme de stockage de mots de passe approuvé et un sel aléatoire de 32 bits (6.5.2), à usage unique (6.5.1), d'au moins 20 bits d'entropie (6.5.4, un code à 6 chiffres suffit), d'une durée de vie de 10 minutes au plus pour les canaux hors bande (6.5.5), et protégés par limitation de débit (6.6.3) (https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md). L'aide-mémoire MFA ajoute : jamais de code en clair dans les journaux ni en base, générateur cryptographique, limite stricte de tentatives ; le SMS est classé « restreint » par le NIST SP 800-63B-4, WhatsApp n'est pas traité (https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Lecture pratique pour BAIS : un code à 6 chiffres n'a qu'un million de valeurs, la sécurité réelle vient de l'expiration, de l'usage unique et de la limite de tentatives. Argon2id sur un code de 5 minutes est acceptable en coût et conforme à l'ASVS ; un HMAC-SHA-256 avec pepper serveur hors base est un minimum défendable si le coût CPU devait poser problème.

### 4.4 Recommandation hachage

`@node-rs/argon2` pour les mots de passe institutionnels et les codes OTP : binaire musl dédié pour l'image `node:22-alpine`, externalisé par défaut par Next sur Vercel, défauts alignés sur OWASP, option `secret` pour un pepper. `bcryptjs` reste le repli sans binaire si une plateforme exotique l'exigeait ; `argon2` (node-argon2) fonctionne aussi mais demande une configuration de traçage de fichiers sur Vercel.

## 5. TOTP et QR code

| Paquet | Version, date | Dépendances | Dernier commit | Remarques | Source |
|---|---|---|---|---|---|
| `otplib` | 13.5.0, 21 août 2026 | `@otplib/core`, `@otplib/totp`, `@otplib/uri`, plugins base32 (`@scure/base`) et crypto (`@noble/hashes`) | 23 septembre 2026 | v13 (janvier 2026) : réécriture ESM-only, API asynchrone (`generateSecret`, `generate`, `verify`, `generateURI`), protection anti-rejeu `afterTimeStep` (13.2), rejet des algorithmes inconnus (13.5) | https://github.com/yeojz/otplib/releases |
| `@epic-web/totp` | 4.0.1, 25 février 2025 | `base32-decode`, `base32-encode`, Node 20 et plus | 13 mai 2026 | `generateTOTP`, `verifyTOTP`, `getTOTPAuthUri` ; SHA-1, 6 chiffres, 30 s par défaut | https://raw.githubusercontent.com/epicweb-dev/totp/main/README.md |
| `@oslojs/otp` | 1.1.0, 11 décembre 2024 | `@oslojs/binary`, `@oslojs/crypto`, `@oslojs/encoding` | 12 novembre 2025 | Marqué « no longer supported » sur npm ; l'auteur a annoncé le 29 juillet 2026 ne plus maintenir que `@oslojs/encoding` | https://registry.npmjs.org/@oslojs/otp ; https://pilcrowonpaper.com/blog/18 |
| `qrcode` | 1.5.4, 5 août 2024 | `pngjs`, `yargs`, `dijkstrajs` | 5 août 2024 | Rendu PNG et SVG, dépendances lourdes, inactif | registre npm |
| `@paulmillr/qr` | 0.3.0, 22 novembre 2024 | Aucune | 21 septembre 2026 | `encodeQR(texte, "svg")`, environ 6 Ko compressés, SVG côté serveur | https://raw.githubusercontent.com/paulmillr/qr/main/README.md |

Format d'enrôlement : `otpauth://totp/Émetteur:compte?secret=<base32>&issuer=Émetteur&algorithm=SHA1&digits=6&period=30` ; Google Authenticator ignore `algorithm`, `digits` et `period` (https://github.com/google/google-authenticator/wiki/Key-Uri-Format).

**Recommandation.** Si better-auth est retenu, son plugin `twoFactor` gère TOTP, codes de secours et URI d'enrôlement, et il ne reste qu'à rendre le QR : `@paulmillr/qr` en SVG, sans dépendance. Sans better-auth, `otplib` 13 est la bibliothèque la plus active et la mieux auditée ; `@oslojs/otp` est à écarter.

## 6. Limitation de débit sans Redis

| Option | Version | Stockage | Verdict pour BAIS | Source |
|---|---|---|---|---|
| `@upstash/ratelimit` | 2.2.0, 23 septembre 2026 | Exige un client `@upstash/redis` (REST, variables `UPSTASH_REDIS_REST_URL` et `_TOKEN`) | Incompatible avec l'absence de Redis et avec la souveraineté (service hébergé hors du Bénin) | https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted |
| `rate-limiter-flexible` | 11.2.1, 17 septembre 2026, zéro dépendance | Mémoire, Redis, Valkey, PostgreSQL (`RateLimiterPostgres` avec client `pg`), Prisma (`RateLimiterPrisma`, modèle `RateLimiterFlexible { key String @id; points Int; expire DateTime? }`), MySQL, SQLite, MongoDB | Adapté : fenêtre fixe glissante au premier hit, upsert atomique `INSERT … ON CONFLICT DO UPDATE` avec remise à zéro conditionnelle, nettoyage des clés expirées par minuterie (à appeler manuellement en serverless) | https://raw.githubusercontent.com/animir/node-rate-limiter-flexible/master/README.md ; https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL |
| Table PostgreSQL maison | — | Table `rate_limits(key, count, window_start)` avec `pg_advisory_xact_lock` et upsert, ou seau à jetons en une requête `INSERT … ON CONFLICT … RETURNING` | Adapté, quelques dizaines de lignes, mais à tester et maintenir | https://neon.com/guides/rate-limiting ; https://github.com/fafl/token-bucket-postgres |
| Compteur en mémoire | — | Processus | Insuffisant seul : sur Vercel Fluid Compute, plusieurs invocations partagent une instance mais la plateforme en ajoute sous charge, et en Docker chaque réplique a sa mémoire | https://vercel.com/docs/fluid-compute ; https://vercel.com/docs/fundamentals/what-is-compute |

**Recommandation.** Compteurs en base PostgreSQL, valables pour une instance Docker, N répliques ou N instances Vercel. Avec better-auth, activer le stockage `database` du limiteur intégré pour les routes d'authentification, et utiliser `rate-limiter-flexible` (`RateLimiterPrisma`) pour les autres routes sensibles (recherche marché, assistant, webhooks). Un limiteur mémoire peut s'ajouter en première ligne (`insuranceLimiter`) pour absorber une panne de base sans ouvrir la porte.

## 7. Chiffrement du NPI

### 7.1 Références

- Node.js 22 : les vecteurs d'initialisation doivent être imprévisibles et uniques, idéalement aléatoires ; en GCM, `authTagLength` vaut 16 octets par défaut et un tag d'une autre longueur doit être déclaré explicitement à `createDecipheriv` ; `setAAD()` avant `update()`, `getAuthTag()` après `final()` ; `crypto.timingSafeEqual` compare en temps constant deux tampons de même longueur (https://nodejs.org/api/crypto.html).
- NIST SP 800-38D : nonce de 96 bits (12 octets) comme construction de référence ; avec des nonces aléatoires, au plus 2^32 chiffrements par clé pour garder la probabilité de collision sous 2^-32 (https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf).
- OWASP Cryptographic Storage : AES-256 en mode authentifié GCM ; clés dans un KMS ou un HSM plutôt qu'en variable d'environnement ; rotation après compromission ou fin de cryptopériode ; **marquer chaque donnée avec l'identifiant de la clé utilisée** ; séparer clé de chiffrement de données et clé de chiffrement de clés (https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
- Index aveugle (CipherSweet) : un « blind index » est un HMAC ou une dérivation de clé du texte clair avec une clé propre à l'index, distincte de la clé de chiffrement, dérivée par HKDF ; il n'autorise que les recherches d'égalité et peut être tronqué pour limiter les fuites (https://ciphersweet.paragonie.com/internals/blind-index ; https://ciphersweet.paragonie.com/internals/key-hierarchy).

### 7.2 Schéma proposé pour BAIS

- **Chiffrement** : `aes-256-gcm` via `node:crypto`, nonce de 12 octets tiré par `randomBytes`, tag de 16 octets, AAD contenant le nom de la table, le nom de la colonne et l'identifiant de l'enregistrement, pour qu'un texte chiffré ne puisse pas être déplacé d'une fiche à une autre.
- **Format stocké** : `v<versionDeClé>.<nonce>.<tag>.<texteChiffré>` en base64url, dans une colonne `npi_ciphertext`. La version de clé en tête permet la rotation : déchiffrer avec l'ancienne clé, rechiffrer avec la nouvelle, dans une tâche de fond, sans arrêt de service.
- **Clés en V1** : `NPI_ENCRYPTION_KEY` (32 octets) et `NPI_HASH_KEY` (32 octets) en variables d'environnement, déjà prévues par le document 09, injectées par le secret Docker ou par Vercel, jamais dans le dépôt ; `NPI_ENCRYPTION_KEYS` sous forme `v1:<clé>,v2:<clé>` dès qu'une rotation est engagée. Passage à un KMS (ou HSM de l'ASIN) en V2, ce qui ne change que le fournisseur de clé.
- **Index d'unicité** : colonne `npi_index` = HMAC-SHA-256(`NPI_HASH_KEY`, NPI normalisé sans espaces), avec contrainte d'unicité ; il permet la détection de doublons et la recherche exacte sans jamais révéler le NPI ni permettre une énumération hors ligne sans la clé. Comparaison par `timingSafeEqual`.
- **Affichage** : masqué (`•••• •••• ••34`), déchiffrement uniquement dans le module métier, jamais dans un composant, jamais dans un journal, jamais dans une URL ; journalisation de chaque déchiffrement avec l'acteur et la finalité, comme l'exige l'autorisation APDP (voir `docs/recherche/anip-npi-api.md`).

## 8. Envoi WhatsApp via wapy.pro

La documentation développeur de wapy.pro est **publique** (https://wapy.pro/developpeurs/documentation, consultée le 2026-09-24) et décrit le « Pont WhatsApp », envoi depuis le numéro de l'entreprise après création de compte, acceptation des conditions et connexion d'un numéro dédié (https://wapy.pro/developpeurs). Le document 09 est confirmé : passerelle de messagerie transactionnelle, pas de service d'identité.

| Élément | Valeur documentée |
|---|---|
| URL de base | `https://wapy.pro`, corps et réponses en JSON |
| Authentification | En-tête `Authorization: Bearer <clé>` ; clé au format `wapy_pont_…` |
| Idempotence | En-tête obligatoire `Idempotency-Key` (identifiant d'événement) ; un rejeu renvoie `"rejeu": true` sans second envoi ; durée de mémorisation non précisée |
| Message libre | `POST /pont/v1/messages` avec `{ "destinataire": "+22990000001", "texte": "…", "consentement": "<référence du consentement>" }` |
| Code OTP | `POST /pont/v1/otp` avec `{ "destinataire", "code", "service", "minutes" }` ; wapy.pro compose le texte (« Votre code de vérification <service> est <code>. Il expire dans <minutes> minutes. Ne le communiquez à personne. ») |
| Réponse d'envoi | `{ "id", "message_id", "statut": "envoye", "remise": "acceptee", "rejeu": false }` |
| État du compte | `GET /pont/v1/statut` : `peut_emettre`, `blocage`, `numero_connecte`, `webhook.url`, `limites`, `consommation` |
| Limites | `intervalle_min_s` 3, `envois_par_heure` 60, `envois_par_jour` 500, `otp_par_heure_et_destinataire` 2, `taille_max_message` 1000 |
| Suivi | `GET /pont/v1/messages/{id}` : `statut`, `motif`, `remise` (`acceptee`, `serveur`, `appareil`, `lu` ou `echec`), `remise_le`, `cree_le` |
| Webhook | `POST /pont/v1/webhook` avec `{ "url" }`, réponse contenant un `secret` ; wapy.pro poste ensuite l'objet message avec `"evenement": "remise"`, signé `X-Wapy-Signature: sha256=<HMAC-SHA-256 hex du corps brut>`, à vérifier par `timingSafeEqual` |
| Erreurs | 400 (champ manquant, numéro illisible, message vide ou trop long), 401 clé refusée, 403 (`conditions-non-acceptees`, `compte-non-valide`, `compte-suspendu`), 404 `destinataire-inexistant` (sans consommation), 429 avec `Retry-After`, 502 WhatsApp injoignable, 503 `numero-deconnecte` |
| Rétention | Métadonnées 90 jours ; contenu et codes jamais journalisés ; destinataires hachés |
| Exemples | Node.js (fetch avec gestion du 429 et de `Retry-After`), PHP, Python |

Non trouvé dans la documentation publique : environnement de test (sandbox), tarif par message ou système de crédits, durée de conservation des clés d'idempotence.

Conséquences pour l'adaptateur `services/messaging/wapy/` : utiliser `POST /pont/v1/otp` pour les codes (texte normalisé par la passerelle, une seule chaîne à traduire plus tard), `POST /pont/v1/messages` pour les alertes ; porter l'identifiant de notification BAIS en `Idempotency-Key` ; respecter `intervalle_min_s` et le plafond de 2 OTP par heure et par destinataire, qui est plus strict que la politique du document 06 (5 tentatives) et impose de ne renvoyer un code qu'à la demande explicite de l'utilisateur ; stocker `message_id` dans `Notification.provider_message_id` ; vérifier la signature du webhook avec le secret reçu à l'enregistrement. Le plafond de 500 envois par jour est incompatible avec des alertes agricoles de masse et devra être négocié ou remplacé par l'API WhatsApp Business pour ce cas d'usage, ce que l'architecture par adaptateur permet.

## 9. Recommandation

### 9.1 Décision proposée

**Retenir better-auth 1.7.x comme pile d'authentification, en révisant l'ADR-0003**, avec les compléments suivants :

| Sujet | Choix | Justification courte |
|---|---|---|
| Pile d'authentification | better-auth 1.7.x, plugins `phoneNumber`, `twoFactor`, `organization`, `admin`, `nextCookies` | Couvre nativement OTP téléphone, TOTP, organisations, révocation de sessions et limitation de débit ; documentation Next 16 et Prisma 7 ; ses propres mainteneurs orientent Auth.js vers elle |
| Sessions | Sessions en base (révocables), cache de cookie court (5 minutes) pour éviter une requête par rendu, durées 12 h / 30 jours par type de compte via hooks | Répond au document 06 ; impossible avec Auth.js + Credentials |
| Hachage | `@node-rs/argon2`, paramètres OWASP m = 19456, t = 2, p = 1, pepper par `secret` ; codes OTP hachés de la même façon | Binaire musl pour Alpine, externalisé sur Vercel, conforme ASVS 6.5.2 |
| TOTP et QR | Plugin `twoFactor` + `@paulmillr/qr` en SVG | Zéro dépendance supplémentaire pour le QR ; Oslo déprécié |
| Limitation de débit | Limiteur better-auth en stockage `database` pour les routes d'auth ; `rate-limiter-flexible` avec `RateLimiterPrisma` pour les autres routes | Cohérent entre répliques Docker et instances Vercel, sans Redis |
| NPI | AES-256-GCM `node:crypto`, format versionné, AAD, HMAC-SHA-256 pour l'index, clés en variables d'environnement V1, KMS V2 | Références NIST et OWASP ; rotation prévue dès le format |
| WhatsApp | Adaptateur wapy.pro sur `/pont/v1/otp` et `/pont/v1/messages`, idempotence, webhook signé, respect des quotas ; API WhatsApp Business pour les alertes de masse | Documentation publique et précise ; quotas incompatibles avec la diffusion massive |

### 9.2 Risques et parades

| Risque | Parade |
|---|---|
| Surface de better-auth et fréquence des avis de sécurité | N'installer que les plugins nécessaires (pas de SSO, OAuth provider, SCIM, Stripe) ; figer les versions ; abonnement aux avis GitHub ; mise à jour mensuelle |
| Dépendance à la feuille de route de Vercel | Licence MIT, schéma Prisma généré et possédé par le projet, données en PostgreSQL souverain ; la sortie coûterait une réécriture des adaptateurs, pas une migration de données |
| Bugs Next 16 (`use cache`, hydratation de `useSession`) | Lire la session côté serveur dans une couche d'accès aux données, éviter `useSession` dans les composants rendus en cache, tests de bout en bout sur les parcours OTP et TOTP |
| Quotas wapy.pro (2 OTP par heure et par destinataire, 500 envois par jour) | Message d'attente explicite dans l'interface, repli SMS, adaptateur WhatsApp Business pour les alertes |
| Compromission d'une clé NPI en variable d'environnement | Format versionné, rotation par tâche de fond, journal des déchiffrements, passage au KMS en V2 |
| Argon2 natif sur une plateforme non prévue | `bcryptjs` en repli documenté, derrière une interface `PasswordHasher` |

### 9.3 Options écartées

- **Auth.js v5** : bêta depuis trois ans, mode maintenance, Credentials impose des JWT non révocables, aucun plugin TOTP, organisations ou limitation de débit ; garder Auth.js reviendrait à réécrire l'essentiel par-dessus une bibliothèque que ses mainteneurs déconseillent aux nouveaux projets.
- **Lucia et Oslo** : dépréciés.
- **Implémentation maison** : envisageable techniquement (jose 6, `cookies()` de Next 16, sessions en base), mais le coût d'écriture et d'audit de l'OTP, du TOTP, des organisations, de la limitation de débit et de la révocation dépasse ce que la phase 2 peut absorber, et le guide de Next lui-même conseille une bibliothèque.

## 10. Sources consultées (2026-09-24)

Piles d'authentification :

- https://registry.npmjs.org/next-auth ; https://registry.npmjs.org/@auth/prisma-adapter ; https://registry.npmjs.org/better-auth ; https://registry.npmjs.org/jose ; https://registry.npmjs.org/lucia ; https://registry.npmjs.org/@oslojs/otp
- https://github.com/nextauthjs/next-auth ; https://raw.githubusercontent.com/nextauthjs/next-auth/main/README.md ; https://github.com/nextauthjs/next-auth/releases/tag/next-auth%405.0.0-beta.32 ; https://github.com/nextauthjs/next-auth/issues/13302 ; https://github.com/nextauthjs/next-auth/discussions/13315 ; https://github.com/nextauthjs/next-auth/issues/13353 ; https://github.com/nextauthjs/next-auth/discussions/13382 ; https://github.com/nextauthjs/next-auth/issues/10966
- https://authjs.dev/getting-started/migrating-to-v5 ; https://authjs.dev/getting-started/adapters/prisma ; https://authjs.dev/getting-started/authentication/credentials ; https://authjs.dev/concepts/session-strategies ; https://authjs.dev/reference/core/errors
- https://better-auth.com/blog/authjs-joins-better-auth ; https://vercel.com/blog/vercel-acquires-better-auth ; https://github.com/better-auth/better-auth ; https://github.com/better-auth/better-auth/security/advisories ; https://github.com/better-auth/better-auth/issues/6439 ; https://github.com/better-auth/better-auth/issues/6746 ; https://github.com/better-auth/better-auth/issues/6277 ; https://github.com/better-auth/better-auth/issues/7129 ; https://github.com/better-auth/better-auth/issues/6781 ; https://github.com/better-auth/better-auth/issues/5584 ; https://github.com/better-auth/better-auth/issues/10972
- https://www.better-auth.com/docs/integrations/next ; https://www.better-auth.com/docs/plugins/phone-number ; https://www.better-auth.com/docs/plugins/2fa ; https://www.better-auth.com/docs/plugins/organization ; https://www.better-auth.com/docs/plugins/admin ; https://www.better-auth.com/docs/concepts/rate-limit ; https://www.better-auth.com/docs/concepts/session-management ; https://www.better-auth.com/docs/adapters/prisma
- https://www.prisma.io/docs/guides/authjs-nextjs ; https://www.prisma.io/docs/guides/betterauth-nextjs
- https://lucia-auth.com/ ; https://github.com/lucia-auth/lucia ; https://pilcrowonpaper.com/blog/18 ; https://github.com/panva/jose
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy ; https://nextjs.org/docs/app/api-reference/functions/cookies ; https://nextjs.org/docs/app/guides/authentication ; documentation embarquée `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` et `02-guides/authentication.md`
- https://github.com/advisories/GHSA-f82v-jwr5-mffw ; https://embracethered.com/blog/posts/2026/minting-next-auth-nextjs-auth-cookies-react2shell-threat/

Hachage, TOTP, débit, chiffrement :

- https://raw.githubusercontent.com/ranisalt/node-argon2/v0.45.1/README.md ; https://github.com/ranisalt/node-argon2/wiki/Options ; https://raw.githubusercontent.com/napi-rs/node-rs/main/packages/argon2/README.md ; https://raw.githubusercontent.com/dcodeIO/bcrypt.js/main/README.md
- https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages ; https://github.com/vercel/next.js/discussions/65978 ; https://github.com/vercel/next.js/issues/65996 ; https://vercel.com/docs/builds/build-image
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html ; https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md ; https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- https://github.com/yeojz/otplib/releases ; https://raw.githubusercontent.com/epicweb-dev/totp/main/README.md ; https://raw.githubusercontent.com/oslo-project/otp/main/README.md ; https://raw.githubusercontent.com/paulmillr/qr/main/README.md ; https://github.com/google/google-authenticator/wiki/Key-Uri-Format
- https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted ; https://raw.githubusercontent.com/animir/node-rate-limiter-flexible/master/README.md ; https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL ; https://github.com/animir/node-rate-limiter-flexible/wiki/Prisma ; https://neon.com/guides/rate-limiting ; https://github.com/fafl/token-bucket-postgres
- https://vercel.com/docs/fluid-compute ; https://vercel.com/docs/fundamentals/what-is-compute ; https://vercel.com/docs/functions/limitations
- https://nodejs.org/api/crypto.html ; https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf ; https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html ; https://ciphersweet.paragonie.com/internals/blind-index ; https://ciphersweet.paragonie.com/internals/key-hierarchy

wapy.pro :

- https://wapy.pro ; https://wapy.pro/developpeurs ; https://wapy.pro/developpeurs/documentation
