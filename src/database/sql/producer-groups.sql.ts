import { z } from "zod";
import { prisma } from "@/database/client";

// Groupes de producteurs (ADR-0024) : pour chaque membre, la parcelle à ouvrir sur la carte. On
// retient la parcelle de la culture et de la campagne du groupe qui a un contour (la carte peut la
// cadrer), puis la plus forte récolte déclarée, puis la plus grande surface.

const rowSchema = z.object({
  farmer_id: z.string(),
  parcel_id: z.string(),
});

export async function readMemberParcels(
  cropId: string,
  campaignId: string,
  farmerIds: readonly string[],
): Promise<Map<string, string>> {
  if (farmerIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH per_parcel AS (
      SELECT f."farmer_id", p."id" AS parcel_id, p."geom" IS NOT NULL AS has_geom,
             coalesce(sum(pd."quantity_kg"), 0) AS kg, max(pc."area_ha") AS area_ha
      FROM "parcel_crop" pc
      JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      LEFT JOIN "production_declaration" pd
        ON pd."parcel_crop_id" = pc."id" AND pd."archived_at" IS NULL
      WHERE pc."archived_at" IS NULL AND pc."crop_id" = ${cropId}::uuid
        AND pc."campaign_id" = ${campaignId}::uuid
        AND f."farmer_id" = ANY(${farmerIds as string[]}::uuid[])
      GROUP BY f."farmer_id", p."id"
    )
    SELECT DISTINCT ON ("farmer_id") "farmer_id"::text AS farmer_id, parcel_id::text AS parcel_id
    FROM per_parcel
    ORDER BY "farmer_id", has_geom DESC, kg DESC, area_ha DESC, parcel_id`;
  return new Map(
    rows.map((row) => {
      const parsed = rowSchema.parse(row);
      return [parsed.farmer_id, parsed.parcel_id];
    }),
  );
}
