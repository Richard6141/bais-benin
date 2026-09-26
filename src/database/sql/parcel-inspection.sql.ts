import { z } from "zod";
import { prisma } from "@/database/client";

// Lectures géométriques et statistiques de la fiche parcelle (carte du ministère et de l'agent) :
// cadre et centre du contour, puis rendement de chaque culture de la parcelle comparé à ceux des
// autres parcelles de la même commune pour la même culture.

const num = z.coerce.number();
const nullableNum = z.coerce.number().nullable();

const shapeSchema = z.object({
  lng: nullableNum,
  lat: nullableNum,
  min_lng: nullableNum,
  min_lat: nullableNum,
  max_lng: nullableNum,
  max_lat: nullableNum,
});

export interface ParcelShape {
  centroid: { lng: number; lat: number } | null;
  bbox: [number, number, number, number] | null;
}

/** Centre et emprise de la parcelle : la carte s'y cadre quand on ouvre la fiche depuis un lien. */
export async function readParcelShape(parcelId: string): Promise<ParcelShape> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT ST_X(COALESCE(p."centroid", ST_Centroid(p."geom"))::geometry) AS lng,
           ST_Y(COALESCE(p."centroid", ST_Centroid(p."geom"))::geometry) AS lat,
           ST_XMin(p."geom"::geometry) AS min_lng, ST_YMin(p."geom"::geometry) AS min_lat,
           ST_XMax(p."geom"::geometry) AS max_lng, ST_YMax(p."geom"::geometry) AS max_lat
    FROM "parcel" p
    WHERE p."id" = ${parcelId}::uuid`;
  const row = rows[0] ? shapeSchema.parse(rows[0]) : null;
  if (!row) return { centroid: null, bbox: null };
  return {
    centroid: row.lng !== null && row.lat !== null ? { lng: row.lng, lat: row.lat } : null,
    bbox:
      row.min_lng !== null && row.min_lat !== null && row.max_lng !== null && row.max_lat !== null
        ? [row.min_lng, row.min_lat, row.max_lng, row.max_lat]
        : null,
  };
}

const yieldSchema = z.object({
  parcel_crop_id: z.string(),
  harvest_kg: nullableNum,
  yield_t_per_ha: nullableNum,
  peers: num,
  peer_median_t_per_ha: nullableNum,
  better_than_share: nullableNum,
});
export type ParcelYieldRow = z.infer<typeof yieldSchema>;

/**
 * Rendement de chaque culture déclarée de la parcelle (quantité récoltée / surface semée) et sa
 * place parmi les parcelles de la même commune, même culture, même campagne. Les pairs sans
 * récolte déclarée ne comptent pas. `better_than_share` : part des pairs au rendement inférieur.
 */
export async function readParcelYields(parcelId: string): Promise<ParcelYieldRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH mine AS (
      SELECT pc."id", pc."crop_id", pc."campaign_id", f."commune_id"
      FROM "parcel_crop" pc
      JOIN "parcel" p ON p."id" = pc."parcel_id"
      JOIN "farm" f ON f."id" = p."farm_id"
      WHERE pc."parcel_id" = ${parcelId}::uuid AND pc."archived_at" IS NULL
    ),
    yields AS (
      SELECT pc."id", pc."crop_id", pc."campaign_id", f."commune_id",
             SUM(d."quantity_kg") AS kg,
             SUM(d."quantity_kg") / NULLIF(pc."area_ha", 0) / 1000 AS t_per_ha
      FROM "parcel_crop" pc
      JOIN "production_declaration" d ON d."parcel_crop_id" = pc."id" AND d."archived_at" IS NULL
      JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN mine m ON m."crop_id" = pc."crop_id" AND m."campaign_id" = pc."campaign_id"
                 AND m."commune_id" = f."commune_id"
      WHERE pc."archived_at" IS NULL
      GROUP BY pc."id", pc."crop_id", pc."campaign_id", f."commune_id", pc."area_ha"
    )
    SELECT m."id" AS parcel_crop_id,
           own.kg AS harvest_kg,
           own.t_per_ha AS yield_t_per_ha,
           COUNT(peer."id") AS peers,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY peer.t_per_ha) AS peer_median_t_per_ha,
           CASE WHEN own.t_per_ha IS NULL OR COUNT(peer."id") = 0 THEN NULL
                ELSE AVG(CASE WHEN peer.t_per_ha < own.t_per_ha THEN 1.0 ELSE 0.0 END) END
             AS better_than_share
    FROM mine m
    LEFT JOIN yields own ON own."id" = m."id"
    LEFT JOIN yields peer ON peer."crop_id" = m."crop_id" AND peer."campaign_id" = m."campaign_id"
                         AND peer."commune_id" = m."commune_id" AND peer."id" <> m."id"
                         AND peer.t_per_ha IS NOT NULL
    GROUP BY m."id", own.kg, own.t_per_ha`;
  return rows.map((row) => yieldSchema.parse(row));
}
