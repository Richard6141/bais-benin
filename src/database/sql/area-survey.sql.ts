import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Base de sondage aréolaire (ADR-0033) : tirage des points dans une commune, classe de la carte
// aux points, constats de terrain et parts de la carte par commune.

const frameCommuneSchema = z.object({
  id: z.string(),
  code: z.string(),
  area_m2: z.coerce.number(),
  points: z.coerce.number(),
});

/** Communes d'enquête de la campagne, avec leur surface et les points déjà tirés. */
export async function communesForFrame(campaignId: string, communeCodes: readonly string[]) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id", c."code", ST_Area(c."geom") AS area_m2,
           (SELECT count(*) FROM "area_frame_point" p
             WHERE p."commune_id" = c."id" AND p."campaign_id" = ${campaignId}::uuid) AS points
      FROM "commune" c
     WHERE c."code" = ANY(${[...communeCodes]}::text[]) AND c."geom" IS NOT NULL
     ORDER BY c."code"`;
  return rows.map((row) => frameCommuneSchema.parse(row));
}

const gridPointSchema = z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() });

/**
 * Points d'une grille systématique posée dans le plan UTM 31 N (EPSG:32631) : noeuds à
 * `origin + k × spacing`, gardés s'ils tombent dans la commune, du nord au sud puis d'ouest en est.
 */
export async function gridPointsInCommune(
  communeId: string,
  grid: { spacingM: number; originXM: number; originYM: number },
) {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH c AS (
      SELECT ST_Transform(co."geom"::geometry, 32631) AS g
        FROM "commune" co WHERE co."id" = ${communeId}::uuid
    ), b AS (
      SELECT g,
             floor((ST_XMin(g) - ${grid.originXM}) / ${grid.spacingM}) * ${grid.spacingM}
               + ${grid.originXM} AS x0,
             floor((ST_YMin(g) - ${grid.originYM}) / ${grid.spacingM}) * ${grid.spacingM}
               + ${grid.originYM} AS y0,
             ST_XMax(g) AS x1, ST_YMax(g) AS y1
        FROM c
    ), nodes AS (
      SELECT ST_SetSRID(ST_MakePoint(b.x0 + i * ${grid.spacingM}, b.y0 + j * ${grid.spacingM}),
                        32631) AS p, i, j
        FROM b,
             generate_series(0, ceil((b.x1 - b.x0) / ${grid.spacingM})::int) AS i,
             generate_series(0, ceil((b.y1 - b.y0) / ${grid.spacingM})::int) AS j
    )
    SELECT ST_Y(ST_Transform(nodes.p, 4326)) AS latitude,
           ST_X(ST_Transform(nodes.p, 4326)) AS longitude
      FROM nodes, b
     WHERE ST_Intersects(b.g, nodes.p)
     ORDER BY nodes.j DESC, nodes.i`;
  return rows.map((row) => gridPointSchema.parse(row));
}

export interface FramePointRow {
  id: string;
  code: string;
  latitude: number;
  longitude: number;
}

/**
 * Enregistre les points tirés ; un point déjà tiré (même code) est gardé tel quel. `selected`
 * faux : points de première phase (ADR-0037), montrés aux agents seulement une fois retenus.
 */
export async function insertFramePoints(
  campaignId: string,
  communeId: string,
  grid: { spacingM: number; originXM: number; originYM: number },
  points: readonly FramePointRow[],
  drawnAt: Date,
  selected = true,
): Promise<number> {
  if (points.length === 0) return 0;
  return prisma.$executeRaw`
    INSERT INTO "area_frame_point" (
      "id", "campaign_id", "commune_id", "code", "geom", "latitude", "longitude", "spacing_m",
      "origin_x_m", "origin_y_m", "drawn_at", "selected")
    SELECT t.id, ${campaignId}::uuid, ${communeId}::uuid, t.code,
           ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography, t.lat, t.lon,
           ${grid.spacingM}, ${grid.originXM}, ${grid.originYM}, ${drawnAt}, ${selected}
      FROM unnest(${points.map((point) => point.id)}::uuid[],
                  ${points.map((point) => point.code)}::text[],
                  ${points.map((point) => point.latitude)}::float8[],
                  ${points.map((point) => point.longitude)}::float8[]) AS t(id, code, lat, lon)
    ON CONFLICT ("campaign_id", "code") DO NOTHING`;
}

