import { z } from "zod";
import { prisma } from "@/database/client";

// Vue du ciel (ADR-0016) : cache des images Copernicus et décompte du quota de traitement.

export type SatelliteLayerCode = "TRUE_COLOR" | "NDVI";
export type SatelliteRequestKind = "IMAGE" | "STATISTICS";

export interface CachedImage {
  image: Uint8Array | null;
  expiresAt: Date | null;
}

export async function findCachedImage(
  layer: SatelliteLayerCode,
  period: string,
  tileKey: string,
): Promise<CachedImage | null> {
  const row = await prisma.satelliteTile.findUnique({
    where: { layer_period_tileKey: { layer, period, tileKey } },
    select: { image: true, expiresAt: true },
  });
  return row
    ? { image: row.image ? new Uint8Array(row.image) : null, expiresAt: row.expiresAt }
    : null;
}

export async function storeCachedImage(
  layer: SatelliteLayerCode,
  period: string,
  tileKey: string,
  image: Uint8Array | null,
  expiresAt: Date | null,
): Promise<void> {
  const data = { image: image ? Buffer.from(image) : null, fetchedAt: new Date(), expiresAt };
  await prisma.satelliteTile.upsert({
    where: { layer_period_tileKey: { layer, period, tileKey } },
    create: { layer, period, tileKey, ...data },
    update: data,
  });
}

/**
 * Réserve une requête de traitement sur le mois : l'incrément n'a lieu que si le total du mois
 * reste sous le plafond, dans une seule requête (deux appels concurrents ne peuvent pas le
 * dépasser ensemble). Faux : plafond atteint, ne pas appeler Copernicus.
 */
export async function reserveProcessingRequest(
  month: string,
  kind: SatelliteRequestKind,
  budget: number,
): Promise<boolean> {
  if (budget <= 0) return false;
  const image = kind === "IMAGE" ? 1 : 0;
  const statistics = kind === "STATISTICS" ? 1 : 0;
  const rows = await prisma.$queryRaw<{ month: string }[]>`
    INSERT INTO "satellite_usage" ("month", "image_requests", "statistics_requests", "updated_at")
    VALUES (${month}, ${image}, ${statistics}, now())
    ON CONFLICT ("month") DO UPDATE
      SET "image_requests" = "satellite_usage"."image_requests" + EXCLUDED."image_requests",
          "statistics_requests" =
            "satellite_usage"."statistics_requests" + EXCLUDED."statistics_requests",
          "updated_at" = now()
      WHERE "satellite_usage"."image_requests" + "satellite_usage"."statistics_requests"
        < ${budget}
    RETURNING "month"`;
  return rows.length > 0;
}

const outlineSchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()),
});

/**
 * Frontière du Bénin en EPSG:3857 : union des communes simplifiée à environ 500 m (quelques
 * centaines de sommets), coordonnées arrondies au mètre. Sert à découper les images satellite.
 */
export async function readCountryOutline3857(): Promise<z.infer<typeof outlineSchema> | null> {
  const rows = await prisma.$queryRaw<{ geojson: string | null }[]>`
    SELECT ST_AsGeoJSON(
             ST_Transform(ST_SimplifyPreserveTopology(ST_Union("geom"::geometry), 0.005), 3857),
             0
           ) AS geojson
      FROM "commune"
     WHERE "archived_at" IS NULL AND "geom" IS NOT NULL`;
  const geojson = rows[0]?.geojson;
  return geojson ? outlineSchema.parse(JSON.parse(geojson)) : null;
}

export async function addProcessingUnits(month: string, units: number): Promise<void> {
  if (!(units > 0)) return;
  await prisma.$executeRaw`
    UPDATE "satellite_usage"
       SET "processing_units" = "processing_units" + ${units}, "updated_at" = now()
     WHERE "month" = ${month}`;
}

const usageSchema = z.object({
  image_requests: z.number(),
  statistics_requests: z.number(),
  processing_units: z.coerce.number(),
});

export interface SatelliteUsageRow {
  imageRequests: number;
  statisticsRequests: number;
  processingUnits: number;
}

export async function readProcessingUsage(month: string): Promise<SatelliteUsageRow> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT "image_requests", "statistics_requests", "processing_units"
      FROM "satellite_usage" WHERE "month" = ${month}`;
  const row = rows[0] ? usageSchema.parse(rows[0]) : null;
  return {
    imageRequests: row?.image_requests ?? 0,
    statisticsRequests: row?.statistics_requests ?? 0,
    processingUnits: row?.processing_units ?? 0,
  };
}
