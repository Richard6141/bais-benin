import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/database/client";

// Carte des cultures par satellite (ADR-0021) : communes à calculer, estimations, surfaces
// déclarées au registre pour comparaison.

export type CropMapClassCode =
  | "UNCLASSIFIED"
  | "RICE"
  | "ANNUAL"
  | "COTTON"
  | "PERENNIAL"
  | "GARDEN"
  | "FALLOW"
  | "NATURAL"
  | "WATER"
  | "BUILT";

const communeSchema = z.object({
  id: z.string(),
  code: z.string(),
  zone_code: z.string().nullable(),
  latitude: z.coerce.number(),
  area_ha: z.coerce.number(),
  geometry: z.string(),
});

export type CropAreaCommune = z.infer<typeof communeSchema>;

interface CursorOptions {
  campaignId: string;
  staleBefore: Date;
  /** Version de méthode en vigueur : une estimation plus ancienne compte comme absente. */
  methodVersion: number;
  /** Vrai pour une mesure réelle : les estimations de démonstration comptent comme absentes. */
  replaceSynthetic: boolean;
  /**
   * Moitié du pays refaite ce mois-ci (0 ou 1), ou null pour toutes. Les communes sont réparties
   * en deux moitiés de coût égal, en alternant dans l'ordre de leur rectangle englobant : chacune
   * est refaite tous les deux mois. Une commune jamais calculée, ou d'une méthode antérieure,
   * passe quel que soit le mois.
   */
  refreshGroup: 0 | 1 | null;
}

// Moitié de rafraîchissement de chaque commune : 1, 0, 1, 0… du plus grand rectangle au plus petit.
const RANKED_COMMUNES = Prisma.sql`
  SELECT c.*, mod(row_number() OVER (
           ORDER BY ST_Area(ST_Envelope(c."geom"::geometry)) DESC, c."code"), 2)::int AS refresh_group
    FROM "commune" c
   WHERE c."archived_at" IS NULL AND c."geom" IS NOT NULL`;

/** Dernier calcul d'une commune ; null s'il manque ou vient d'une méthode antérieure. */
function lastComputation(options: CursorOptions) {
  return Prisma.sql`
    SELECT CASE WHEN min(e."method_version") < ${options.methodVersion} THEN NULL
                ELSE max(e."computed_at") END AS computed_at
      FROM "crop_area_estimate" e
     WHERE e."commune_id" = c."id" AND e."campaign_id" = ${options.campaignId}::uuid
       AND (NOT ${options.replaceSynthetic} OR e."source_id" <> 'BAIS_SEED')`;
}

function isDue(options: CursorOptions) {
  return Prisma.sql`(last.computed_at IS NULL
    OR (last.computed_at < ${options.staleBefore}
        AND (${options.refreshGroup}::int IS NULL OR c.refresh_group = ${options.refreshGroup}::int)))`;
}

/**
 * Communes dont l'estimation de la campagne manque ou date d'avant `staleBefore` (début du mois) :
 * le curseur de la passe mensuelle. Géométrie simplifiée à environ 200 m, assez fine pour un
 * histogramme à 100 m et légère à envoyer.
 */
export async function listCommunesForCropAreas(
  options: CursorOptions & { limit: number },
): Promise<CropAreaCommune[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id", c."code", z."code" AS zone_code,
           ST_Y(ST_Centroid(c."geom"::geometry)) AS latitude,
           ST_Area(c."geom") / 10000 AS area_ha,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(c."geom"::geometry, 0.002), 5) AS geometry
      FROM (${RANKED_COMMUNES}) c
      LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
      LEFT JOIN LATERAL (${lastComputation(options)}) last ON true
     WHERE ${isDue(options)}
     ORDER BY last.computed_at NULLS FIRST, c."code"
     LIMIT ${options.limit}`;
  return rows.map((row) => communeSchema.parse(row));
}

/** Communes encore à calculer : ce qui reste de la passe du mois. */
export async function countCommunesForCropAreas(options: CursorOptions): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
      FROM (${RANKED_COMMUNES}) c
      LEFT JOIN LATERAL (${lastComputation(options)}) last ON true
     WHERE ${isDue(options)}`;
  return Number(rows[0]?.count ?? 0);
}

export interface CropAreaRow {
  communeId: string;
  campaignId: string;
  cropClass: CropMapClassCode;
  areaHa: number;
  pixelShare: number;
  unclassifiedShare: number;
  resolutionM: number;
  windowFrom: Date;
  windowTo: Date;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC";
  /** Date du calcul : le curseur de la passe mensuelle. */
  computedAt: Date;
  methodVersion: number;
  /** Part de rizière vue par le radar, sur la ligne RICE seulement. */
  radarRiceShare?: number | null;
}

