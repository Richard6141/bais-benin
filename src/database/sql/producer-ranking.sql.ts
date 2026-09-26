import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Palmarès des producteurs (ADR-0018) : lecture directe du registre, grain producteur. Une
// culture dans une campagne ; la surface d'une culture de parcelle compte une fois même si la
// récolte a été déclarée en plusieurs fois. Rang calculé en SQL, égalités départagées par le code
// du producteur pour un résultat stable d'une consultation à l'autre.

export type RankingMetric = "production" | "yield";

export interface ProducerRankingSqlFilters {
  cropCode: string;
  campaignCode: string;
  departementCode?: string;
  communeCode?: string;
  metric: RankingMetric;
  verifiedOnly: boolean;
  /** Surface minimale (ha) pour classer au rendement : une micro-parcelle fausse le rendement. */
  minAreaHa: number;
  limit: number;
  /**
   * Palmarès public : seulement les producteurs qui ont donné leur accord, pris dans l'ordre du
   * classement complet (leur rang reste celui de ce classement).
   */
  consentingOnly?: boolean;
}

const num = z.coerce.number();

const rowSchema = z.object({
  rank: num,
  eligible_count: num,
  farmer_id: z.string(),
  farmer_code: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_name: z.string(),
  farm_count: num,
  area_ha: num,
  production_kg: num,
  all_verified: z.boolean(),
  public_consent: z.boolean(),
});
export type ProducerRankingSqlRow = z.infer<typeof rowSchema>;

export async function readProducerRanking(
  filters: ProducerRankingSqlFilters,
): Promise<ProducerRankingSqlRow[]> {
  const territory: Prisma.Sql[] = [];
  if (filters.departementCode)
    territory.push(Prisma.sql`AND d."code" = ${filters.departementCode}`);
  if (filters.communeCode) territory.push(Prisma.sql`AND c."code" = ${filters.communeCode}`);
  const verified = filters.verifiedOnly
    ? Prisma.sql`AND f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')`
    : Prisma.empty;
  const metric =
    filters.metric === "yield"
      ? Prisma.sql`production_kg / NULLIF(area_ha, 0)`
      : Prisma.sql`production_kg`;
  const eligibility =
    filters.metric === "yield" ? Prisma.sql`WHERE area_ha >= ${filters.minAreaHa}` : Prisma.empty;

  const rows = await prisma.$queryRaw<unknown[]>`
    WITH per_crop AS (
      SELECT pc."id", f."farmer_id", f."id" AS farm_id, f."commune_id",
             f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED') AS verified,
             pc."area_ha", sum(pd."quantity_kg") AS kg
      FROM "production_declaration" pd
      JOIN "parcel_crop" pc ON pc."id" = pd."parcel_crop_id" AND pc."archived_at" IS NULL
      JOIN "crop" cr ON cr."id" = pc."crop_id"
      JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
      JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" c ON c."id" = f."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE pd."archived_at" IS NULL AND cr."code" = ${filters.cropCode}
        AND ac."code" = ${filters.campaignCode}
        ${verified}
        ${territory.length > 0 ? Prisma.join(territory, " ") : Prisma.empty}
      GROUP BY pc."id", f."farmer_id", f."id", f."commune_id", f."verification_status", pc."area_ha"
    ),
    per_farmer AS (
      SELECT "farmer_id",
             sum(kg)::float8 AS production_kg,
             sum("area_ha")::float8 AS area_ha,
             count(DISTINCT farm_id) AS farm_count,
             bool_and(verified) AS all_verified,
             (array_agg("commune_id" ORDER BY "area_ha" DESC))[1] AS commune_id
      FROM per_crop GROUP BY "farmer_id"
    ),
    eligible AS (SELECT * FROM per_farmer ${eligibility}),
    ranked AS (
      SELECT e.*, fa."code" AS farmer_code,
             row_number() OVER (ORDER BY ${metric} DESC, fa."code") AS rank,
             count(*) OVER () AS eligible_count
      FROM eligible e JOIN "farmer" fa ON fa."id" = e."farmer_id" AND fa."archived_at" IS NULL
    )
    SELECT r.rank, r.eligible_count, r."farmer_id", r.farmer_code,
           fa."first_name", fa."last_name", fa."phone_e164" AS phone,
           c."code" AS commune_code, c."name" AS commune_name, d."name" AS departement_name,
           r.farm_count, r.area_ha, r.production_kg, r.all_verified,
           rc."farmer_id" IS NOT NULL AS public_consent
    FROM ranked r
    JOIN "farmer" fa ON fa."id" = r."farmer_id"
    JOIN "commune" c ON c."id" = r."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "ranking_consent" rc ON rc."farmer_id" = r."farmer_id" AND rc."revoked_at" IS NULL
    ${filters.consentingOnly ? Prisma.sql`WHERE rc."farmer_id" IS NOT NULL` : Prisma.empty}
    ORDER BY r.rank
    LIMIT ${filters.limit}`;
  return rows.map((row) => rowSchema.parse(row));
}
