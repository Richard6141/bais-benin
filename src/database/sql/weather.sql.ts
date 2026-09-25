import { z } from "zod";
import { prisma } from "@/database/client";

// Requêtes météo du monitoring. L'écriture passe par un INSERT … ON CONFLICT en une requête
// par lot (77 communes × ~40 jours) : une réingestion met à jour les valeurs sans doublon.
// Clé d'unicité : (commune, date, nature, source, date d'émission). Une journée observée a
// pour date d'émission sa propre date ; une prévision, le jour où elle a été émise.

export interface WeatherRow {
  communeId: string;
  observedOn: string;
  kind: "OBSERVED" | "FORECAST";
  issuedOn: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  et0Mm: number | null;
  relativeHumidityPct: number | null;
  windKmh: number | null;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC" | "OFFICIAL";
  ingestionRunId: string | null;
}

const BATCH = 1000;

export async function upsertWeatherRows(rows: readonly WeatherRow[]): Promise<number> {
  let written = 0;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    written += await prisma.$executeRaw`
      INSERT INTO "weather_observation" (
        "id", "commune_id", "observed_on", "kind", "issued_on", "temp_max_c", "temp_min_c",
        "precipitation_mm", "et0_mm", "relative_humidity_pct", "wind_kmh", "source_id",
        "reliability", "ingestion_run_id", "fetched_at"
      )
      SELECT gen_random_uuid(), t.commune_id, t.observed_on, t.kind::"WeatherKind", t.issued_on,
             t.temp_max_c, t.temp_min_c, t.precipitation_mm, t.et0_mm, t.relative_humidity_pct,
             t.wind_kmh, t.source_id, t.reliability::"Reliability", t.ingestion_run_id, now()
      FROM unnest(
        ${batch.map((r) => r.communeId)}::uuid[],
        ${batch.map((r) => r.observedOn)}::date[],
        ${batch.map((r) => r.kind)}::text[],
        ${batch.map((r) => r.issuedOn)}::date[],
        ${batch.map((r) => r.tempMaxC)}::numeric[],
        ${batch.map((r) => r.tempMinC)}::numeric[],
        ${batch.map((r) => r.precipitationMm)}::numeric[],
        ${batch.map((r) => r.et0Mm)}::numeric[],
        ${batch.map((r) => r.relativeHumidityPct)}::numeric[],
        ${batch.map((r) => r.windKmh)}::numeric[],
        ${batch.map((r) => r.sourceId)}::text[],
        ${batch.map((r) => r.reliability)}::text[],
        ${batch.map((r) => r.ingestionRunId)}::uuid[]
      ) AS t(commune_id, observed_on, kind, issued_on, temp_max_c, temp_min_c, precipitation_mm,
             et0_mm, relative_humidity_pct, wind_kmh, source_id, reliability, ingestion_run_id)
      ON CONFLICT ("commune_id", "observed_on", "kind", "source_id", "issued_on") DO UPDATE SET
        "temp_max_c" = EXCLUDED."temp_max_c",
        "temp_min_c" = EXCLUDED."temp_min_c",
        "precipitation_mm" = EXCLUDED."precipitation_mm",
        "et0_mm" = EXCLUDED."et0_mm",
        "relative_humidity_pct" = EXCLUDED."relative_humidity_pct",
        "wind_kmh" = EXCLUDED."wind_kmh",
        "reliability" = EXCLUDED."reliability",
        "ingestion_run_id" = EXCLUDED."ingestion_run_id",
        "fetched_at" = now()`;
  }
  return written;
}

const numeric = z.coerce.number().nullable();

const seriesRowSchema = z.object({
  commune_id: z.uuid(),
  observed_on: z.coerce.date(),
  kind: z.enum(["OBSERVED", "FORECAST", "REANALYSIS"]),
  temp_max_c: numeric,
  temp_min_c: numeric,
  precipitation_mm: numeric,
  et0_mm: numeric,
  relative_humidity_pct: numeric,
  wind_kmh: numeric,
  source_id: z.string(),
  reliability: z.string(),
  fetched_at: z.coerce.date(),
});