/** Communes dont la campagne a déjà une estimation mesurée (hors démonstration). */
export async function communesWithMeasuredCropAreas(campaignId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ commune_id: string }[]>`
    SELECT DISTINCT "commune_id"
      FROM "crop_area_estimate"
     WHERE "campaign_id" = ${campaignId}::uuid AND "source_id" <> 'BAIS_SEED'`;
  return new Set(rows.map((row) => row.commune_id));
}

/** Écrit les estimations d'une commune, une ligne par classe, en une requête. */
export async function upsertCropAreas(rows: readonly CropAreaRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.$executeRaw`
    INSERT INTO "crop_area_estimate" (
      "id", "commune_id", "campaign_id", "crop_class", "area_ha", "pixel_share",
      "unclassified_share", "resolution_m", "window_from", "window_to", "source_id",
      "reliability", "computed_at", "method_version", "radar_rice_share"
    )
    SELECT gen_random_uuid(), t.commune_id, t.campaign_id, t.crop_class::"CropMapClass",
           t.area_ha, t.pixel_share, t.unclassified_share, t.resolution_m, t.window_from,
           t.window_to, t.source_id, t.reliability::"Reliability", t.computed_at,
           t.method_version, t.radar_rice_share
      FROM unnest(
        ${rows.map((r) => r.communeId)}::uuid[],
        ${rows.map((r) => r.campaignId)}::uuid[],
        ${rows.map((r) => r.cropClass)}::text[],
        ${rows.map((r) => r.areaHa)}::numeric[],
        ${rows.map((r) => r.pixelShare)}::numeric[],
        ${rows.map((r) => r.unclassifiedShare)}::numeric[],
        ${rows.map((r) => r.resolutionM)}::int[],
        ${rows.map((r) => r.windowFrom)}::date[],
        ${rows.map((r) => r.windowTo)}::date[],
        ${rows.map((r) => r.sourceId)}::text[],
        ${rows.map((r) => r.reliability)}::text[],
        ${rows.map((r) => r.computedAt)}::timestamp[],
        ${rows.map((r) => r.methodVersion)}::int[],
        ${rows.map((r) => r.radarRiceShare ?? null)}::numeric[]
      ) AS t(commune_id, campaign_id, crop_class, area_ha, pixel_share, unclassified_share,
             resolution_m, window_from, window_to, source_id, reliability, computed_at,
             method_version, radar_rice_share)
    ON CONFLICT ("commune_id", "campaign_id", "crop_class") DO UPDATE SET
      "area_ha" = EXCLUDED."area_ha", "pixel_share" = EXCLUDED."pixel_share",
      "unclassified_share" = EXCLUDED."unclassified_share",
      "resolution_m" = EXCLUDED."resolution_m", "window_from" = EXCLUDED."window_from",
      "window_to" = EXCLUDED."window_to", "source_id" = EXCLUDED."source_id",
      "reliability" = EXCLUDED."reliability", "computed_at" = EXCLUDED."computed_at",
      "method_version" = EXCLUDED."method_version",
      "radar_rice_share" = EXCLUDED."radar_rice_share"`;
}

const declaredSchema = z.object({
  commune_id: z.string(),
  crop_code: z.string(),
  area_ha: z.coerce.number(),
});

/** Surfaces déclarées au registre pour la campagne, par commune et par culture. */
export async function declaredAreasByCrop(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."commune_id", c."code" AS crop_code, sum(pc."area_ha") AS area_ha
      FROM "parcel_crop" pc
      JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "crop" c ON c."id" = pc."crop_id"
     WHERE pc."campaign_id" = ${campaignId}::uuid AND pc."archived_at" IS NULL
     GROUP BY f."commune_id", c."code"`;
  return rows.map((row) => declaredSchema.parse(row));
}

const estimateSchema = z.object({
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  crop_class: z.string(),
  area_ha: z.coerce.number(),
  unclassified_share: z.coerce.number(),
  resolution_m: z.coerce.number(),
  radar_rice_share: z.coerce.number().nullable(),
  source_id: z.string(),
  computed_at: z.date(),
});

/** Estimations de la campagne, avec la commune et son département. */
export async function cropAreaEstimates(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT e."commune_id", c."code" AS commune_code, c."name" AS commune_name,
           d."code" AS departement_code, d."name" AS departement_name,
           e."crop_class"::text AS crop_class, e."area_ha", e."unclassified_share",
           e."resolution_m", e."radar_rice_share", e."source_id", e."computed_at"
      FROM "crop_area_estimate" e
      JOIN "commune" c ON c."id" = e."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
     WHERE e."campaign_id" = ${campaignId}::uuid`;
  return rows.map((row) => estimateSchema.parse(row));
}
