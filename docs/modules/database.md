# Base de données et référentiels

Ce document décrit ce qui est effectivement en place depuis l'étape 2. Le modèle cible complet est dans [04 — Modèle de données](../04-modele-donnees.md).

## Où sont les choses

| Élément | Emplacement |
|---|---|
| Schéma Prisma | `prisma/schema.prisma` |
| Configuration Prisma (URL, migrations, seed) | `prisma.config.ts` |
| Migrations SQL | `src/database/migrations/` |
| Client Prisma généré | `src/generated/prisma/` (ignoré par Git, `pnpm db:generate`) |
| Instance partagée du client | `src/database/client.ts` |
| Requêtes spatiales typées | `src/database/sql/*.sql.ts` |
| Seed | `src/database/seed/` (`pnpm db:seed`) |
| Référentiels versionnés | `src/database/seed/reference/` (cultures, zones, saisons, sources) |
| Géométries brutes | `src/database/seed/territory/raw/` (geoBoundaries, CC BY 4.0, voir `LICENCE.md`) |
| Accès métier au territoire | `src/modules/territory/` |

## Tables en place

| Table | Rôle | Particularités |
|---|---|---|
| `data_source` | Sources de données | identifiants stables (`GEOBOUNDARIES`, `MAEP_DSA`, `BAIS_SEED`…) |
| `agro_ecological_zone` | Huit zones agro-écologiques | régime pluviométrique, départements couverts |
| `departement` | Douze départements | code ISO 3166-2, géométrie dérivée des communes (ADR-0009) |
| `commune` | 77 communes | code stable `BJ-<DEP>-<NNN>`, alias de recherche, zone de rattachement, géométrie ADM2 |
| `crop` | 21 cultures | catégorie, cycle, unité de vente, calendrier par régime, couleur d'interface |
| `agricultural_campaign` | Campagnes du 1er avril au 31 mars | statut calculé à la date du seed |
| `user`, `role_assignment` | Comptes et rôles avec périmètre | NPI haché et chiffré, jamais en clair ; mécanismes de connexion à l'étape 3 |
| `farmer`, `farm`, `parcel`, `parcel_crop` | Registre national | prêt pour l'étape 5 ; géométries PostGIS, verrou optimiste `version` |

Chaque table métier porte `source_id`, `source_date`, `reliability`, `created_at`, `updated_at` et `archived_at` (suppression logique).

## PostGIS

Les colonnes géographiques sont déclarées `Unsupported("geography(...)")` dans Prisma : Prisma les crée, mais ne les lit ni ne les écrit. Toute opération spatiale passe par `src/database/sql/` avec `$queryRaw` paramétré et validation Zod du résultat. Les index GiST et les index trigrammes sont ajoutés à la main dans la migration `20260924181338_agricultural_data_model`.

Requêtes disponibles : commune contenant un point GPS, géométries simplifiées des communes pour l'affichage, contrôle de cohérence commune/département.

## Seed

`pnpm db:seed` charge, dans l'ordre : sources, zones, départements et communes (avec géométries, centroïdes, surfaces), cultures, campagnes. Chaque étape est un `upsert` : relancer le seed met à jour sans dupliquer. Le seed ne touche jamais aux tables du registre.

Volumes attendus : 7 sources, 8 zones, 12 départements, 77 communes, 21 cultures, 4 campagnes.

## Vérifier

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm test:integration          # 13 tests : extensions, volumes, idempotence, géométries, point GPS, recherche, relations
docker exec bais-db psql -U bais -d bais -c "select code, name, round(area_km2) from departement order by name;"
```

## Ajouter une table

1. Modèle Prisma avec `@map` snake_case et les six colonnes de provenance et de cycle de vie.
2. `pnpm db:migrate:dev --create-only --name <sujet>` puis compléter le SQL (index, colonnes géographiques, vues).
3. `pnpm db:migrate` sur la base locale, `pnpm db:generate`.
4. Requêtes spatiales dans `src/database/sql/`, accès métier dans le module concerné, test d'intégration.
