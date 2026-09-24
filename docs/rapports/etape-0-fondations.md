# Rapport d'étape 0 — Fondations techniques

- Branche : `feature/foundations` (fusionnée dans `develop`)
- Date : 24 septembre 2026
- Périmètre : application Next.js 16 fonctionnelle, outillage qualité, base PostGIS locale, migrations Prisma, PWA, CI, premiers tests.

## Terminé

- Application Next.js 16.3 (App Router, Turbopack), TypeScript strict avec `noUncheckedIndexedAccess`, alias `@/`.
- Tailwind CSS 4 et shadcn/ui configurés ; jetons de design de la charte (golfe, latérite, forêt, craie) exposés en variables CSS et thème sombre ; composants `Button`, `Card`, `Badge` (avec variantes sémantiques `success`, `info`, `watch`, `warning`, `critical`, `offline`).
- Page d'accueil « Bénin Agricultural Intelligence System » : en-tête avec monogramme, section d'accroche animée sobrement (Motion, respect de `prefers-reduced-motion`), chiffres du territoire avec mention de source, grille des six espaces, état de la plateforme rendu côté serveur (application, base, PostGIS).
- Sonde `/api/health` (état, versions PostgreSQL et PostGIS, latence) sans fuite de configuration.
- PWA : manifeste, icônes générées depuis le monogramme, service worker Serwist (précache de la coquille, page de repli `/~offline`), bandeau hors-ligne réactif aux événements réseau.
- Base : image Docker `postgis/postgis:16-3.4` + pgvector, `docker-compose.yml` (service `db`, service `app` sous profil `full`), Prisma 7 avec adaptateur `pg`, configuration dans `prisma.config.ts`, première migration activant PostGIS, pg_trgm, citext, pgcrypto et vector.
- Qualité : ESLint avec règles de frontières entre couches (`app → features → modules → lib`, domaine sans Next ni React), Prettier avec tri des classes Tailwind, commitlint (types, portées, sujets vagues refusés), lint-staged et Husky.
- Tests : Vitest en deux projets (unitaire jsdom, intégration PostGIS), Playwright en profils desktop et mobile contre le build de production.
- CI GitHub Actions : qualité, intégration avec service PostGIS et migrations, build, bout en bout.
- En-têtes de sécurité de base (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` limitant la géolocalisation à l'origine).
- Documentation : README (démarrage, vérification, conteneur complet), ADR-0008 (Prisma 7, Serwist Turbopack, image de base).

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Lint (frontières comprises) | `pnpm lint` | OK, 0 erreur |
| Types | `pnpm typecheck` | OK |
| Unitaires (validation d'environnement, bandeau hors-ligne) | `pnpm test` | 7 tests OK |
| Intégration (connexion, extensions, surface géodésique PostGIS) | `pnpm test:integration` | 3 tests OK |
| Migration Prisma sur base neuve | `pnpm db:migrate` | OK |
| Build de production | `pnpm build` | OK (7 pages, service worker compilé, 18 entrées précachées) |
| Bout en bout desktop + mobile (accueil, six espaces, état base, manifeste, service worker, page hors-ligne, sonde) | `pnpm test:e2e` | 13 tests OK, 1 ignoré volontairement sur desktop (test mobile) |
| Vérification manuelle | `curl /api/health`, en-têtes HTTP, captures | OK |

## Résultat

OK. Aucun problème ouvert bloquant.

## Captures

- [Accueil, desktop 1440 px](captures/etape-0/accueil-desktop.png)
- [Accueil, mobile Pixel 7](captures/etape-0/accueil-mobile.png)
- [Page hors connexion, mobile](captures/etape-0/hors-connexion-mobile.png)

## Problèmes rencontrés et décisions

- **Port 5432 occupé** par un PostgreSQL 15 local sur le poste : le port hôte du conteneur est paramétrable (`POSTGRES_PORT`, 5433 en local). Documenté dans le README et `.env.example`.
- **Build interrompu par une erreur d'allocation V8** pendant la génération statique avec un worker par cœur (poste à 16 Go avec Docker actif). Limitation à deux workers dans `next.config.ts` ; le build est stable et plus rapide.
- **Prisma 7** ne lit plus l'URL dans le schéma et exige un adaptateur de pilote ; **Serwist** exige `@serwist/turbopack` avec Next 16. Consigné dans l'ADR-0008.
- Le générateur shadcn a introduit une dépendance parasite `cn` et des imports erronés : corrigés, imports pointés vers `@/lib/utils`.
- `next start` affiche un avertissement avec `output: standalone` mais sert correctement l'application pour Playwright ; le conteneur Docker utilise bien `server.js` autonome. Un script de démarrage autonome pour Playwright sera ajouté à l'étape 9 si nécessaire.

## Améliorations possibles

- Ajouter la CSP avec nonces dès que les scripts externes (tuiles, IA) seront connus (étape 3 et 4).
- Mesurer un premier score Lighthouse sur la page d'accueil pour fixer la ligne de base de performance.
- Publier l'image Docker dans la CI (registre) lors de l'étape 9.

## Fichiers principaux

`package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `prettier.config.mjs`, `commitlint.config.ts`, `components.json`, `docker-compose.yml`, `docker/`, `prisma/schema.prisma`, `prisma.config.ts`, `src/database/`, `src/app/`, `src/components/`, `src/features/landing/`, `src/lib/`, `src/modules/platform/`, `src/styles/tokens.css`, `tests/`, `.github/workflows/ci.yml`, `docs/adr/0008-*.md`, `README.md`.

## Commits

```
chore(foundation): configure next.js 16, typescript strict and quality tooling
feat(database): add postgis docker image, prisma 7 client and extension migration
feat(foundation): initialize application architecture
test(foundation): add unit, integration and end-to-end test scaffolding
ci(foundation): add github actions pipeline
docs(foundation): document local setup and record prisma 7 and serwist decisions
test(foundation): load .env for integration tests
build(foundation): cap static generation workers to avoid heap exhaustion
docs(foundation): add step 0 report with verification screenshots
```

## Prochaine étape

Étape 1 — Design system complet : jetons (couleurs, espacements, tailles, ombres, rayons) formalisés, composants `Button`, `Input`, `Card`, `Modal`, `Table`, `Badge`, `Alert`, `Tabs`, `Dropdown`, `Form`, page de démonstration `/design-system` responsive, tests de composants. Branche `feature/design-system`.
