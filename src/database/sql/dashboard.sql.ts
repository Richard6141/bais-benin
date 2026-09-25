import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";
import type { VerificationStatusCode } from "./territory-stats.sql";

// Lectures du tableau de bord national sur les vues matérialisées (migration analytics_views)
// et, pour les comptes de producteurs, en direct. Grain commune : les départements et le pays
// sont agrégés par le module. Filtres assemblés avec Prisma.sql, valeurs liées.

export interface DashboardSqlFilters {
  cropCode?: string;
  departementCode?: string;
  communeCode?: string;
  verificationStatus?: VerificationStatusCode;
  /** Périmètre de l'acteur : null = tout le territoire. */
  communeIds: readonly string[] | null;
}

const num = z.coerce.number();

function territoryConditions(filters: DashboardSqlFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.departementCode) parts.push(Prisma.sql`AND d."code" = ${filters.departementCode}`);
  if (filters.communeCode) parts.push(Prisma.sql`AND c."code" = ${filters.communeCode}`);
  if (filters.communeIds) {
    parts.push(Prisma.sql`AND c."id" = ANY(${filters.communeIds as string[]}::uuid[])`);
  }
  return parts.length > 0 ? Prisma.join(parts, " ") : Prisma.empty;
}

function statusCondition(alias: string, filters: DashboardSqlFilters): Prisma.Sql {
  return filters.verificationStatus
    ? Prisma.sql`AND ${Prisma.raw(alias)}."verification_status" = ${filters.verificationStatus}::"VerificationStatus"`
    : Prisma.empty;
}

const campaignSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: z.enum(["PLANNED", "OPEN", "CLOSED"]),
  start_year: num,
  starts_on: z.string(),
  ends_on: z.string(),
});
export type CampaignRow = z.infer<typeof campaignSchema>;

