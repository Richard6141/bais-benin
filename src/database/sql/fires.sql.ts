import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Feux actifs (ADR-0022) : écriture des détections avec leur commune, lecture pour la carte et le
// centre de veille, recherche des exploitations dont une parcelle est proche d'un feu. Une
// parcelle se situe par son contour, sinon son centre ; l'index GiST sert ST_DWithin.

/** Distance d'une parcelle au feu en deçà de laquelle l'exploitation est concernée. */
export const FIRE_RADIUS_M = 1000;
/** Fenêtre des détections qui comptent pour une alerte de feu. */
export const FIRE_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Confiances retenues pour les alertes : une détection « faible » ne suffit pas. */
export const ALERT_CONFIDENCES = ["NOMINAL", "HIGH"];

export interface FireRowToInsert {
  id: string;
  detectedAt: Date;
  latitude: number;
  longitude: number;
  sensors: string[];
  confidence: string;
  frpMw: number | null;
  brightnessK: number | null;
  daynight: string | null;
  sourceKeys: string[];
}

/**
 * Insère les détections situées dans une commune du Bénin (les autres, dans l'emprise mais hors
 * frontière, sont écartées). Renvoie les identifiants insérés.
 */
export async function insertFireDetections(rows: readonly FireRowToInsert[]): Promise<string[]> {
  if (rows.length === 0) return [];
  // Heure en UTC, comme les colonnes DateTime de Prisma (timestamp sans fuseau).
  const values = rows.map(
    (r) => Prisma.sql`(${r.id}::uuid,
      (${r.detectedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
      ${r.latitude}::float8, ${r.longitude}::float8, ${r.sensors}::text[], ${r.confidence}::text,
      ${r.frpMw}::float8, ${r.brightnessK}::float8, ${r.daynight}::text, ${r.sourceKeys}::text[])`,
  );
  const inserted = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "fire_detection" ("id", "detected_at", "latitude", "longitude", "location",
      "commune_id", "sensors", "confidence", "frp_mw", "brightness_k", "daynight", "source_keys",
      "updated_at")
    SELECT v.id, v.detected_at, v.lat, v.lon,
           ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography,
           c.id, v.sensors::"FireSensor"[], v.confidence::"FireConfidence", v.frp, v.brightness,
           v.daynight, v.source_keys, now()
    FROM (VALUES ${Prisma.join(values)})
      AS v(id, detected_at, lat, lon, sensors, confidence, frp, brightness, daynight, source_keys)
    JOIN LATERAL (
      SELECT "id" FROM "commune"
      WHERE "archived_at" IS NULL
        AND ST_Intersects("geom", ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)::geography)
      LIMIT 1
    ) c ON true
    RETURNING "id"::text AS id`;
  return inserted.map((row) => row.id);
}

export interface StoredFire {
  id: string;
  detectedAt: Date;
  latitude: number;
  longitude: number;
  sensors: string[];
  confidence: string;
  frpMw: number | null;
  brightnessK: number | null;
  sourceKeys: string[];
}

/** Détections récentes, pour le dédoublonnage d'un nouveau passage. */
export async function recentFireDetections(since: Date): Promise<StoredFire[]> {
  const rows = await prisma.fireDetection.findMany({
    where: { detectedAt: { gte: since } },
    select: {
      id: true,
      detectedAt: true,
      latitude: true,
      longitude: true,
      sensors: true,
      confidence: true,
      frpMw: true,
      brightnessK: true,
      sourceKeys: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    frpMw: row.frpMw === null ? null : Number(row.frpMw),
    brightnessK: row.brightnessK === null ? null : Number(row.brightnessK),
  }));
}

const countRow = z.object({ commune_id: z.string(), farms: z.coerce.number() });

/**
 * Par commune : exploitations actives dont une parcelle est à moins de 1 km d'un feu détecté
 * depuis `since` avec une confiance nominale ou haute (indicateur fire_near_parcels).
 */
export async function farmsNearFiresByCommune(
  communeIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (communeIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."commune_id"::text AS commune_id, COUNT(DISTINCT f."id") AS farms
    FROM "farm" f
    JOIN "parcel" p ON p."farm_id" = f."id" AND p."archived_at" IS NULL
    JOIN "fire_detection" d
      ON d."detected_at" >= ${since}
     AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_RADIUS_M})
    WHERE f."archived_at" IS NULL AND f."commune_id" = ANY(${communeIds as string[]}::uuid[])
    GROUP BY f."commune_id"`;
  return new Map(rows.map((raw) => countRow.parse(raw)).map((r) => [r.commune_id, r.farms]));
}

/** Exploitations d'une commune concernées par un feu depuis `since`, avec leur enregistreur. */
export async function farmsNearFires(
  communeId: string,
  since: Date,
): Promise<Array<{ farmId: string; registeredById: string | null }>> {
  return prisma.$queryRaw<Array<{ farmId: string; registeredById: string | null }>>`
    SELECT DISTINCT f."id"::text AS "farmId", f."registered_by_id"::text AS "registeredById"
    FROM "farm" f
    JOIN "parcel" p ON p."farm_id" = f."id" AND p."archived_at" IS NULL
    JOIN "fire_detection" d
      ON d."detected_at" >= ${since}
     AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_RADIUS_M})
    WHERE f."archived_at" IS NULL AND f."commune_id" = ${communeId}::uuid`;
}