const toClassifySchema = z.object({
  id: z.string(),
  code: z.string(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  zone_code: z.string().nullable(),
  observed_land_cover: z.string().nullable(),
  observed_crop_code: z.string().nullable(),
});

/**
 * Points dont la classe de la carte manque, date d'une autre version de méthode, ou vient de la
 * démonstration quand on lit la vraie carte. Avec le dernier constat, indice pour la fixture. Un
 * point déjà stratifié (ADR-0037) n'est jamais relu : sa strate est figée.
 */
export async function pointsToClassify(options: {
  campaignId: string;
  methodVersion: number;
  replaceSynthetic: boolean;
  limit: number;
}) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT p."id", p."code", p."latitude", p."longitude", z."code" AS zone_code,
           o."land_cover"::text AS observed_land_cover, o.crop_code AS observed_crop_code
      FROM "area_frame_point" p
      JOIN "commune" c ON c."id" = p."commune_id"
      LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
      LEFT JOIN LATERAL (
        SELECT ob."land_cover", cr."code" AS crop_code
          FROM "area_frame_observation" ob
          LEFT JOIN "crop" cr ON cr."id" = ob."crop_id"
         WHERE ob."point_id" = p."id"
         ORDER BY ob."observed_at" DESC
         LIMIT 1
      ) o ON true
     WHERE p."campaign_id" = ${options.campaignId}::uuid
       AND p."stratum" IS NULL
       AND (p."map_class" IS NULL
            OR p."map_method_version" IS DISTINCT FROM ${options.methodVersion}
            OR (${options.replaceSynthetic} AND p."map_source_id" = 'BAIS_SEED'))
     ORDER BY p."code"
     LIMIT ${options.limit}`;
  return rows.map((row) => toClassifySchema.parse(row));
}

export async function setPointMapClass(
  pointId: string,
  value: {
    mapClass: string;
    methodVersion: number;
    sourceId: string;
    reliability: "ESTIMATED" | "SYNTHETIC";
    computedAt: Date;
  },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "area_frame_point"
       SET "map_class" = ${value.mapClass}::"CropMapClass",
           "map_method_version" = ${value.methodVersion},
           "map_source_id" = ${value.sourceId},
           "map_reliability" = ${value.reliability}::"Reliability",
           "map_computed_at" = ${value.computedAt}
     WHERE "id" = ${pointId}::uuid`;
}

const toStratifySchema = z.object({
  id: z.string(),
  code: z.string(),
  commune_id: z.string(),
  commune_code: z.string(),
  map_class: z.string().nullable(),
  map_method_version: z.coerce.number().nullable(),
});

export type PointToStratify = z.infer<typeof toStratifySchema>;

/**
 * Points de première phase pas encore stratifiés (ADR-0037), commune par commune, dans l'ordre de
 * la grille (du nord au sud puis d'ouest en est, le rang du code).
 */
export async function pointsToStratify(campaignId: string, communeCodes: readonly string[] | null) {
  const where = communeCodes
    ? Prisma.sql`c."code" = ANY(${[...communeCodes]}::text[])`
    : Prisma.sql`true`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT p."id", p."code", p."commune_id", c."code" AS commune_code,
           p."map_class"::text AS map_class, p."map_method_version"
      FROM "area_frame_point" p
      JOIN "commune" c ON c."id" = p."commune_id"
     WHERE p."campaign_id" = ${campaignId}::uuid AND p."stratum" IS NULL AND NOT p."selected"
       AND ${where}
     ORDER BY c."code", length(p."code"), p."code"`;
  return rows.map((row) => toStratifySchema.parse(row));
}

/** Fige la strate de chaque point de première phase et marque ceux retenus pour la visite. */
export async function setPointStrata(
  points: readonly { id: string; stratum: "ANNUAL_CROPS" | "OTHER_LAND"; selected: boolean }[],
): Promise<number> {
  if (points.length === 0) return 0;
  return prisma.$executeRaw`
    UPDATE "area_frame_point" p
       SET "stratum" = t.stratum::"AreaFrameStratum", "selected" = t.selected
      FROM unnest(${points.map((point) => point.id)}::uuid[],
                  ${points.map((point) => point.stratum)}::text[],
                  ${points.map((point) => point.selected)}::boolean[]) AS t(id, stratum, selected)
     WHERE p."id" = t.id AND p."stratum" IS NULL`;
}

const frameStratumSchema = z.object({
  commune_id: z.string(),
  stratum: z.enum(["ANNUAL_CROPS", "OTHER_LAND"]),
  first_phase: z.coerce.number(),
});

export type FrameStratumRecord = z.infer<typeof frameStratumSchema>;

/** Points de première phase de chaque strate, par commune tirée en deux phases (ADR-0037). */
export async function frameStrata(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT p."commune_id", p."stratum"::text AS stratum, count(*) AS first_phase
      FROM "area_frame_point" p
     WHERE p."campaign_id" = ${campaignId}::uuid AND p."stratum" IS NOT NULL
     GROUP BY p."commune_id", p."stratum"`;
  return rows.map((row) => frameStratumSchema.parse(row));
}

