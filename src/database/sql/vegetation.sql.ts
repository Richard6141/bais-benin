import { z } from "zod";
import { prisma } from "@/database/client";

// Confrontation déclaration / satellite (ADR-0016) : parcelles à examiner, verdicts, synthèses.

const candidateSchema = z.object({
  parcel_id: z.string(),
  parcel_code: z.string(),
  farm_id: z.string(),
  sub_season: z.enum(["MAIN_RAINY", "SHORT_RAINY", "DRY", "ANNUAL"]),
  crop_id: z.string(),
  crop_code: z.string(),
  crop_category: z.enum([
    "CEREAL",
    "ROOT_TUBER",
    "LEGUME",
    "CASH_CROP",
    "VEGETABLE",
    "FRUIT",
    "OILSEED",
  ]),
  crop_cycle: z.enum(["ANNUAL", "PERENNIAL", "GATHERED"]),
  crop_calendar: z.unknown(),
  zone_code: z.string().nullable(),
  rainfall_regime: z.enum(["BIMODAL", "UNIMODAL"]).nullable(),
  geometry: z.string(),
});

export type VegetationCandidate = z.infer<typeof candidateSchema>;

/**
 * Parcelles relevées à examiner pour une campagne : culture principale (la plus grande surface)
 * par parcelle et sous-saison, hors contre-saison. D'abord celles jamais examinées, puis celles
 * restées en attente ou sans données assez longtemps pour mériter un nouvel essai ; les
 * exploitations enregistrées par un agent passent devant, pour que les agents aient leurs
 * signalements en premier.
 */
export async function listVegetationCandidates(options: {
  campaignId: string;
  retryBefore: Date;
  limit: number;
}): Promise<VegetationCandidate[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH main_crop AS (
      SELECT DISTINCT ON (pc."parcel_id", pc."sub_season")
             pc."parcel_id", pc."sub_season", pc."crop_id"
        FROM "parcel_crop" pc
       WHERE pc."campaign_id" = ${options.campaignId}::uuid
         AND pc."archived_at" IS NULL
         AND pc."sub_season" <> 'DRY'
       ORDER BY pc."parcel_id", pc."sub_season", pc."area_ha" DESC, pc."id"
    )
    SELECT p."id" AS parcel_id, p."code" AS parcel_code, p."farm_id",
           mc."sub_season"::text AS sub_season, c."id" AS crop_id, c."code" AS crop_code,
           c."category"::text AS crop_category, c."cycle"::text AS crop_cycle,
           c."calendar" AS crop_calendar, z."code" AS zone_code,
           z."rainfall_regime"::text AS rainfall_regime,
           ST_AsGeoJSON(p."geom"::geometry, 6) AS geometry
      FROM main_crop mc
      JOIN "parcel" p ON p."id" = mc."parcel_id"
      JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "commune" co ON co."id" = f."commune_id"
      LEFT JOIN "agro_ecological_zone" z ON z."id" = co."agro_ecological_zone_id"
      JOIN "crop" c ON c."id" = mc."crop_id"
      LEFT JOIN "parcel_vegetation_check" v
             ON v."parcel_id" = p."id" AND v."campaign_id" = ${options.campaignId}::uuid
            AND v."sub_season" = mc."sub_season"
     WHERE p."archived_at" IS NULL AND f."archived_at" IS NULL AND p."geom" IS NOT NULL
       AND (v."id" IS NULL
            OR (v."status" IN ('PENDING', 'INSUFFICIENT_DATA')
                AND v."computed_at" < ${options.retryBefore}))
     ORDER BY (v."id" IS NULL) DESC, (f."registered_by_id" IS NOT NULL) DESC, p."id"
     LIMIT ${options.limit}`;
  return rows.map((row) => candidateSchema.parse(row));
}

export interface VegetationCheckRow {
  parcelId: string;
  campaignId: string;
  subSeason: string;
  cropId: string;
  status: "CONSISTENT" | "TO_VERIFY" | "INSUFFICIENT_DATA" | "PENDING";
  reason: string | null;
  peakNdvi: number | null;
  baseNdvi: number | null;
  expectedNdvi: number;
  validIntervals: number;
  windowFrom: Date;
  windowTo: Date;
  series: unknown;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC";
}

export async function upsertVegetationCheck(row: VegetationCheckRow): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "parcel_vegetation_check" (
      "id", "parcel_id", "campaign_id", "sub_season", "crop_id", "status", "reason", "peak_ndvi",
      "base_ndvi", "expected_ndvi", "valid_intervals", "window_from", "window_to", "series",
      "source_id", "reliability", "computed_at"
    ) VALUES (
      gen_random_uuid(), ${row.parcelId}::uuid, ${row.campaignId}::uuid,
      ${row.subSeason}::"SubSeason", ${row.cropId}::uuid, ${row.status}::"VegetationCheckStatus",
      ${row.reason}, ${row.peakNdvi}, ${row.baseNdvi}, ${row.expectedNdvi}, ${row.validIntervals},
      ${row.windowFrom}::date, ${row.windowTo}::date, ${JSON.stringify(row.series)}::jsonb,
      ${row.sourceId}, ${row.reliability}::"Reliability", now()
    )
    ON CONFLICT ("parcel_id", "campaign_id", "sub_season") DO UPDATE SET
      "crop_id" = EXCLUDED."crop_id", "status" = EXCLUDED."status", "reason" = EXCLUDED."reason",
      "peak_ndvi" = EXCLUDED."peak_ndvi", "base_ndvi" = EXCLUDED."base_ndvi",
      "expected_ndvi" = EXCLUDED."expected_ndvi", "valid_intervals" = EXCLUDED."valid_intervals",
      "window_from" = EXCLUDED."window_from", "window_to" = EXCLUDED."window_to",
      "series" = EXCLUDED."series", "source_id" = EXCLUDED."source_id",
      "reliability" = EXCLUDED."reliability", "computed_at" = now()`;
}

