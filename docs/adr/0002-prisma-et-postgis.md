# ADR-0002 — Prisma 7 avec colonnes PostGIS en `Unsupported` et migrations SQL manuelles

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Backend/Data, Architecte

## Contexte

Prisma est imposé comme ORM et PostGIS comme moteur géographique. Prisma ne modélise pas nativement les types `geometry` et `geography`, ne crée pas d'index GiST et ne connaît pas les fonctions spatiales.

## Options étudiées

1. Drizzle ORM (support PostGIS partiel) — écarté : contredit la contrainte du brief.
2. Stocker les géométries en GeoJSON `jsonb` — écarté : perte des index spatiaux, des agrégations territoriales et des tuiles vectorielles.
3. Prisma pour le relationnel, colonnes géographiques en `Unsupported("geography(...)")`, requêtes spatiales en `$queryRaw` typé, migrations SQL écrites à la main — retenu.

## Décision

- Le schéma Prisma reste la source de vérité relationnelle. Les colonnes géographiques sont déclarées `Unsupported` et donc invisibles au client Prisma.
- Toute lecture ou écriture spatiale passe par `src/database/sql/` : requêtes paramétrées, résultat validé par un schéma Zod, fonctions exportées et testées.
- Les migrations sont générées par `prisma migrate dev --create-only` puis complétées à la main (extensions, colonnes, index GiST, vues matérialisées, politiques RLS). Elles sont versionnées et rejouées en CI sur une base PostGIS neuve.
- Les centroïdes et superficies calculées sont dénormalisés dans des colonnes classiques pour que Prisma puisse filtrer et trier sans SQL brut dans les cas simples.

## Conséquences

- Discipline supplémentaire sur les migrations, compensée par des tests d'intégration systématiques.
- Le module `territory` et le module `registry` exposent des dépôts qui masquent cette dualité au reste du code.
