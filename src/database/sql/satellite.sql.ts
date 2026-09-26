import { z } from "zod";
import { prisma } from "@/database/client";

// Vue du ciel (ADR-0016) : cache des images Copernicus et décompte du quota de traitement.

export type SatelliteLayerCode = "TRUE_COLOR" | "NDVI";
export type SatelliteRequestKind = "IMAGE" | "STATISTICS" | "PROPOSAL";

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
 * Garde-fous du compte CDSE (ADR-0016, revue de sécurité R2) : plafond mensuel de requêtes en
 * trois parts étanches (propositions de contours, statistiques de la confrontation, images de la
 * carte : aucune ne peut prendre la part d'une autre), plafond mensuel d'unités de traitement et
 * limite globale de requêtes par minute, sous celle de Copernicus.
 */
export interface ProcessingBudget {
  total: number;
  proposalShare: number;
  statisticsShare: number;
  /** Unités de traitement (PU) par mois. */
  processingUnits: number;
  /** Requêtes par minute, tous usages confondus. */
  perMinute: number;
}

export function budgetLimits(budget: ProcessingBudget): {
  proposals: number;
  statistics: number;
  images: number;
} {
  const proposals = Math.floor(budget.total * budget.proposalShare);
  const statistics = Math.floor(budget.total * budget.statisticsShare);
  return { proposals, statistics, images: Math.max(0, budget.total - proposals - statistics) };
}

export type ReservationOutcome = "reserved" | "share-exhausted" | "units-exhausted" | "throttled";

function minuteOf(now: Date): string {
  return now.toISOString().slice(0, 16);
}

/**
 * Réserve une requête de traitement, dans la part de son type : l'incrément n'a lieu que si la
 * part, les unités de traitement du mois et la limite de la minute le permettent, dans une seule
 * requête (des appels concurrents ne peuvent pas dépasser ensemble). Refus : la cause, pour dire
 * à l'appelant d'attendre une minute ou le mois suivant.
 */
export async function reserveProcessingRequest(
  month: string,
  kind: SatelliteRequestKind,
  budget: ProcessingBudget,
  now = new Date(),
): Promise<ReservationOutcome> {
  const limits = budgetLimits(budget);
  const limit =
    kind === "PROPOSAL"
      ? limits.proposals
      : kind === "STATISTICS"
        ? limits.statistics
        : limits.images;
  if (limit <= 0) return "share-exhausted";
  if (budget.processingUnits <= 0) return "units-exhausted";
  if (budget.perMinute <= 0) return "throttled";
  const image = kind === "IMAGE" ? 1 : 0;
  const statistics = kind === "STATISTICS" ? 1 : 0;
  const proposals = kind === "PROPOSAL" ? 1 : 0;
  const minute = minuteOf(now);
  const rows = await prisma.$queryRaw<{ month: string }[]>`
    INSERT INTO "satellite_usage" (
      "month", "image_requests", "statistics_requests", "proposal_requests", "minute_bucket",
      "minute_requests", "updated_at"
    )
    VALUES (${month}, ${image}, ${statistics}, ${proposals}, ${minute}, 1, now())
    ON CONFLICT ("month") DO UPDATE
      SET "image_requests" = "satellite_usage"."image_requests" + EXCLUDED."image_requests",
          "statistics_requests" =
            "satellite_usage"."statistics_requests" + EXCLUDED."statistics_requests",
          "proposal_requests" =
            "satellite_usage"."proposal_requests" + EXCLUDED."proposal_requests",
          "minute_requests" = CASE
            WHEN "satellite_usage"."minute_bucket" = EXCLUDED."minute_bucket"
              THEN "satellite_usage"."minute_requests" + 1
            ELSE 1
          END,
          "minute_bucket" = EXCLUDED."minute_bucket",
          "updated_at" = now()
      WHERE CASE ${kind}
              WHEN 'PROPOSAL' THEN "satellite_usage"."proposal_requests" < ${limit}
              WHEN 'STATISTICS' THEN "satellite_usage"."statistics_requests" < ${limit}
              ELSE "satellite_usage"."image_requests" < ${limit}
            END
        AND "satellite_usage"."processing_units" < ${budget.processingUnits}
        AND ("satellite_usage"."minute_bucket" IS DISTINCT FROM EXCLUDED."minute_bucket"
             OR "satellite_usage"."minute_requests" < ${budget.perMinute})
    RETURNING "month"`;
  if (rows.length > 0) return "reserved";
  // Refus : lire l'état du mois pour en donner la cause.
  const usage = await readProcessingUsage(month);
  const used =
    kind === "PROPOSAL"
      ? usage.proposalRequests
      : kind === "STATISTICS"
        ? usage.statisticsRequests
        : usage.imageRequests;
  if (used >= limit) return "share-exhausted";
  if (usage.processingUnits >= budget.processingUnits) return "units-exhausted";
  return "throttled";
}

/** Garde une image périmée une heure de plus, ou note l'échec, pour ne pas redemander aussitôt. */
export async function holdAfterFailure(
  layer: SatelliteLayerCode,
  period: string,
  tileKey: string,
  until: Date,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "satellite_tile" ("layer", "period", "tile_key", "image", "fetched_at", "expires_at")
    VALUES (${layer}::"SatelliteLayer", ${period}, ${tileKey}, NULL, now(), ${until})
    ON CONFLICT ("layer", "period", "tile_key") DO UPDATE
      SET "expires_at" = EXCLUDED."expires_at"`;
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

/** Surfaces géodésiques (PostGIS, en hectares) de polygones GeoJSON en WGS84. */
export async function geodesicAreasHa(geojsons: readonly string[]): Promise<number[]> {
  if (geojsons.length === 0) return [];
  const rows = await prisma.$queryRaw<{ ord: bigint; area_ha: number }[]>`
    SELECT t.ord, ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(t.geojson), 4326)::geography) / 10000
             AS area_ha
      FROM unnest(${[...geojsons]}::text[]) WITH ORDINALITY AS t(geojson, ord)
     ORDER BY t.ord`;
  return rows.map((row) => Number(row.area_ha));
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
  proposal_requests: z.number(),
  processing_units: z.coerce.number(),
});

export interface SatelliteUsageRow {
  imageRequests: number;
  statisticsRequests: number;
  proposalRequests: number;
  processingUnits: number;
}

export async function readProcessingUsage(month: string): Promise<SatelliteUsageRow> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT "image_requests", "statistics_requests", "proposal_requests", "processing_units"
      FROM "satellite_usage" WHERE "month" = ${month}`;
  const row = rows[0] ? usageSchema.parse(rows[0]) : null;
  return {
    imageRequests: row?.image_requests ?? 0,
    statisticsRequests: row?.statistics_requests ?? 0,
    proposalRequests: row?.proposal_requests ?? 0,
    processingUnits: row?.processing_units ?? 0,
  };
}
