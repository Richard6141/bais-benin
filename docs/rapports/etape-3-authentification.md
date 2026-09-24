# Rapport d'étape 3 — Authentification et autorisations

- Branche : `feature/authentication` (fusionnée dans `develop`)
- Date : 24 septembre 2026
- Périmètre : connexion par téléphone et code à usage unique, comptes institutionnels avec double authentification, sessions révocables, moteur de permissions par rôle et périmètre, NPI chiffré, journal d'audit, espaces protégés, comptes de démonstration.

## Terminé

- **Pile** : better-auth 1.7.6 (ADR-0010, remplace Auth.js) avec sessions en base, cache de cookie de 5 minutes, limiteur de débit stocké en base, Argon2id pour les mots de passe, TOTP avec codes de secours.
- **Connexion par téléphone** en deux écrans : numéro béninois (+229 fixe, 01 XX XX XX XX, clavier numérique, autocomplétion du numéro de l'appareil), puis code à six chiffres (saisie case par case, collage accepté, `one-time-code`), renvoi possible après 60 s, messages neutres. Le premier passage crée le compte.
- **Connexion institutionnelle** : e-mail + mot de passe, puis code d'application d'authentification ou code de secours, appareil de confiance 30 jours. Les administrateurs de l'État doivent activer la double authentification avant d'entrer dans le centre de pilotage (parcours en trois écrans avec QR code).
- **Autorisation** : matrice rôle × action × portée (`src/modules/authorization/policies.matrix.ts`, 18 actions × 5 rôles), `authorize()` pour les décisions unitaires et `scopeFilter()` pour les listes, périmètres NATIONAL / DEPARTEMENT / COMMUNE / ORGANIZATION / SELF, tests générés depuis la matrice.
- **NPI** : facultatif, chiffré AES-256-GCM avec format versionné et données associées, index aveugle HMAC pour l'unicité, affichage masqué, statut « en attente de vérification ANIP » ; port `IdentityVerificationProvider` avec adaptateur local (contrôle de forme, longueur paramétrable) et squelette X-Road prêt pour la convention.
- **Messagerie** : port `MessagingChannel` avec adaptateurs console (développement), fixture (tests) et wapy.pro (`/pont/v1/otp`, clé d'idempotence, erreurs de quota).
- **Journal d'audit** : connexions, demandes de code, déconnexions, activation de la double authentification, révocations de session, attributions de rôle, rattachement et révélation de NPI.
- **Espaces** : `/agriculteur`, `/agent`, `/cooperative`, `/acheteur`, `/pilotage`, `/compte` protégés par le proxy (cookie) puis par `requireRole()` (session, rôle, double authentification) ; page d'accès refusé ; page compte avec identité, NPI, sécurité et appareils connectés (révocation unitaire ou globale).
- **Comptes de démonstration** (seed) : ministère, agent de Djougou, agricultrice de Djougou, coopérative, acheteur.
- **Documentation** : `docs/modules/authentification.md`, `docs/modules/authentification-parcours-ux.md` (spécification écran par écran des parcours à venir : enrôlement par l'agent, récupération d'accès, accueil par rôle), ADR-0010, recherches `docs/recherche/`.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires (matrice de permissions 90 cellules + cas particuliers, chiffrement NPI, environnement, composants) | `pnpm test` | 204 tests OK |
| Intégration (création de compte par OTP, code erroné, numéro étranger, mot de passe, rôles et périmètre de l'agent, NPI chiffré et unique, audit) | `pnpm test:integration` | 20 tests OK |
| Bout en bout desktop + mobile (connexion agricultrice et agent, accès refusé, numéro incomplet, mauvais code, ministère renvoyé vers la double authentification, mot de passe erroné, visiteur anonyme redirigé, NPI masqué) | `pnpm test:e2e` | 37 tests OK |
| Build de production | `pnpm build` | OK (19 pages, proxy) |
| Lint, types | `pnpm lint`, `pnpm typecheck` | OK |
| Sondes manuelles | `curl` sur `/api/auth/sign-in/email` et `/phone-number/send-otp` | 200 en moins de 100 ms |

## Résultat

OK.

## Captures

- [Connexion par téléphone, mobile](captures/etape-3/connexion-telephone-mobile.png)
- [Saisie du code, mobile](captures/etape-3/connexion-code-mobile.png)
- [Espace agriculteur, mobile](captures/etape-3/espace-agriculteur-mobile.png)
- [Espace agent, desktop](captures/etape-3/espace-agent-desktop.png)
- [Compte : identité, sécurité, NPI masqué](captures/etape-3/compte-desktop.png)
- [Connexion institutionnelle](captures/etape-3/connexion-institution-desktop.png)
- [Double authentification obligatoire pour le ministère](captures/etape-3/securite-obligatoire-desktop.png)
- [Accès refusé, mobile](captures/etape-3/acces-refuse-mobile.png)

## Problèmes rencontrés et décisions

- **Auth.js abandonné** : bêta depuis trois ans, fournisseur Credentials limité aux JWT non révocables. better-auth retenu après comparaison (recherche en `docs/recherche/authentification-etape-3.md`).
- **Limites par adresse IP** : les premières valeurs (5 codes par heure) bloquaient les tests parallèles et bloqueraient un quartier entier derrière un opérateur mobile en CGNAT. Fenêtres élargies ; la protection fine reste par numéro (`allowedAttempts`).
- **`NODE_ENV` ne suffit pas** : un build local ou une démonstration tourne en `production`. `APP_ENV` distingue le déploiement réel, seul contexte où le code de démonstration est refusé et le secret exigé.
- **`prisma migrate dev` refuse le mode non interactif** : migrations générées par `prisma migrate diff` puis relues (les index spatiaux manuels ne doivent pas être supprimés).
- **Route de redirection** : `router.replace` vers un Route Handler ne suivait pas la redirection ; remplacée par une page serveur.
- **Parallélisme Playwright** : deux navigateurs maximum sur le poste pour éviter les faux négatifs.

## Reste à faire (suivi)

- Adaptateur X-Road ANIP réel dès réception de la convention ; plugin d'organisation pour les coopératives (étape 5) ; enrôlement d'un agriculteur par l'agent et récupération d'accès (étape 5, spécifiés dans `authentification-parcours-ux.md`) ; webhook wapy.pro ; rotation de clé NPI multi-versions.

## Commits

```
feat(auth): add authentication schema, audit log and secure environment settings
feat(auth): add messaging and identity verification ports with adapters
feat(authorization): add role and scope policy engine with generated tests
feat(auth): implement secure authentication system
test(auth): cover otp sign-in, roles, npi protection and guarded routes
fix(auth): separate deployment environment from node env and follow the landing redirect
feat(auth): audit sign-out, otp requests, two-factor and session revocation
docs(auth): record the better-auth decision and document the module
```

## Complément : refonte de l'accueil (branche `feature/landing-design`, fusionnée)

- Banque de 14 photographies de l'agriculture béninoise (Wikimedia Commons, CC BY-SA, crédits dans `docs/credits-images.md` et sur la page `/credits`), servies en WebP en deux largeurs.
- Accueil réorganisé : héros photographique avec une fiche d'exploitation superposée (l'élément mémorable), les six questions nationales et leurs réponses, les six espaces illustrés, chiffres du territoire lus dans la base, état de la plateforme discret, pied de page institutionnel. Titres en casse de phrase, plus de capitales espacées, une seule animation d'entrée, aucun dégradé.
- Captures : [accueil desktop](captures/etape-0/accueil-desktop.png), [accueil mobile](captures/etape-0/accueil-mobile.png). Tests `tests/e2e/home.spec.ts` verts.

## Prochaine étape

Étape 4 — Cartographie agricole : tuiles vectorielles PostGIS, carte MapLibre des départements, communes, exploitations et parcelles, filtres culture, zone, campagne, tableau de bord carte, tests de chargement, performance et mobile. Branche `feature/agri-map`.

## Guide de test

```bash
git checkout develop && pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:generate && pnpm db:seed
pnpm dev
```

1. http://localhost:3000/connexion → numéro `01 90 00 00 02` → « Recevoir mon code » → code `246810` → espace agriculteur.
2. Menu compte → NPI : saisir `1122334455667`, nom « Test » → « NPI enregistré », affiché masqué.
3. Se déconnecter → `/connexion/institution` → `ministere@bais.demo` / `Demo-Bais-2026!` → redirigé vers l'activation de la double authentification (scanner le QR avec Google Authenticator, saisir le code) → centre de pilotage.
4. Avec le compte agricultrice, ouvrir `/pilotage` → page « accès refusé ».
5. Sans connexion, ouvrir `/agent` → renvoi vers `/connexion?suite=/agent`.
6. Dans le terminal du serveur, chaque code envoyé s'affiche (canal console) ; en base, `select action, count(*) from audit_log group by 1`.
