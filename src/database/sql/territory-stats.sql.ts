import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Agrégats territoriaux du registre (carte et pilotage). Les filtres sont assemblés avec
// Prisma.sql : chaque valeur devient un paramètre lié, jamais une concaténation.
//
// Conventions :
// - une exploitation compte pour sa commune de rattachement, pas pour ses parcelles ;
// - « vérifiée » = statut AGENT_VERIFIED ou FIELD_VERIFIED ; DISPUTED et DECLARED ne le sont pas ;
// - les filtres cropCode et campaignCode retiennent les exploitations ayant au moins une parcelle
//   portant cette culture (dans cette campagne) ; crop_codes liste toutes les cultures des
//   exploitations retenues, restreintes à la campagne si elle est filtrée ;
// - tout est calculé en SQL et ramené à des nombres (COALESCE à 0), y compris sur tables vides.

export const VERIFICATION_STATUSES = [
  "DECLARED",
  "AGENT_VERIFIED",
  "FIELD_VERIFIED",
  "DISPUTED",
] as const;
export type VerificationStatusCode = (typeof VERIFICATION_STATUSES)[number];

export interface TerritoryStatsFilters {
  cropCode?: string;
  campaignCode?: string;
  departementCode?: string;
  verificationStatus?: VerificationStatusCode;
}

const communeStatsRowSchema = z.object({
  commune_code: z.string(),
  commune_name: z.string(),
  departement_code: z.string(),
  farm_count: z.number().int(),
  farmer_count: z.number().int(),
  declared_area_ha: z.number(),
  verified_share: z.number().min(0).max(1),
  crop_codes: z.array(z.string()),
});
export type CommuneStatsRow = z.infer<typeof communeStatsRowSchema>;

const departementStatsRowSchema = z.object({
  departement_code: z.string(),
  departement_name: z.string(),
  commune_count: z.number().int(),
  farm_count: z.number().int(),
  farmer_count: z.number().int(),
  declared_area_ha: z.number(),
  verified_share: z.number().min(0).max(1),
  crop_codes: z.array(z.string()),
});
export type DepartementStatsRow = z.infer<typeof departementStatsRowSchema>;

const nationalStatsRowSchema = z.object({
  farm_count: z.number().int(),
  farmer_count: z.number().int(),
  declared_area_ha: z.number(),
  verified_share: z.number().min(0).max(1),
  commune_count_with_farms: z.number().int(),
});
export type NationalStatsRow = z.infer<typeof nationalStatsRowSchema>;

/** Condition sur la campagne d'une culture de parcelle, ou rien. */
function campaignCondition(filters: TerritoryStatsFilters): Prisma.Sql {
  return filters.campaignCode ? Prisma.sql`AND ac."code" = ${filters.campaignCode}` : Prisma.empty;
}

/** Sous-requête EXISTS qui retient une exploitation selon la culture et la campagne. */
function cropExistsCondition(filters: TerritoryStatsFilters): Prisma.Sql {
  if (!filters.cropCode && !filters.campaignCode) return Prisma.empty;
  const cropCondition = filters.cropCode
    ? Prisma.sql`AND cr."code" = ${filters.cropCode}`
    : Prisma.empty;
  return Prisma.sql`AND EXISTS (
    SELECT 1
    FROM "parcel" p
    JOIN "parcel_crop" pc ON pc."parcel_id" = p."id" AND pc."archived_at" IS NULL
    JOIN "crop" cr ON cr."id" = pc."crop_id"
    JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
    WHERE p."farm_id" = f."id" AND p."archived_at" IS NULL
      ${cropCondition}
      ${campaignCondition(filters)}
  )`;
}

/**
 * CTE commune aux trois agrégats : `farms` = exploitations retenues par les filtres,
 * `farm_crops` = couples (exploitation, code de culture) pour la liste des cultures.
 */