/** Communes des exploitations dont une parcelle est à moins de 1 km de ces détections. */
export async function communesNearFires(detectionIds: readonly string[]): Promise<string[]> {
  if (detectionIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ commune_id: string }[]>`
    SELECT DISTINCT f."commune_id"::text AS commune_id
    FROM "fire_detection" d
    JOIN "parcel" p
      ON p."archived_at" IS NULL
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_RADIUS_M})
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    WHERE d."id" = ANY(${detectionIds as string[]}::uuid[])
      AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})`;
  return rows.map((row) => row.commune_id);
}

const closestRow = z.object({ commune_id: z.string(), distance_m: z.coerce.number() });

/**
 * Par commune : distance du feu le plus proche d'une parcelle d'exploitation active (1 km au plus,
 * confiance nominale ou haute, depuis `since`). Sert à la gravité de l'alerte : sous 500 m, elle
 * est critique.
 */
export async function closestFireByCommune(
  communeIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (communeIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."commune_id"::text AS commune_id,
           MIN(ST_Distance(COALESCE(p."geom"::geography, p."centroid"::geography), d."location"))
             AS distance_m
    FROM "farm" f
    JOIN "parcel" p ON p."farm_id" = f."id" AND p."archived_at" IS NULL
    JOIN "fire_detection" d
      ON d."detected_at" >= ${since}
     AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_RADIUS_M})
    WHERE f."archived_at" IS NULL AND f."commune_id" = ANY(${communeIds as string[]}::uuid[])
    GROUP BY f."commune_id"`;
  return new Map(rows.map((raw) => closestRow.parse(raw)).map((r) => [r.commune_id, r.distance_m]));
}

const exposureRow = z.object({
  farm_id: z.string(),
  distance_m: z.coerce.number(),
  parcel_lat: z.coerce.number(),
  parcel_lon: z.coerce.number(),
  fire_lat: z.coerce.number(),
  fire_lon: z.coerce.number(),
  detected_at: z.coerce.date(),
  crop_name: z.string().nullable(),
});

export interface FarmFireExposure {
  farmId: string;
  /** Distance du feu au bord de la parcelle (à son centre sans contour), en mètres. */
  distanceM: number;
  parcel: { lat: number; lon: number };
  fire: { lat: number; lon: number };
  detectedAt: Date;
  /** Culture principale de la parcelle pour la campagne ouverte, ou null. */
  cropName: string | null;
}

/**
 * Pour chaque exploitation, le feu le plus proche d'une de ses parcelles depuis `since` (1 km au
 * plus, confiance nominale ou haute), avec la parcelle d'où il est vu : distance, positions,
 * heure de détection et culture de la campagne ouverte. Une exploitation sans feu proche n'a pas
 * d'entrée.
 */
export async function nearestFiresForFarms(
  farmIds: readonly string[],
  since: Date,
): Promise<Map<string, FarmFireExposure>> {
  if (farmIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT DISTINCT ON (p."farm_id")
           p."farm_id"::text AS farm_id,
           ST_Distance(COALESCE(p."geom"::geography, p."centroid"::geography), d."location")
             AS distance_m,
           ST_Y(COALESCE(p."centroid"::geometry, ST_Centroid(p."geom"::geometry))) AS parcel_lat,
           ST_X(COALESCE(p."centroid"::geometry, ST_Centroid(p."geom"::geometry))) AS parcel_lon,
           d."latitude" AS fire_lat, d."longitude" AS fire_lon,
           (d."detected_at" AT TIME ZONE 'UTC') AS detected_at,
           (SELECT c."name_fr"
              FROM "parcel_crop" pc
              JOIN "crop" c ON c."id" = pc."crop_id"
              JOIN "agricultural_campaign" ac
                ON ac."id" = pc."campaign_id" AND ac."status" = 'OPEN'
             WHERE pc."parcel_id" = p."id" AND pc."archived_at" IS NULL
             ORDER BY pc."area_ha" DESC
             LIMIT 1) AS crop_name
    FROM "parcel" p
    JOIN "fire_detection" d
      ON d."detected_at" >= ${since}
     AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_RADIUS_M})
    WHERE p."archived_at" IS NULL AND p."farm_id" = ANY(${farmIds as string[]}::uuid[])
    ORDER BY p."farm_id", distance_m ASC, d."detected_at" DESC`;
  return new Map(
    rows
      .map((raw) => exposureRow.parse(raw))
      .map((r) => [
        r.farm_id,
        {
          farmId: r.farm_id,
          distanceM: r.distance_m,
          parcel: { lat: r.parcel_lat, lon: r.parcel_lon },
          fire: { lat: r.fire_lat, lon: r.fire_lon },
          detectedAt: r.detected_at,
          cropName: r.crop_name,
        },
      ]),
  );
}
