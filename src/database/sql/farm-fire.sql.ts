import { z } from "zod";
import { prisma } from "@/database/client";

// Feu le plus proche d'une exploitation, pour la carte d'alerte de l'accueil agriculteur
// (chantier K). Même rayon et même fenêtre que l'alerte « feu de brousse » (fires.sql.ts).

export const FARM_FIRE_RADIUS_M = 1000;
export const FARM_FIRE_WINDOW_MS = 24 * 60 * 60 * 1000;

const nearestRow = z.object({
  fire_lng: z.coerce.number(),
  fire_lat: z.coerce.number(),
  farm_lng: z.coerce.number(),
  farm_lat: z.coerce.number(),
  distance_m: z.coerce.number(),
  detected_at: z.string(),
});

export interface NearestFireForFarm {
  fireLng: number;
  fireLat: number;
  farmLng: number;
  farmLat: number;
  distanceM: number;
  detectedAt: Date;
}

/** Feu le plus proche d'une parcelle de l'exploitation, avec le centre de cette parcelle. */
export async function nearestFireForFarm(
  farmId: string,
  since: Date = new Date(Date.now() - FARM_FIRE_WINDOW_MS),
): Promise<NearestFireForFarm | null> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT ST_X(d."location"::geometry) AS fire_lng, ST_Y(d."location"::geometry) AS fire_lat,
           ST_X(ST_Centroid(COALESCE(p."geom"::geometry, p."centroid"::geometry))) AS farm_lng,
           ST_Y(ST_Centroid(COALESCE(p."geom"::geometry, p."centroid"::geometry))) AS farm_lat,
           ST_Distance(COALESCE(p."geom"::geography, p."centroid"::geography), d."location")
             AS distance_m,
           d."detected_at"::text AS detected_at
    FROM "fire_detection" d
    JOIN "parcel" p
      ON p."farm_id" = ${farmId}::uuid AND p."archived_at" IS NULL
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FARM_FIRE_RADIUS_M}::float8)
    WHERE d."detected_at" >= ${since}
    ORDER BY distance_m ASC
    LIMIT 1`;
  const [first] = rows;
  if (!first) return null;
  const row = nearestRow.parse(first);
  return {
    fireLng: row.fire_lng,
    fireLat: row.fire_lat,
    farmLng: row.farm_lng,
    farmLat: row.farm_lat,
    distanceM: row.distance_m,
    detectedAt: new Date(`${row.detected_at}Z`),
  };
}
