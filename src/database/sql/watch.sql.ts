import { z } from "zod";
import { prisma } from "@/database/client";

// Lectures du centre de veille (ADR-0022) : exposition aux feux par commune et signalements
// groupés. Agrégats seulement, pour le ministère.

const exposureRow = z.object({
  commune_code: z.string(),
  commune_name: z.string(),
  fires: z.coerce.number(),
  farms: z.coerce.number(),
  producers: z.coerce.number(),
});
export type FireExposureRow = z.infer<typeof exposureRow>;

/**
 * Par commune : feux (confiance nominale ou haute) détectés depuis `since` à moins de 1 km d'une
 * parcelle enregistrée, exploitations et producteurs exposés. Les communes les plus exposées
 * d'abord.
 */
export async function fireExposureByCommune(since: Date, limit = 12): Promise<FireExposureRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code" AS commune_code, c."name" AS commune_name,
           COUNT(DISTINCT d."id") AS fires, COUNT(DISTINCT f."id") AS farms,
           COUNT(DISTINCT f."farmer_id") AS producers
    FROM "fire_detection" d
    JOIN "parcel" p
      ON p."archived_at" IS NULL
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location", 1000)
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    JOIN "commune" c ON c."id" = f."commune_id"
    WHERE d."detected_at" >= ${since} AND d."confidence"::text IN ('NOMINAL', 'HIGH')
    GROUP BY c."id", c."code", c."name"
    ORDER BY producers DESC, fires DESC
    LIMIT ${limit}`;
  return rows.map((row) => exposureRow.parse(row));
}

const reportGroupRow = z.object({
  commune_name: z.string(),
  type: z.string(),
  reports: z.coerce.number(),
  producers: z.coerce.number(),
  confirmed: z.coerce.number(),
  last_at: z.coerce.date(),
});
export type ReportGroupRow = z.infer<typeof reportGroupRow>;

/** Signalements non écartés depuis `since`, groupés par commune et type (deux au moins). */
export async function reportGroups(since: Date, limit = 8): Promise<ReportGroupRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."name" AS commune_name, r."type"::text AS type, COUNT(*) AS reports,
           COUNT(DISTINCT f."farmer_id") AS producers,
           COUNT(*) FILTER (WHERE r."status"::text = 'CONFIRMED') AS confirmed,
           MAX(r."observed_at") AS last_at
    FROM "field_report" r
    JOIN "farm" f ON f."id" = r."farm_id"
    JOIN "commune" c ON c."id" = r."commune_id"
    WHERE r."observed_at" >= ${since} AND r."status"::text <> 'DISMISSED'
    GROUP BY c."id", c."name", r."type"
    HAVING COUNT(*) >= 2
    ORDER BY producers DESC, reports DESC
    LIMIT ${limit}`;
  return rows.map((row) => reportGroupRow.parse(row));
}
