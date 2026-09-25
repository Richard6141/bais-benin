-- Tableau de bord national (étape 7, docs/modules/pilotage-parcours-ux.md §4). Deux vues
-- matérialisées d'agrégats au grain commune, lues par le module analytics, rafraîchies en
-- CONCURRENTLY (lectures jamais bloquées ; un index unique par vue est obligatoire pour cela).
-- Départements et pays sont agrégés à la lecture, par somme des communes.
--
-- Conventions communes :
-- - exploitations, parcelles et cultures non archivées seulement ;
-- - une exploitation compte pour sa commune de rattachement ;
-- - « vérifiée » = AGENT_VERIFIED ou FIELD_VERIFIED ; le statut est une clé des deux vues,
--   donc les effectifs sont additifs entre statuts comme entre communes.

-- Commune × campagne × culture × statut de vérification.
-- farm_count : exploitations distinctes qui portent la culture dans la campagne (additif entre
-- communes et statuts, pas entre cultures : une exploitation porte souvent plusieurs cultures).
-- area_ha : superficie déclarée de la culture (parcel_crop.area_ha).
-- measured_area_ha : superficie relevée (contours GPS) des parcelles qui portent la culture ; une
-- parcelle qui porte la culture sur deux sous-saisons compte deux fois (surface cultivée cumulée).
-- harvested_area_ha : superficie déclarée des cultures qui ont au moins une déclaration de
-- récolte, dénominateur du rendement indicatif.
CREATE MATERIALIZED VIEW "mv_crop_stats_by_commune" AS
SELECT f."commune_id",
       pc."campaign_id",
       pc."crop_id",
       f."verification_status",
       count(DISTINCT f."id")::int AS farm_count,
       count(DISTINCT p."id")::int AS parcel_count,
       count(DISTINCT p."id") FILTER (WHERE p."computed_area_ha" IS NOT NULL)::int
         AS measured_parcel_count,
       coalesce(sum(pc."area_ha"), 0)::float8 AS area_ha,
       coalesce(sum(p."computed_area_ha"), 0)::float8 AS measured_area_ha,
       coalesce(sum(pc."area_ha") FILTER (WHERE pd."declarations" > 0), 0)::float8
         AS harvested_area_ha,
       coalesce(sum(pd."quantity_kg"), 0)::float8 AS production_kg,
       coalesce(sum(pd."declarations"), 0)::int AS declared_harvest_count,
       now() AS refreshed_at
FROM "parcel_crop" pc
JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
LEFT JOIN LATERAL (
  SELECT sum(d."quantity_kg") AS quantity_kg, count(*) AS declarations
  FROM "production_declaration" d
  WHERE d."parcel_crop_id" = pc."id" AND d."archived_at" IS NULL
) pd ON true
WHERE pc."archived_at" IS NULL
GROUP BY f."commune_id", pc."campaign_id", pc."crop_id", f."verification_status";

CREATE UNIQUE INDEX "mv_crop_stats_by_commune_key"
  ON "mv_crop_stats_by_commune" ("commune_id", "campaign_id", "crop_id", "verification_status");
CREATE INDEX "mv_crop_stats_by_commune_campaign_idx"
  ON "mv_crop_stats_by_commune" ("campaign_id", "crop_id");

-- Commune × statut de vérification, indépendant des campagnes.
-- farmer_count : producteurs distincts dans la ligne ; un producteur qui a des exploitations
-- dans deux communes ou deux statuts compte dans chaque ligne. Les totaux de producteurs sont
-- donc calculés en direct, jamais par somme de cette colonne.
CREATE MATERIALIZED VIEW "mv_farm_stats_by_commune" AS
SELECT f."commune_id",
       f."verification_status",
       count(*)::int AS farm_count,
       count(DISTINCT f."farmer_id")::int AS farmer_count,
       coalesce(sum(f."declared_area_ha"), 0)::float8 AS declared_area_ha,
       coalesce(sum(p."parcels"), 0)::int AS parcel_count,
       coalesce(sum(p."measured_parcels"), 0)::int AS measured_parcel_count,
       coalesce(sum(p."measured_area"), 0)::float8 AS measured_area_ha,
       coalesce(sum(p."declared_of_measured"), 0)::float8 AS declared_area_of_measured_ha,
       now() AS refreshed_at
FROM "farm" f
LEFT JOIN LATERAL (
  SELECT count(*) AS parcels,
         count(*) FILTER (WHERE x."computed_area_ha" IS NOT NULL) AS measured_parcels,
         sum(x."computed_area_ha") AS measured_area,
         sum(x."declared_area_ha") FILTER (WHERE x."computed_area_ha" IS NOT NULL)
           AS declared_of_measured
  FROM "parcel" x
  WHERE x."farm_id" = f."id" AND x."archived_at" IS NULL
) p ON true
WHERE f."archived_at" IS NULL
GROUP BY f."commune_id", f."verification_status";

CREATE UNIQUE INDEX "mv_farm_stats_by_commune_key"
  ON "mv_farm_stats_by_commune" ("commune_id", "verification_status");

-- Horodatage des rafraîchissements (bandeau de fraîcheur, bloc D5).
CREATE TABLE "analytics_refresh" (
  "view_name" TEXT NOT NULL,
  "refreshed_at" TIMESTAMP(3) NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "row_count" INTEGER NOT NULL,
  CONSTRAINT "analytics_refresh_pkey" PRIMARY KEY ("view_name")
);

-- Index des requêtes directes du pilotage.
-- C3 et D3 : visites par agent.
CREATE INDEX "farm_verification_agent_id_visited_at_idx"
  ON "farm_verification" ("agent_id", "visited_at");
-- D2 : ancienneté des exploitations déclarées.
CREATE INDEX "farm_verification_status_created_at_idx"
  ON "farm" ("verification_status", "created_at");
-- D4 : doublons probables (même commune, mêmes nom et prénom sans casse). Index d'expression,
-- non représentable dans schema.prisma : `prisma migrate diff` propose de le supprimer, comme
-- les index spatiaux et trigrammes déjà présents ; ne pas appliquer cette suppression.
CREATE INDEX "farmer_commune_name_idx"
  ON "farmer" ("commune_id", lower("last_name"), lower("first_name"))
  WHERE "archived_at" IS NULL;
