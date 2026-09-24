# BAIS — Bénin Agricultural Intelligence System

Plateforme numérique nationale de connaissance, d'accompagnement et de pilotage de l'agriculture béninoise : registre des exploitations, carte agricole, monitoring et alertes, marché, assistant et centre de pilotage pour l'État.

> État du projet : **étape 0 (fondations techniques) livrée**. L'application démarre, se connecte à PostGIS, s'installe comme PWA et affiche la page d'accueil avec le design system initial. Les étapes suivantes sont décrites dans le [plan de développement](docs/05-plan-developpement.md).

## Pourquoi

L'État doit pouvoir répondre en quelques secondes à des questions comme : combien de producteurs de maïs dans une commune, sur quelle superficie, pour quelle production, quelles zones sont exposées à un risque climatique, qui a besoin d'accompagnement, où intervenir. BAIS construit l'infrastructure de données qui rend ces réponses possibles, tout en servant directement les agriculteurs, les agents de terrain, les coopératives, les acheteurs et les communes.

## Les six espaces

| Espace | Pour qui |
|---|---|
| Agriculteur | voir son exploitation, déclarer, recevoir alertes et conseils, vendre |
| Agent terrain | enregistrer et vérifier des exploitations, hors-ligne, synchroniser plus tard |
| Coopérative | suivre ses membres et agréger l'offre |
| Acheteur | trouver des productions vérifiées, émettre des demandes |
| Commune | vue territoriale de l'agriculture communale |
| Ministère | centre de pilotage national, alertes, tendances, qualité des données |

## Pile technique

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · shadcn/ui · Motion · MapLibre GL JS · PostgreSQL 16 + PostGIS + pgvector · Prisma 7 · Zod 4 · Auth.js v5 · Serwist + Dexie (PWA hors-ligne) · Vitest · Playwright · Docker · Vercel.

## Documentation

| Document | Contenu |
|---|---|
| [01 — Vision produit](docs/01-vision-produit.md) | problème, proposition, utilisateurs, périmètre, indicateurs de succès |
| [02 — Architecture](docs/02-architecture.md) | vue d'ensemble, couches, modules, flux critiques, déploiement |
| [03 — Arborescence](docs/03-arborescence.md) | structure du dépôt et règles d'organisation |
| [04 — Modèle de données](docs/04-modele-donnees.md) | entités, provenance, géométrie, vues d'agrégation, sécurité base |
| [05 — Plan de développement](docs/05-plan-developpement.md) | étapes, livrables, tests, définition de « terminé » |
| [06 — Sécurité et permissions](docs/06-securite-et-permissions.md) | modèle de menaces, authentification, matrice d'accès, données personnelles, audit |
| [07 — Identité visuelle et design system](docs/07-identite-visuelle-design-system.md) | direction artistique, palette, typographie, composants, accessibilité |
| [08 — Données de référence et sources](docs/08-donnees-et-sources.md) | découpage administratif, zones agro-écologiques, cultures, campagnes, dataset |
| [09 — Intégrations externes](docs/09-integrations-externes.md) | wapy.pro, ANIP, météo, IA, cartographie, sources futures |
| [10 — Conventions](docs/10-conventions.md) | git, commits, code, commentaires, tests |
| [ADR](docs/adr/README.md) | décisions d'architecture |

## Principes non négociables

1. Le terrain d'abord : hors-ligne complet pour l'agent, mobile prioritaire, faible débit.
2. Une donnée sans source n'existe pas : source, date et niveau de fiabilité sur chaque enregistrement.
3. Minimisation et cloisonnement des données personnelles ; NPI jamais en clair.
4. Intégrations externes derrière des ports ; l'application fonctionne sans aucune d'elles.
5. Design institutionnel moderne, jamais « administratif ancien ».

## Démarrage

Prérequis : Node.js 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env          # renseigner DATABASE_URL et les variables POSTGRES_*
pnpm db:up                    # PostgreSQL 16 + PostGIS + pgvector (port POSTGRES_PORT)
pnpm db:generate              # client Prisma
pnpm db:migrate               # migrations (extensions PostGIS, pg_trgm, citext, pgcrypto)
pnpm dev                      # http://localhost:3000
```

Si un PostgreSQL local occupe déjà le port 5432, définir `POSTGRES_PORT=5433` et adapter `DATABASE_URL`.

### Vérifier

```bash
pnpm check                    # lint + types + tests unitaires
pnpm test:integration         # exige la base démarrée et migrée
pnpm build && pnpm test:e2e   # parcours Playwright sur le build de production
curl http://localhost:3000/api/health
```

### Conteneur complet

```bash
docker compose --profile full up --build
```

## Contribuer

Branches `main`, `develop`, `feature/*` ; commits Conventional Commits ; revue croisée obligatoire. Détails dans [docs/10-conventions.md](docs/10-conventions.md).

## Licence

À définir avec le Ministère (recommandation : licence ouverte compatible avec un usage public, par exemple EUPL 1.2 ou Apache 2.0).
