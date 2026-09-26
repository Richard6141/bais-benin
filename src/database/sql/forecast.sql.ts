import { z } from "zod";
import { prisma } from "@/database/client";

// Prévision des récoltes (ADR-0020). Deux lectures directes du registre :
// - rendements historiques des campagnes closes retenues, par culture, à trois niveaux (commune,
//   département, pays) grâce à GROUPING SETS, avec les quartiles des rendements par parcelle ;
// - surfaces semées par culture et commune, pour les campagnes demandées.
// Le rendement d'une parcelle est sa récolte déclarée rapportée à sa surface ; une culture de
// parcelle sans récolte déclarée n'entre pas dans le rendement mais sa surface compte dans la
// production prévue.

const num = z.coerce.number();

const yieldSchema = z.object({
  crop_code: z.string(),
  level: z.enum(["commune", "departement", "national"]),
  commune_id: z.string().nullable(),
  departement_code: z.string().nullable(),
  harvests: num,
  kg: num,
  area_ha: num,
  p25: num.nullable(),
  p75: num.nullable(),
});
export type YieldHistoryRow = z.infer<typeof yieldSchema>;

export async function readYieldHistory(campaignIds: readonly string[]): Promise<YieldHistoryRow[]> {
  if (campaignIds.length === 0) return [];
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH parcel_yield AS (
      SELECT cr."code" AS crop_code, f."commune_id", d."code" AS departement_code,
             pc."area_ha"::float8 AS area_ha, sum(pd."quantity_kg")::float8 AS kg
      FROM "parcel_crop" pc
      JOIN "production_declaration" pd ON pd."parcel_crop_id" = pc."id" AND pd."archived_at" IS NULL
      JOIN "crop" cr ON cr."id" = pc."crop_id"
      JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" c ON c."id" = f."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE pc."campaign_id" = ANY(${campaignIds as string[]}::uuid[]) AND pc."archived_at" IS NULL
        AND pc."area_ha" > 0
      GROUP BY pc."id", cr."code", f."commune_id", d."code", pc."area_ha"
    )
    SELECT crop_code,
           CASE WHEN GROUPING("commune_id") = 0 THEN 'commune'
                WHEN GROUPING(departement_code) = 0 THEN 'departement'
                ELSE 'national' END AS level,
           CASE WHEN GROUPING("commune_id") = 0 THEN "commune_id"::text END AS commune_id,
           CASE WHEN GROUPING(departement_code) = 0 THEN departement_code END AS departement_code,
           count(*) AS harvests, sum(kg) AS kg, sum(area_ha) AS area_ha,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY kg / area_ha) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY kg / area_ha) AS p75
    FROM parcel_yield
    GROUP BY GROUPING SETS ((crop_code, "commune_id", departement_code), (crop_code, departement_code), (crop_code))`;
  return rows.map((row) => yieldSchema.parse(row));
}

const areaSchema = z.object({
  campaign_code: z.string(),
  crop_code: z.string(),
  crop_name: z.string(),
  typical_yield_t_per_ha: num.nullable(),
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  parcels: num,
  area_ha: num,
});
export type SownAreaRow = z.infer<typeof areaSchema>;

export async function readSownAreas(campaignIds: readonly string[]): Promise<SownAreaRow[]> {
  if (campaignIds.length === 0) return [];
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT ac."code" AS campaign_code, cr."code" AS crop_code, cr."name_fr" AS crop_name,
           cr."typical_yield_t_per_ha", c."id"::text AS commune_id, c."code" AS commune_code,
           c."name" AS commune_name, d."code" AS departement_code, d."name" AS departement_name,
           count(*) AS parcels, sum(pc."area_ha")::float8 AS area_ha
    FROM "parcel_crop" pc
    JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
    JOIN "crop" cr ON cr."id" = pc."crop_id"
    JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    JOIN "commune" c ON c."id" = f."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE pc."campaign_id" = ANY(${campaignIds as string[]}::uuid[]) AND pc."archived_at" IS NULL
    GROUP BY ac."code", cr."code", cr."name_fr", cr."typical_yield_t_per_ha", c."id", c."code",
             c."name", d."code", d."name"`;
  return rows.map((row) => areaSchema.parse(row));
}

const vegetationSchema = z.object({
  crop_code: z.string(),
  checked: num,
  to_verify: num,
});
export type VegetationSignalRow = z.infer<typeof vegetationSchema>;

/** Verdicts satellite de la campagne, par culture : part des parcelles dont la végétation déçoit. */
export async function readVegetationSignal(campaignId: string): Promise<VegetationSignalRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT cr."code" AS crop_code,
           count(*) FILTER (WHERE v."status" IN ('CONSISTENT', 'TO_VERIFY')) AS checked,
           count(*) FILTER (WHERE v."status" = 'TO_VERIFY') AS to_verify
    FROM "parcel_vegetation_check" v
    JOIN "crop" cr ON cr."id" = v."crop_id"
    WHERE v."campaign_id" = ${campaignId}::uuid
    GROUP BY cr."code"`;
  return rows.map((row) => vegetationSchema.parse(row));
}