const summarySchema = z.object({
  status: z.enum(["CONSISTENT", "TO_VERIFY", "INSUFFICIENT_DATA", "PENDING"]),
  count: z.number(),
});

const communeSchema = z.object({
  code: z.string(),
  name: z.string(),
  checked: z.number(),
  to_verify: z.number(),
});

const flaggedSchema = z.object({
  parcel_code: z.string(),
  farm_code: z.string(),
  commune_name: z.string(),
  crop_name: z.string(),
  sub_season: z.string(),
  reason: z.string().nullable(),
  peak_ndvi: z.coerce.number().nullable(),
  expected_ndvi: z.coerce.number(),
  source_id: z.string(),
  computed_at: z.date(),
});

export type FlaggedParcelRow = z.infer<typeof flaggedSchema>;

/** Synthèse nationale ou départementale d'une campagne, en comptes et en codes seulement. */
export async function vegetationSummary(options: {
  campaignId: string;
  departementCode?: string;
  flaggedLimit: number;
}) {
  const departement = options.departementCode ?? null;
  const [statusRows, communeRows, flaggedRows, sourceRows] = await Promise.all([
    prisma.$queryRaw<unknown[]>`
      SELECT v."status"::text AS status, count(*)::int AS count
        FROM "parcel_vegetation_check" v
        JOIN "parcel" p ON p."id" = v."parcel_id"
        JOIN "farm" f ON f."id" = p."farm_id"
        JOIN "commune" co ON co."id" = f."commune_id"
        JOIN "departement" d ON d."id" = co."departement_id"
       WHERE v."campaign_id" = ${options.campaignId}::uuid
         AND (${departement}::text IS NULL OR d."code" = ${departement})
       GROUP BY 1`,
    prisma.$queryRaw<unknown[]>`
      SELECT co."code", co."name",
             count(*) FILTER (WHERE v."status" IN ('CONSISTENT', 'TO_VERIFY'))::int AS checked,
             count(*) FILTER (WHERE v."status" = 'TO_VERIFY')::int AS to_verify
        FROM "parcel_vegetation_check" v
        JOIN "parcel" p ON p."id" = v."parcel_id"
        JOIN "farm" f ON f."id" = p."farm_id"
        JOIN "commune" co ON co."id" = f."commune_id"
        JOIN "departement" d ON d."id" = co."departement_id"
       WHERE v."campaign_id" = ${options.campaignId}::uuid
         AND (${departement}::text IS NULL OR d."code" = ${departement})
       GROUP BY co."code", co."name"
      HAVING count(*) FILTER (WHERE v."status" = 'TO_VERIFY') > 0
       ORDER BY to_verify DESC, co."name"
       LIMIT 15`,
    prisma.$queryRaw<unknown[]>`
      SELECT p."code" AS parcel_code, f."code" AS farm_code, co."name" AS commune_name,
             c."name_fr" AS crop_name, v."sub_season"::text AS sub_season, v."reason",
             v."peak_ndvi", v."expected_ndvi", v."source_id", v."computed_at"
        FROM "parcel_vegetation_check" v
        JOIN "parcel" p ON p."id" = v."parcel_id"
        JOIN "farm" f ON f."id" = p."farm_id"
        JOIN "commune" co ON co."id" = f."commune_id"
        JOIN "departement" d ON d."id" = co."departement_id"
        JOIN "crop" c ON c."id" = v."crop_id"
       WHERE v."campaign_id" = ${options.campaignId}::uuid AND v."status" = 'TO_VERIFY'
         AND (${departement}::text IS NULL OR d."code" = ${departement})
       ORDER BY (v."expected_ndvi" - coalesce(v."peak_ndvi", 0)) DESC, p."code"
       LIMIT ${options.flaggedLimit}`,
    prisma.$queryRaw<{ source_id: string; last: Date }[]>`
      SELECT v."source_id", max(v."computed_at") AS last
        FROM "parcel_vegetation_check" v
       WHERE v."campaign_id" = ${options.campaignId}::uuid
       GROUP BY 1`,
  ]);
  return {
    byStatus: statusRows.map((row) => summarySchema.parse(row)),
    communes: communeRows.map((row) => communeSchema.parse(row)),
    flagged: flaggedRows.map((row) => flaggedSchema.parse(row)),
    sources: sourceRows.map((row) => ({ sourceId: row.source_id, lastComputedAt: row.last })),
  };
}