function filteredFarmsCte(filters: TerritoryStatsFilters): Prisma.Sql {
  const departementCondition = filters.departementCode
    ? Prisma.sql`AND d."code" = ${filters.departementCode}`
    : Prisma.empty;
  const statusCondition = filters.verificationStatus
    ? Prisma.sql`AND f."verification_status" = ${filters.verificationStatus}::"VerificationStatus"`
    : Prisma.empty;
  return Prisma.sql`
    farms AS (
      SELECT f."id", f."farmer_id", f."commune_id", c."departement_id",
             f."declared_area_ha", f."verification_status"
      FROM "farm" f
      JOIN "commune" c ON c."id" = f."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE f."archived_at" IS NULL
        ${departementCondition}
        ${statusCondition}
        ${cropExistsCondition(filters)}
    ),
    farm_crops AS (
      SELECT DISTINCT p."farm_id", cr."code" AS crop_code
      FROM "parcel" p
      JOIN farms fa ON fa."id" = p."farm_id"
      JOIN "parcel_crop" pc ON pc."parcel_id" = p."id" AND pc."archived_at" IS NULL
      JOIN "crop" cr ON cr."id" = pc."crop_id"
      JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
      WHERE p."archived_at" IS NULL
        ${campaignCondition(filters)}
    )`;
}

const verifiedShareExpression = Prisma.sql`
  CASE WHEN COUNT(fa."id") = 0 THEN 0::float8
       ELSE (COUNT(fa."id") FILTER (WHERE fa."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')))::float8
            / COUNT(fa."id")::float8
  END`;

export async function communeStats(
  filters: TerritoryStatsFilters = {},
): Promise<CommuneStatsRow[]> {
  const departementCondition = filters.departementCode
    ? Prisma.sql`AND d."code" = ${filters.departementCode}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH ${filteredFarmsCte(filters)}
    SELECT
      c."code" AS commune_code,
      c."name" AS commune_name,
      d."code" AS departement_code,
      COUNT(fa."id")::int AS farm_count,
      COUNT(DISTINCT fa."farmer_id")::int AS farmer_count,
      COALESCE(SUM(fa."declared_area_ha"), 0)::float8 AS declared_area_ha,
      ${verifiedShareExpression} AS verified_share,
      COALESCE(
        (SELECT array_agg(DISTINCT fc.crop_code ORDER BY fc.crop_code)
         FROM farm_crops fc
         JOIN farms f2 ON f2."id" = fc."farm_id"
         WHERE f2."commune_id" = c."id"),
        ARRAY[]::text[]
      ) AS crop_codes
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN farms fa ON fa."commune_id" = c."id"
    WHERE c."archived_at" IS NULL
      ${departementCondition}
    GROUP BY c."id", c."code", c."name", d."code"
    ORDER BY c."code"`;
  return rows.map((row) => communeStatsRowSchema.parse(row));
}

export async function departementStats(
  filters: TerritoryStatsFilters = {},
): Promise<DepartementStatsRow[]> {
  const departementCondition = filters.departementCode
    ? Prisma.sql`AND d."code" = ${filters.departementCode}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH ${filteredFarmsCte(filters)}
    SELECT
      d."code" AS departement_code,
      d."name" AS departement_name,
      (SELECT COUNT(*)::int FROM "commune" c2
        WHERE c2."departement_id" = d."id" AND c2."archived_at" IS NULL) AS commune_count,
      COUNT(fa."id")::int AS farm_count,
      COUNT(DISTINCT fa."farmer_id")::int AS farmer_count,
      COALESCE(SUM(fa."declared_area_ha"), 0)::float8 AS declared_area_ha,
      ${verifiedShareExpression} AS verified_share,
      COALESCE(
        (SELECT array_agg(DISTINCT fc.crop_code ORDER BY fc.crop_code)
         FROM farm_crops fc
         JOIN farms f2 ON f2."id" = fc."farm_id"
         WHERE f2."departement_id" = d."id"),
        ARRAY[]::text[]
      ) AS crop_codes
    FROM "departement" d
    LEFT JOIN farms fa ON fa."departement_id" = d."id"
    WHERE d."archived_at" IS NULL
      ${departementCondition}
    GROUP BY d."id", d."code", d."name"
    ORDER BY d."code"`;
  return rows.map((row) => departementStatsRowSchema.parse(row));
}

export async function nationalStats(
  filters: TerritoryStatsFilters = {},
): Promise<NationalStatsRow> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH ${filteredFarmsCte(filters)}
    SELECT
      COUNT(fa."id")::int AS farm_count,
      COUNT(DISTINCT fa."farmer_id")::int AS farmer_count,
      COALESCE(SUM(fa."declared_area_ha"), 0)::float8 AS declared_area_ha,
      ${verifiedShareExpression} AS verified_share,
      COUNT(DISTINCT fa."commune_id")::int AS commune_count_with_farms
    FROM farms fa`;
  return nationalStatsRowSchema.parse(rows[0] ?? {});
}
