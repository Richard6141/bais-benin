# ADR-0010 — better-auth remplace Auth.js : sessions en base, Argon2id, TOTP, NPI chiffré

- Statut : acceptée, remplace ADR-0003
- Date : 2026-09-24
- Décideurs : Sécurité, Architecte, Backend/Data

## Contexte

L'ADR-0003 retenait Auth.js v5 pour l'OTP téléphone, les identifiants institutionnels et un fournisseur OIDC prêt pour l'ANIP. La recherche menée avant l'étape 3 (`docs/recherche/authentification-etape-3.md`) a établi que ce choix ne tient plus :

- next-auth v5 est en bêta depuis trois ans (5.0.0-beta.32 du 20 juillet 2026), en maintenance de sécurité seulement, et ses mainteneurs actuels, l'équipe de Better Auth depuis septembre 2025, orientent les nouveaux projets vers Better Auth ;
- le fournisseur Credentials, seul moyen d'implémenter téléphone + OTP, impose la stratégie de session JWT, donc des sessions non révocables, ce qui contredit le document 06 (révocation par liste de sessions, appareils révocables) ;
- Auth.js n'offre ni TOTP, ni organisations, ni limitation de débit : l'essentiel aurait été à écrire par-dessus.

Les contraintes du dépôt pèsent aussi sur les choix annexes : Next 16 (`proxy.ts`, Turbopack), Prisma 7 avec adaptateur `pg`, image Docker `node:22-alpine` (libc musl), déploiement possible sur Vercel Fluid Compute, pas de Redis en V1, et une autorisation APDP à préparer pour la simple conservation du NPI (`docs/recherche/anip-npi-api.md`).

## Options étudiées

1. **Conserver Auth.js v5** — écarté : stagnation, JWT non révocables avec Credentials, tout le reste à construire.
2. **Implémentation maison** (jose 6, `cookies()` de Next 16, sessions en base) — écartée : techniquement possible, mais OTP, TOTP, organisations, limitation de débit, révocation et rotation seraient à écrire et à faire auditer, ce que la phase 2 ne peut absorber ; le guide d'authentification de Next lui-même recommande une bibliothèque.
3. **Lucia et Oslo** — écartés : dépréciés en 2025 et 2026.
4. **better-auth 1.7.x** — retenu : stable, releases hebdomadaires, licence MIT, documentation dédiée à Next 16 et à Prisma 7, plugins officiels couvrant les besoins, sessions en base révocables, limiteur de débit intégré avec stockage en base.

## Décision

### Pile d'authentification

- **better-auth 1.7.6** avec l'adaptateur Prisma, les plugins `phoneNumber`, `twoFactor` et `nextCookies`, préfixe de cookie `bais`, identifiants générés en UUID (`src/lib/auth/auth.ts`). Le schéma better-auth est généré dans le dépôt et migré par SQL relu (`src/database/migrations/20260924203000_authentication_and_audit`).
- **Sessions en base, révocables**, durée de 30 jours glissants avec rafraîchissement quotidien, cache de cookie de 5 minutes pour éviter une lecture en base à chaque rendu. Les comptes institutionnels (`ADMIN_STATE`, `COOPERATIVE`, `BUYER`) sont limités à 12 heures par un contrôle applicatif dans `getCurrentUser`, better-auth n'ayant qu'une durée globale. L'utilisateur voit et révoque ses sessions depuis la page Compte.
- **Téléphone + OTP** : plugin `phoneNumber`, code à 6 chiffres, 5 minutes, 5 tentatives, validation du format béninois (`+229 01 XX XX XX XX`) ; le code est remis par le port `MessagingChannel` (wapy.pro, fixture ou console), sans attendre la réponse du fournisseur pour ne pas révéler l'existence d'un numéro. Un compte est créé à la première vérification avec une adresse technique `<numéro>@telephone.bais.invalid`, better-auth exigeant un e-mail unique.
- **Institutions** : e-mail et mot de passe, inscription libre désactivée, 12 caractères minimum, **Argon2id via `@node-rs/argon2`** (m = 19 456 Kio, t = 2, p = 1, paramètres OWASP) à la place du scrypt par défaut ; binaire musl fourni pour l'image Alpine, paquet externalisé par Next.
- **Double authentification** : plugin `twoFactor` (TOTP 6 chiffres, 30 s, codes de secours, appareil de confiance), QR d'enrôlement rendu en SVG côté serveur par `@paulmillr/qr`. **Un compte `ADMIN_STATE` sans double authentification est redirigé vers `/compte/securite?obligatoire=1` et ne peut pas entrer dans l'espace de pilotage** (`requireRole`).
- **Limitation de débit** : limiteur intégré de better-auth en stockage `database` (table `auth_rate_limit`), donc cohérent entre répliques Docker et instances Vercel : 30 requêtes par minute en général, 5 envois de code par heure, 5 vérifications par quart d'heure, 10 connexions institutionnelles et 10 vérifications TOTP par quart d'heure.
- **Garde d'espaces** : `src/proxy.ts` ne vérifie que la présence du cookie de session pour rediriger vers `/connexion` avec le chemin demandé ; la vérification réelle de la session, du rôle et du périmètre a lieu dans les layouts et actions serveur (`requireUser`, `requireRole`, `requirePermission`), conformément à la documentation de Next.