const parcelCheckSchema = z.object({
  parcel_id: z.string(),
  campaign_code: z.string(),
  sub_season: z.string(),
  crop_name: z.string(),
  status: z.enum(["CONSISTENT", "TO_VERIFY", "INSUFFICIENT_DATA", "PENDING"]),
  reason: z.string().nullable(),
  peak_ndvi: z.coerce.number().nullable(),
  expected_ndvi: z.coerce.number(),
  source_id: z.string(),
  computed_at: z.date(),
});

export type ParcelCheckRow = z.infer<typeof parcelCheckSchema>;

/** Verdicts des parcelles d'exploitations données, dernière campagne d'abord. */
export async function vegetationChecksForFarms(
  farmIds: readonly string[],
): Promise<(ParcelCheckRow & { farm_id: string })[]> {
  if (farmIds.length === 0) return [];
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT p."farm_id", v."parcel_id", ca."code" AS campaign_code, v."sub_season"::text AS sub_season,
           c."name_fr" AS crop_name, v."status"::text AS status, v."reason", v."peak_ndvi",
           v."expected_ndvi", v."source_id", v."computed_at"
      FROM "parcel_vegetation_check" v
      JOIN "parcel" p ON p."id" = v."parcel_id"
      JOIN "agricultural_campaign" ca ON ca."id" = v."campaign_id"
      JOIN "crop" c ON c."id" = v."crop_id"
     WHERE p."farm_id" = ANY(${[...farmIds]}::uuid[]) AND p."archived_at" IS NULL
     ORDER BY ca."start_year" DESC, v."sub_season"`;
  return rows.map((row) => ({
    ...parcelCheckSchema.parse(row),
    farm_id: z.string().parse((row as { farm_id: unknown }).farm_id),
  }));
}

/** Portée de lecture traduite par l'appelant (module satellite, depuis scopeFilter). */
export interface FarmScopeParams {
  all?: boolean;
  registeredBy?: string;
  ownerUserId?: string;
  communeIds?: string[];
  departementIds?: string[];
}

const flaggedFarmSchema = z.object({
  farm_id: z.string(),
  farm_code: z.string(),
  commune_name: z.string(),
  village: z.string().nullable(),
  flagged_parcels: z.number(),
  crop_names: z.array(z.string()),
});

export type FlaggedFarmRow = z.infer<typeof flaggedFarmSchema>;

/** Exploitations de la portée dont au moins une parcelle est à vérifier (campagne ouverte). */
export async function flaggedFarmsInScope(
  scope: FarmScopeParams,
  limit: number,
): Promise<FlaggedFarmRow[]> {
  const all = scope.all === true;
  const registeredBy = scope.registeredBy ?? null;
  const ownerUserId = scope.ownerUserId ?? null;
  const communeIds = scope.communeIds ?? [];
  const departementIds = scope.departementIds ?? [];
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."id" AS farm_id, f."code" AS farm_code, co."name" AS commune_name, f."village",
           count(DISTINCT v."parcel_id")::int AS flagged_parcels,
           array_agg(DISTINCT c."name_fr") AS crop_names
      FROM "parcel_vegetation_check" v
      JOIN "agricultural_campaign" ca ON ca."id" = v."campaign_id" AND ca."status" = 'OPEN'
      JOIN "parcel" p ON p."id" = v."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "farmer" fa ON fa."id" = f."farmer_id"
      JOIN "commune" co ON co."id" = f."commune_id"
      JOIN "crop" c ON c."id" = v."crop_id"
     WHERE v."status" = 'TO_VERIFY'
       AND (${all}
            OR f."registered_by_id" = ${registeredBy}::uuid
            OR fa."user_id" = ${ownerUserId}::uuid
            OR f."commune_id" = ANY(${communeIds}::uuid[])
            OR co."departement_id" = ANY(${departementIds}::uuid[]))
     GROUP BY f."id", f."code", co."name", f."village"
     ORDER BY flagged_parcels DESC, f."code"
     LIMIT ${limit}`;
  return rows.map((row) => flaggedFarmSchema.parse(row));
}