const surveyPointSchema = z.object({
  id: z.string(),
  code: z.string(),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  commune_area_ha: z.coerce.number(),
  map_class: z.string().nullable(),
  map_method_version: z.coerce.number().nullable(),
  map_source_id: z.string().nullable(),
  stratum: z.enum(["ANNUAL_CROPS", "OTHER_LAND"]).nullable(),
  land_cover: z.string().nullable(),
  crop_code: z.string().nullable(),
  observed_at: z.date().nullable(),
  observation_source_id: z.string().nullable(),
});

export type SurveyPointRecord = z.infer<typeof surveyPointSchema>;

/**
 * Points à visiter de la campagne avec leur dernier constat, dans les communes données (toutes si
 * null). Les points de première phase non retenus (ADR-0037) n'y sont pas. Aucun producteur : un
 * point n'est rattaché qu'à sa commune.
 */
export async function surveyPoints(
  campaignId: string,
  scope: { communeIds: readonly string[]; departementIds: readonly string[] } | null,
) {
  const where = scope
    ? Prisma.sql`(c."id" = ANY(${[...scope.communeIds]}::uuid[])
                   OR c."departement_id" = ANY(${[...scope.departementIds]}::uuid[]))`
    : Prisma.sql`true`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT p."id", p."code", p."latitude", p."longitude", c."id" AS commune_id,
           c."code" AS commune_code, c."name" AS commune_name,
           ST_Area(c."geom") / 10000 AS commune_area_ha,
           p."map_class"::text AS map_class, p."map_method_version", p."map_source_id",
           p."stratum"::text AS stratum,
           o."land_cover"::text AS land_cover, o.crop_code, o."observed_at",
           o."source_id" AS observation_source_id
      FROM "area_frame_point" p
      JOIN "commune" c ON c."id" = p."commune_id"
      LEFT JOIN LATERAL (
        SELECT ob."land_cover", cr."code" AS crop_code, ob."observed_at", ob."source_id"
          FROM "area_frame_observation" ob
          LEFT JOIN "crop" cr ON cr."id" = ob."crop_id"
         WHERE ob."point_id" = p."id"
         ORDER BY ob."observed_at" DESC
         LIMIT 1
      ) o ON true
     WHERE p."campaign_id" = ${campaignId}::uuid AND p."selected" AND ${where}
     ORDER BY c."name", p."code"`;
  return rows.map((row) => surveyPointSchema.parse(row));
}

const mapShareSchema = z.object({
  commune_id: z.string(),
  crop_class: z.string(),
  pixel_share: z.coerce.number(),
  method_version: z.coerce.number(),
  radar: z.boolean(),
});

/** Parts de chaque classe dans les communes, selon la carte des pixels de la campagne. */
export async function communeMapShares(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT e."commune_id", e."crop_class"::text AS crop_class, e."pixel_share",
           e."method_version",
           bool_or(e."radar_rice_share" IS NOT NULL) OVER (PARTITION BY e."commune_id") AS radar
      FROM "crop_area_estimate" e
     WHERE e."campaign_id" = ${campaignId}::uuid`;
  return rows.map((row) => mapShareSchema.parse(row));
}