export type WeatherSeriesRow = z.infer<typeof seriesRowSchema>;

// Série d'une ou plusieurs communes autour d'une date de référence : observations des `pastDays`
// derniers jours et dernière prévision émise au plus tard ce jour-là pour les jours suivants.
// Quand deux sources couvrent un même jour, la plus fiable l'emporte (Open-Meteo avant fixture).
export async function readWeatherSeries(
  communeIds: readonly string[],
  referenceDate: string,
  pastDays: number,
  forecastDays: number,
  /** Dernière date d'émission acceptée pour les prévisions (par défaut la date de référence). */
  issuedBy: string = referenceDate,
): Promise<WeatherSeriesRow[]> {
  if (communeIds.length === 0) return [];
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH ranked AS (
      SELECT w.*,
             row_number() OVER (
               PARTITION BY w."commune_id", w."observed_on", w."kind"
               ORDER BY (w."source_id" = 'OPEN_METEO') DESC, w."issued_on" DESC, w."fetched_at" DESC
             ) AS rank
      FROM "weather_observation" w
      WHERE w."commune_id" = ANY(${communeIds as string[]}::uuid[])
        AND (
          (w."kind" = 'OBSERVED'
            AND w."observed_on" > ${referenceDate}::date - ${pastDays}::int
            AND w."observed_on" <= ${referenceDate}::date)
          OR (w."kind" = 'FORECAST'
            AND w."observed_on" > ${referenceDate}::date
            AND w."observed_on" <= ${referenceDate}::date + ${forecastDays}::int
            AND w."issued_on" <= ${issuedBy}::date)
        )
    )
    SELECT "commune_id", "observed_on", "kind"::text AS kind, "temp_max_c", "temp_min_c",
           "precipitation_mm", "et0_mm", "relative_humidity_pct", "wind_kmh", "source_id",
           "reliability"::text AS reliability, "fetched_at"
    FROM ranked WHERE rank = 1
    ORDER BY "commune_id", "observed_on"`;
  return rows.map((row) => seriesRowSchema.parse(row));
}

const cropPresenceSchema = z.object({
  commune_id: z.uuid(),
  crop_code: z.string(),
  stage: z.string(),
  farm_count: z.coerce.number(),
  area_ha: z.coerce.number(),
});

export type CropPresenceRow = z.infer<typeof cropPresenceSchema>;

// Cultures et stades présents par commune pour la campagne ouverte (indicateurs crop_in et
// crop_stage_in), avec le nombre d'exploitations et la surface concernés.
export async function readCropPresence(communeIds: readonly string[]): Promise<CropPresenceRow[]> {
  if (communeIds.length === 0) return [];
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."commune_id", cr."code" AS crop_code, pc."stage"::text AS stage,
           count(DISTINCT f."id") AS farm_count, coalesce(sum(pc."area_ha"), 0) AS area_ha
    FROM "parcel_crop" pc
    JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    JOIN "crop" cr ON cr."id" = pc."crop_id"
    JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id" AND ac."status" = 'OPEN'
    WHERE pc."archived_at" IS NULL
      AND f."commune_id" = ANY(${communeIds as string[]}::uuid[])
    GROUP BY f."commune_id", cr."code", pc."stage"`;
  return rows.map((row) => cropPresenceSchema.parse(row));
}

const communeLocationSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  departement_name: z.string(),
  zone_code: z.string().nullable(),
  lng: z.number(),
  lat: z.number(),
});

export type CommuneLocation = z.infer<typeof communeLocationSchema>;

// Centroïde et zone agro-écologique des communes actives : points d'interrogation météo.
export async function readCommuneLocations(): Promise<CommuneLocation[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id", c."code", c."name", d."name" AS departement_name, z."code" AS zone_code,
           ST_X(c."centroid"::geometry) AS lng, ST_Y(c."centroid"::geometry) AS lat
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
    WHERE c."archived_at" IS NULL AND c."centroid" IS NOT NULL
    ORDER BY c."code"`;
  return rows.map((row) => communeLocationSchema.parse(row));
}