### NPI

- Chiffrement **AES-256-GCM** (`node:crypto`), nonce aléatoire de 12 octets, tag de 16 octets, données associées « table.colonne.identifiant », format stocké versionné `v1.<nonce>.<tag>.<chiffré>` en base64url pour permettre la rotation de clé (`src/lib/crypto/npi.ts`).
- **Index aveugle** HMAC-SHA-256 avec une clé distincte (`NPI_HASH_KEY`), colonne `npi_index` sous contrainte d'unicité : détection des doublons et recherche exacte sans divulgation.
- Clés en variables d'environnement en V1 (`NPI_ENCRYPTION_KEY`, `NPI_HASH_KEY`, 32 octets en base64, validées au démarrage). Le NPI n'est jamais renvoyé au client : affichage masqué, révélation réservée au droit `user.npi.reveal` avec justification et journalisation.
- La vérification passe par le port `IdentityVerificationProvider` : `anip-local` (contrôle de forme, statut `PENDING`) par défaut, `anip-xroad` en squelette.

### Messagerie

- Adaptateur wapy.pro sur la documentation publique du « Pont WhatsApp » : `POST /pont/v1/otp` pour les codes, `POST /pont/v1/messages` pour les textes libres, en-tête `Idempotency-Key`, traduction des codes HTTP en erreurs typées (`NOT_CONFIGURED`, `RECIPIENT_UNKNOWN`, `RATE_LIMITED` avec `Retry-After`, `PROVIDER_UNAVAILABLE`, `REJECTED`).

### Autorisation et audit

- La matrice rôle × action × portée (ADR-0004) est portée par `src/modules/authorization/policies.matrix.ts` ; les affectations sont chargées en un acteur (`loadActor`) pour que chaque décision soit une comparaison en mémoire.
- Journal d'audit en ajout seul (`audit_log`), adresse IP hachée, échec d'écriture journalisé mais jamais bloquant.

## Ce qui est implémenté et ce qui reste

| Élément | État au 2026-09-24 |
|---|---|
| better-auth, plugins `phoneNumber`, `twoFactor`, `nextCookies`, adaptateur Prisma, migration, seed de démonstration | Implémenté |
| Sessions en base, cache cookie 5 min, limite 12 h institutionnelle, liste et révocation des sessions | Implémenté |
| Argon2id `@node-rs/argon2`, TOTP et QR SVG, double authentification obligatoire pour `ADMIN_STATE` | Implémenté |
| Limiteur de débit better-auth en base sur les routes d'authentification | Implémenté |
| NPI : chiffrement versionné, index HMAC, masquage, révélation journalisée, fournisseur `anip-local` | Implémenté |
| Adaptateur wapy.pro (envoi), canaux console et fixture | Implémenté |
| Journal d'audit : connexion, rôles accordés ou révoqués, NPI rattaché ou révélé | Implémenté |
| Limitation de débit hors authentification (recherche marché, assistant, webhooks) avec `rate-limiter-flexible` en PostgreSQL | À faire (dépendance non installée) |
| Échange X-Road réel avec l'ANIP (`anip-xroad`) | Squelette : lève `NOT_CONFIGURED` ou `UNAVAILABLE` tant que la convention et le schéma de service ne sont pas fournis |
| Webhook entrant wapy.pro (accusés de remise, signature `X-Wapy-Signature`) | À faire |
| Plugin `organization` de better-auth pour les coopératives | À faire ; la portée `ORGANIZATION` existe déjà dans le moteur d'autorisation |
| Journalisation des échecs de connexion, déconnexions, activation et désactivation de la double authentification, révocations de session | À faire : les actions existent dans le type `AuditAction` mais ne sont pas encore enregistrées |
| Rotation de clé NPI et passage à un KMS | À faire ; le format versionné le permet sans migration de données |
| Fournisseur OIDC générique (ANIP ou autre fournisseur national) | À faire, par plugin better-auth lorsque le fournisseur existera |

## Conséquences

- Positives : OTP, TOTP, sessions révocables et limitation de débit reposent sur une bibliothèque maintenue et documentée pour Next 16 et Prisma 7 ; les données d'authentification restent dans le PostgreSQL souverain ; la double authentification des administrateurs est imposée par le code et non par une consigne.
- Négatives : dépendance à la feuille de route de Better Auth, désormais chez Vercel ; surface de sécurité étendue, d'où la règle de n'installer que les plugins nécessaires, de figer les versions et de suivre les avis de sécurité du dépôt ; une adresse e-mail technique est créée pour chaque compte téléphone.
- Réversibilité : licence MIT, schéma Prisma possédé par le projet, sessions et comptes en base : quitter better-auth coûterait une réécriture des adaptateurs, pas une migration de données. Les ports `MessagingChannel` et `IdentityVerificationProvider` isolent wapy.pro et l'ANIP.
- L'ADR-0003 est remplacée ; l'ADR-0004 (autorisation) et l'ADR-0007 (wapy.pro comme canal) restent en vigueur et sont mises en œuvre par cette décision.
