import { z } from "zod";
import { prisma } from "@/database/client";

// État des cultures de la campagne, vu du satellite : pour chaque parcelle dont la saison est
// jugée, le NDVI maximal comparé à la médiane des parcelles de la même culture dans la même zone
// agro-écologique (le nord sahélien ne se compare pas au sud humide). Au moins MIN_REFERENCE
// parcelles pour une médiane de zone, sinon médiane nationale de la culture. Le NDVI plafonne vers
// 0,8 : l'écart se lit en valeur absolue (CONDITION_MARGIN), pas en pourcentage. Une saison en
// cours ou cachée par les nuages n'est pas jugée. Agrégé par culture et département.

export const CONDITION_MARGIN = 0.04;
const MIN_REFERENCE = 10;

const num = z.coerce.number();

const rowSchema = z.object({
  crop_code: z.string(),
  crop_name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  condition: z.enum(["GOOD", "FAIR", "POOR", "TO_VERIFY", "UNOBSERVED"]),
  parcels: num,
  area_ha: num,
});
export type CropConditionRow = z.infer<typeof rowSchema>;

/** Vrai si des verdicts de démonstration (séries synthétiques) entrent dans la campagne. */
export async function readConditionIsDemo(campaignId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ demo: boolean | null }[]>`
    SELECT bool_or("source_id" = 'BAIS_SEED') AS demo
    FROM "parcel_vegetation_check" WHERE "campaign_id" = ${campaignId}::uuid`;
  return rows[0]?.demo === true;
}

export async function readCropCondition(campaignId: string): Promise<CropConditionRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH latest AS (
      SELECT DISTINCT ON (v."parcel_id", v."crop_id")
             v."parcel_id", v."crop_id", v."campaign_id", v."sub_season", v."status"::text AS status,
             v."peak_ndvi"::float8 AS peak
      FROM "parcel_vegetation_check" v
      WHERE v."campaign_id" = ${campaignId}::uuid
      ORDER BY v."parcel_id", v."crop_id", v."computed_at" DESC
    ),
    observed AS (
      SELECT cr."code" AS crop_code, cr."name_fr" AS crop_name, d."code" AS departement_code,
             d."name" AS departement_name, c."agro_ecological_zone_id" AS zone_id, l.status, l.peak,
             COALESCE(pc."area_ha", p."declared_area_ha")::float8 AS area_ha
      FROM latest l
      JOIN "parcel" p ON p."id" = l."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" c ON c."id" = f."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      JOIN "crop" cr ON cr."id" = l."crop_id"
      LEFT JOIN "parcel_crop" pc ON pc."parcel_id" = l."parcel_id" AND pc."crop_id" = l."crop_id"
        AND pc."campaign_id" = l."campaign_id" AND pc."sub_season" = l."sub_season"
        AND pc."archived_at" IS NULL
    ),
    measured AS (
      SELECT * FROM observed WHERE peak IS NOT NULL AND status = 'CONSISTENT'
    ),
    zone_ref AS (
      SELECT crop_code, zone_id, count(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY peak) AS median_peak
      FROM measured WHERE zone_id IS NOT NULL GROUP BY crop_code, zone_id
    ),
    crop_ref AS (
      SELECT crop_code, percentile_cont(0.5) WITHIN GROUP (ORDER BY peak) AS median_peak
      FROM measured GROUP BY crop_code
    ),
    judged AS (
      SELECT o.*, CASE
               WHEN o.status = 'TO_VERIFY' THEN 'TO_VERIFY'
               WHEN o.status <> 'CONSISTENT' OR o.peak IS NULL OR ref.median_peak IS NULL
                 THEN 'UNOBSERVED'
               WHEN o.peak >= ref.median_peak + ${CONDITION_MARGIN}::float8 THEN 'GOOD'
               WHEN o.peak > ref.median_peak - ${CONDITION_MARGIN}::float8 THEN 'FAIR'
               ELSE 'POOR' END AS condition
      FROM observed o
      LEFT JOIN zone_ref z ON z.crop_code = o.crop_code AND z.zone_id = o.zone_id
                          AND z.n >= ${MIN_REFERENCE}::int
      LEFT JOIN crop_ref cref ON cref.crop_code = o.crop_code
      CROSS JOIN LATERAL (SELECT COALESCE(z.median_peak, cref.median_peak) AS median_peak) ref
    )
    SELECT crop_code, crop_name, departement_code, departement_name, condition,
           count(*) AS parcels, sum(area_ha) AS area_ha
    FROM judged
    GROUP BY crop_code, crop_name, departement_code, departement_name, condition`;
  return rows.map((row) => rowSchema.parse(row));
}