export async function readCampaigns(): Promise<CampaignRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT "id", "code", "status"::text AS status, "start_year",
           to_char("starts_on", 'YYYY-MM-DD') AS starts_on, to_char("ends_on", 'YYYY-MM-DD') AS ends_on
    FROM "agricultural_campaign" WHERE "archived_at" IS NULL ORDER BY "start_year"`;
  return rows.map((row) => campaignSchema.parse(row));
}

const cropStatsSchema = z.object({
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_code: z.string(),
  campaign_id: z.string(),
  crop_code: z.string(),
  crop_name: z.string(),
  color_hex: z.string().nullable(),
  typical_yield_t_per_ha: num.nullable(),
  farm_count: num,
  verified_farm_count: num,
  parcel_count: num,
  measured_parcel_count: num,
  area_ha: num,
  measured_area_ha: num,
  harvested_area_ha: num,
  production_kg: num,
  declared_harvest_count: num,
  refreshed_at: z.coerce.date(),
});
export type CropStatsRow = z.infer<typeof cropStatsSchema>;

// Commune × campagne × culture, statuts additionnés (ou filtrés). Au plus 77 × 21 lignes par
// campagne : les agrégats supérieurs se font en mémoire.
export async function readCropStats(
  campaignIds: readonly string[],
  filters: DashboardSqlFilters,
): Promise<CropStatsRow[]> {
  if (campaignIds.length === 0) return [];
  const cropCondition = filters.cropCode
    ? Prisma.sql`AND cr."code" = ${filters.cropCode}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id" AS commune_id, c."code" AS commune_code, c."name" AS commune_name,
           d."code" AS departement_code, m."campaign_id", cr."code" AS crop_code,
           cr."name_fr" AS crop_name, cr."color_hex", cr."typical_yield_t_per_ha",
           sum(m."farm_count")::int AS farm_count,
           coalesce(sum(m."farm_count") FILTER (
             WHERE m."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')), 0)::int
             AS verified_farm_count,
           sum(m."parcel_count")::int AS parcel_count,
           sum(m."measured_parcel_count")::int AS measured_parcel_count,
           sum(m."area_ha") AS area_ha, sum(m."measured_area_ha") AS measured_area_ha,
           sum(m."harvested_area_ha") AS harvested_area_ha, sum(m."production_kg") AS production_kg,
           sum(m."declared_harvest_count")::int AS declared_harvest_count,
           min(m."refreshed_at") AS refreshed_at
    FROM "mv_crop_stats_by_commune" m
    JOIN "commune" c ON c."id" = m."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    JOIN "crop" cr ON cr."id" = m."crop_id"
    WHERE m."campaign_id" = ANY(${campaignIds as string[]}::uuid[])
      ${cropCondition}
      ${territoryConditions(filters)}
      ${statusCondition("m", filters)}
    GROUP BY c."id", c."code", c."name", d."code", m."campaign_id", cr."code", cr."name_fr",
             cr."color_hex", cr."typical_yield_t_per_ha"`;
  return rows.map((row) => cropStatsSchema.parse(row));
}

const farmStatsSchema = z.object({
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  zone_code: z.string().nullable(),
  farm_count: num,
  verified_farm_count: num,
  declared_area_ha: num,
  parcel_count: num,
  measured_parcel_count: num,
  measured_area_ha: num,
  refreshed_at: z.coerce.date().nullable(),
});
export type FarmStatsRow = z.infer<typeof farmStatsSchema>;

// Toutes les communes du périmètre, y compris celles sans exploitation (ligne à zéro).
export async function readFarmStats(filters: DashboardSqlFilters): Promise<FarmStatsRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id" AS commune_id, c."code" AS commune_code, c."name" AS commune_name,
           d."code" AS departement_code, d."name" AS departement_name, z."code" AS zone_code,
           coalesce(sum(m."farm_count"), 0)::int AS farm_count,
           coalesce(sum(m."farm_count") FILTER (
             WHERE m."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')), 0)::int
             AS verified_farm_count,
           coalesce(sum(m."declared_area_ha"), 0) AS declared_area_ha,
           coalesce(sum(m."parcel_count"), 0)::int AS parcel_count,
           coalesce(sum(m."measured_parcel_count"), 0)::int AS measured_parcel_count,
           coalesce(sum(m."measured_area_ha"), 0) AS measured_area_ha,
           min(m."refreshed_at") AS refreshed_at
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
    LEFT JOIN "mv_farm_stats_by_commune" m ON m."commune_id" = c."id" ${statusCondition("m", filters)}
    WHERE c."archived_at" IS NULL
      ${territoryConditions(filters)}
    GROUP BY c."id", c."code", c."name", d."code", d."name", z."code"
    ORDER BY c."code"`;
  return rows.map((row) => farmStatsSchema.parse(row));
}

const farmerCountSchema = z.object({ key: z.string(), farmer_count: num });

// Producteurs distincts titulaires d'au moins une exploitation active retenue par les filtres,
// par commune, par département ou au total (clé « total »). Compte direct : un producteur n'est
// compté qu'une fois même s'il a des exploitations dans plusieurs communes du groupe.
export async function countFarmers(
  groupBy: "commune" | "departement" | "total",
  filters: DashboardSqlFilters & { campaignId?: string },
): Promise<Map<string, number>> {
  const key =
    groupBy === "commune"
      ? Prisma.sql`c."code"`
      : groupBy === "departement"
        ? Prisma.sql`d."code"`
        : Prisma.sql`'total'`;
  const cropCondition =
    filters.cropCode && filters.campaignId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "parcel" p
          JOIN "parcel_crop" pc ON pc."parcel_id" = p."id" AND pc."archived_at" IS NULL
          JOIN "crop" cr ON cr."id" = pc."crop_id"
          WHERE p."farm_id" = f."id" AND p."archived_at" IS NULL
            AND cr."code" = ${filters.cropCode} AND pc."campaign_id" = ${filters.campaignId}::uuid)`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT ${key} AS key, count(DISTINCT f."farmer_id")::int AS farmer_count
    FROM "farm" f
    JOIN "commune" c ON c."id" = f."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE f."archived_at" IS NULL
      ${territoryConditions(filters)}
      ${statusCondition("f", filters)}
      ${cropCondition}
    GROUP BY 1`;
  return new Map(
    rows.map((row) => farmerCountSchema.parse(row)).map((r) => [r.key, r.farmer_count]),
  );
}

const syntheticSchema = z.object({ synthetic: z.boolean() });

/** Vrai quand plus de la moitié des exploitations actives sont synthétiques (démonstration). */
export async function registryIsSynthetic(): Promise<boolean> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT coalesce(count(*) FILTER (WHERE "reliability" = 'SYNTHETIC') * 2 > count(*), false)
             AS synthetic
    FROM "farm" WHERE "archived_at" IS NULL`;
  return syntheticSchema.parse(rows[0] ?? { synthetic: false }).synthetic;
}

const communeInfoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  zone_code: z.string().nullable(),
  zone_name: z.string().nullable(),
  rural_population: num.nullable(),
  area_km2: num.nullable(),
});
export type CommuneInfoRow = z.infer<typeof communeInfoSchema>;

export async function readCommuneInfo(code: string): Promise<CommuneInfoRow | null> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id", c."code", c."name", d."code" AS departement_code, d."name" AS departement_name,
           z."code" AS zone_code, z."name" AS zone_name,
           c."rural_population_estimate" AS rural_population, c."area_km2"
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
    WHERE c."code" = ${code} AND c."archived_at" IS NULL`;
  return rows[0] ? communeInfoSchema.parse(rows[0]) : null;
}
