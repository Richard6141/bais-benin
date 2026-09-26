import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Cultures par parcelle (ADR-0030) : parcelles à lire par satellite, séries et variables, jeu
// d'entraînement, modèles et cultures mesurées.

/** Culture principale de chaque parcelle pour la campagne : la plus grande surface. */
function mainCrop(campaignId: string) {
  return Prisma.sql`
    SELECT DISTINCT ON (pc."parcel_id") pc."parcel_id", c."code" AS crop_code
      FROM "parcel_crop" pc
      JOIN "crop" c ON c."id" = pc."crop_id"
     WHERE pc."campaign_id" = ${campaignId}::uuid AND pc."archived_at" IS NULL
     ORDER BY pc."parcel_id", pc."area_ha" DESC, pc."id"`;
}

const candidateSchema = z.object({
  parcel_id: z.string(),
  parcel_code: z.string(),
  commune_code: z.string(),
  crop_code: z.string().nullable(),
  verified: z.boolean(),
  latitude: z.coerce.number(),
  geometry: z.string(),
  observed_until: z.date().nullable(),
  s2_series: z.unknown().nullable(),
  s1_series: z.unknown().nullable(),
  processing_units: z.coerce.number().nullable(),
  source_id: z.string().nullable(),
});

export type SignatureCandidate = z.infer<typeof candidateSchema>;

/**
 * Parcelles relevées des communes pilotes dont la série manque ou date d'avant `staleBefore` :
 * jamais lues d'abord, les parcelles vérifiées (entraînement) avant les autres, puis les séries
 * les plus anciennes. `replaceSynthetic` : une mesure réelle remplace d'abord la démonstration.
 */
export async function listSignatureCandidates(options: {
  campaignId: string;
  communeCodes: readonly string[];
  staleBefore: Date;
  replaceSynthetic: boolean;
  limit: number;
}): Promise<SignatureCandidate[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH main_crop AS (${mainCrop(options.campaignId)})
    SELECT p."id" AS parcel_id, p."code" AS parcel_code, co."code" AS commune_code,
           mc.crop_code,
           f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED') AS verified,
           ST_Y(ST_Centroid(p."geom"::geometry)) AS latitude,
           ST_AsGeoJSON(p."geom"::geometry, 6) AS geometry,
           s."observed_until", s."s2_series", s."s1_series", s."processing_units",
           s."source_id"
      FROM "parcel" p
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" co ON co."id" = f."commune_id"
      LEFT JOIN main_crop mc ON mc."parcel_id" = p."id"
      LEFT JOIN "parcel_signature" s
             ON s."parcel_id" = p."id" AND s."campaign_id" = ${options.campaignId}::uuid
     WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL
       AND co."code" = ANY(${options.communeCodes as string[]}::text[])
       AND (s."id" IS NULL OR s."observed_until" < ${options.staleBefore}::date
            OR (${options.replaceSynthetic} AND s."source_id" = 'BAIS_SEED'))
     ORDER BY (s."id" IS NULL OR (${options.replaceSynthetic} AND s."source_id" = 'BAIS_SEED')) DESC,
              (f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')) DESC,
              s."observed_until" NULLS FIRST, p."id"
     LIMIT ${options.limit}`;
  return rows.map((row) => candidateSchema.parse(row));
}

export interface SignatureRow {
  parcelId: string;
  campaignId: string;
  windowFrom: Date;
  observedUntil: Date;
  s2Series: unknown;
  s1Series: unknown;
  features: Record<string, number>;
  featureVersion: number;
  processingUnits: number | null;
  /** Unités de cette lecture seule. */
  lastProcessingUnits: number | null;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC";
  computedAt: Date;
}

/** Unités dépensées depuis `since` par les lectures de séries de parcelles (mesures réelles). */
export async function seriesUnitsSince(since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ units: string | null }[]>`
    SELECT sum("last_processing_units")::text AS units
      FROM "parcel_signature"
     WHERE "computed_at" >= ${since} AND "source_id" <> 'BAIS_SEED'`;
  return Number(rows[0]?.units ?? 0);
}

export async function upsertSignature(row: SignatureRow): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "parcel_signature" (
      "id", "parcel_id", "campaign_id", "window_from", "observed_until", "s2_series",
      "s1_series", "features", "feature_version", "processing_units", "last_processing_units",
      "source_id", "reliability", "computed_at"
    ) VALUES (
      gen_random_uuid(), ${row.parcelId}::uuid, ${row.campaignId}::uuid, ${row.windowFrom}::date,
      ${row.observedUntil}::date, ${JSON.stringify(row.s2Series)}::jsonb,
      ${JSON.stringify(row.s1Series)}::jsonb, ${JSON.stringify(row.features)}::jsonb,
      ${row.featureVersion}, ${row.processingUnits}::numeric, ${row.lastProcessingUnits}::numeric,
      ${row.sourceId},
      ${row.reliability}::"Reliability", ${row.computedAt}::timestamp
    )
    ON CONFLICT ("parcel_id", "campaign_id") DO UPDATE SET
      "window_from" = EXCLUDED."window_from", "observed_until" = EXCLUDED."observed_until",
      "s2_series" = EXCLUDED."s2_series", "s1_series" = EXCLUDED."s1_series",
      "features" = EXCLUDED."features", "feature_version" = EXCLUDED."feature_version",
      "processing_units" = EXCLUDED."processing_units",
      "last_processing_units" = EXCLUDED."last_processing_units", "source_id" = EXCLUDED."source_id",
      "reliability" = EXCLUDED."reliability", "computed_at" = EXCLUDED."computed_at"`;
}

const signatureSchema = z.object({
  parcel_id: z.string(),
  commune_code: z.string(),
  crop_code: z.string().nullable(),
  verified: z.boolean(),
  /** Dernière visite de terrain de la campagne sur la parcelle : CONFIRMED, CORRECTED, REJECTED. */
  visit_outcome: z.enum(["CONFIRMED", "CORRECTED", "REJECTED"]).nullable(),
  visited_at: z.date().nullable(),
  /** Dernière culture constatée sur place pendant la campagne, s'il y en a une. */
  observed_crop_code: z.string().nullable(),
  observed_at: z.date().nullable(),
  features: z.record(z.string(), z.number()),
  observed_until: z.date(),
  source_id: z.string(),
  computed_at: z.date(),
});

export type StoredSignature = z.infer<typeof signatureSchema>;

/**
 * Séries de la campagne à cette version des variables, avec la culture principale déclarée (déjà
 * corrigée par l'agent le cas échéant) et la dernière visite de terrain de la campagne.
 */
export async function signaturesForCampaign(
  campaignId: string,
  featureVersion: number,
): Promise<StoredSignature[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH main_crop AS (${mainCrop(campaignId)})
    SELECT s."parcel_id", co."code" AS commune_code, mc.crop_code,
           f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED') AS verified,
           v."outcome"::text AS visit_outcome, v."visited_at",
           o.crop_code AS observed_crop_code, o."observed_at",
           s."features", s."observed_until", s."source_id", s."computed_at"
      FROM "parcel_signature" s
      JOIN "agricultural_campaign" ac ON ac."id" = s."campaign_id"
      JOIN "parcel" p ON p."id" = s."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" co ON co."id" = f."commune_id"
      LEFT JOIN main_crop mc ON mc."parcel_id" = s."parcel_id"
      LEFT JOIN LATERAL (
        SELECT fv."outcome", fv."visited_at"
          FROM "farm_verification" fv
         WHERE fv."parcel_id" = s."parcel_id" AND fv."kind" = 'FIELD_VISIT'
           AND fv."visited_at" >= ac."starts_on"
         ORDER BY fv."visited_at" DESC
         LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT c."code" AS crop_code, pco."observed_at"
          FROM "parcel_crop_observation" pco
          JOIN "crop" c ON c."id" = pco."crop_id"
         WHERE pco."parcel_id" = s."parcel_id" AND pco."campaign_id" = s."campaign_id"
         ORDER BY pco."observed_at" DESC
         LIMIT 1
      ) o ON true
     WHERE s."campaign_id" = ${campaignId}::uuid AND s."feature_version" = ${featureVersion}`;
  return rows.map((row) => signatureSchema.parse(row));
}

export async function nextModelVersion(): Promise<number> {
  const rows = await prisma.$queryRaw<{ version: number | null }[]>`
    SELECT max("version") AS version FROM "crop_model"`;
  return (rows[0]?.version ?? 0) + 1;
}

export interface PredictionRow {
  parcelId: string;
  campaignId: string;
  modelId: string;
  cropGroup: string;
  cropCode: string | null;
  confidence: number;
  probabilities: Record<string, number>;
  declaredGroup: string | null;
  agreement: "AGREES" | "DIFFERS" | "UNCERTAIN";
  observedUntil: Date;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC";
  computedAt: Date;
}

/** Cultures mesurées, par lots d'une requête ; la culture du registre est retrouvée par son code. */
export async function upsertPredictions(rows: readonly PredictionRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    await prisma.$executeRaw`
      INSERT INTO "parcel_crop_prediction" (
        "id", "parcel_id", "campaign_id", "model_id", "crop_group", "crop_id", "confidence",
        "probabilities", "declared_group", "agreement", "observed_until", "source_id",
        "reliability", "computed_at"
      )
      SELECT gen_random_uuid(), t.parcel_id, t.campaign_id, t.model_id, t.crop_group, c."id",
             t.confidence, t.probabilities, t.declared_group,
             t.agreement::"PredictionAgreement", t.observed_until, t.source_id,
             t.reliability::"Reliability", t.computed_at
        FROM unnest(
          ${batch.map((r) => r.parcelId)}::uuid[],
          ${batch.map((r) => r.campaignId)}::uuid[],
          ${batch.map((r) => r.modelId)}::uuid[],
          ${batch.map((r) => r.cropGroup)}::text[],
          ${batch.map((r) => r.cropCode)}::text[],
          ${batch.map((r) => r.confidence)}::numeric[],
          ${batch.map((r) => JSON.stringify(r.probabilities))}::jsonb[],
          ${batch.map((r) => r.declaredGroup)}::text[],
          ${batch.map((r) => r.agreement)}::text[],
          ${batch.map((r) => r.observedUntil)}::date[],
          ${batch.map((r) => r.sourceId)}::text[],
          ${batch.map((r) => r.reliability)}::text[],
          ${batch.map((r) => r.computedAt)}::timestamp[]
        ) AS t(parcel_id, campaign_id, model_id, crop_group, crop_code, confidence,
               probabilities, declared_group, agreement, observed_until, source_id,
               reliability, computed_at)
        LEFT JOIN "crop" c ON c."code" = t.crop_code
      ON CONFLICT ("parcel_id", "campaign_id") DO UPDATE SET
        "model_id" = EXCLUDED."model_id", "crop_group" = EXCLUDED."crop_group",
        "crop_id" = EXCLUDED."crop_id", "confidence" = EXCLUDED."confidence",
        "probabilities" = EXCLUDED."probabilities", "declared_group" = EXCLUDED."declared_group",
        "agreement" = EXCLUDED."agreement", "observed_until" = EXCLUDED."observed_until",
        "source_id" = EXCLUDED."source_id", "reliability" = EXCLUDED."reliability",
        "computed_at" = EXCLUDED."computed_at"`;
  }
}

const parcelPredictionSchema = z.object({
  crop_group: z.string(),
  crop_id: z.string().nullable(),
  confidence: z.coerce.number(),
  declared_group: z.string().nullable(),
  agreement: z.enum(["AGREES", "DIFFERS", "UNCERTAIN"]),
  observed_until: z.date(),
  model_version: z.coerce.number(),
  visited_at: z.date().nullable(),
  outcome: z.enum(["CONFIRMED", "CORRECTED", "REJECTED"]).nullable(),
  observed_crop_code: z.string().nullable(),
  observed_at: z.date().nullable(),
});

/** Culture mesurée d'une parcelle pour la campagne ouverte, et sa dernière visite de terrain. */
export async function predictionForParcel(parcelId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT pr."crop_group", pr."crop_id", pr."confidence", pr."declared_group", pr."agreement",
           pr."observed_until", m."version" AS model_version,
           v."visited_at", v."outcome"::text AS outcome,
           o.crop_code AS observed_crop_code, o."observed_at"
      FROM "parcel_crop_prediction" pr
      JOIN "agricultural_campaign" ac ON ac."id" = pr."campaign_id" AND ac."status" = 'OPEN'
      JOIN "crop_model" m ON m."id" = pr."model_id"
      LEFT JOIN LATERAL (
        SELECT fv."visited_at", fv."outcome"
          FROM "farm_verification" fv
         WHERE fv."parcel_id" = pr."parcel_id" AND fv."kind" = 'FIELD_VISIT'
         ORDER BY fv."visited_at" DESC
         LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT c."code" AS crop_code, pco."observed_at"
          FROM "parcel_crop_observation" pco
          JOIN "crop" c ON c."id" = pco."crop_id"
         WHERE pco."parcel_id" = pr."parcel_id" AND pco."campaign_id" = pr."campaign_id"
         ORDER BY pco."observed_at" DESC
         LIMIT 1
      ) o ON true
     WHERE pr."parcel_id" = ${parcelId}::uuid
     LIMIT 1`;
  return rows[0] ? parcelPredictionSchema.parse(rows[0]) : null;
}

// --- Vue du ministère (ADR-0032) : accord, désaccords et surfaces mesurées ----------------------

const agreementSchema = z.object({
  declared_group: z.string().nullable(),
  agreement: z.enum(["AGREES", "DIFFERS", "UNCERTAIN"]),
  parcels: z.coerce.number(),
});

/** Parcelles mesurées par culture déclarée et par accord avec la déclaration. */
export async function predictionAgreementCounts(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT pr."declared_group", pr."agreement"::text AS agreement, count(*) AS parcels
      FROM "parcel_crop_prediction" pr
      JOIN "parcel" p ON p."id" = pr."parcel_id" AND p."archived_at" IS NULL
     WHERE pr."campaign_id" = ${campaignId}::uuid
     GROUP BY pr."declared_group", pr."agreement"`;
  return rows.map((row) => agreementSchema.parse(row));
}

const disagreementSchema = z.object({
  parcel_id: z.string(),
  parcel_code: z.string(),
  commune_name: z.string(),
  crop_group: z.string(),
  declared_group: z.string().nullable(),
  confidence: z.coerce.number(),
});

/** Parcelles vues autrement que déclarées, les plus sûres d'abord. Aucun nom de producteur. */
export async function listPredictionDisagreements(campaignId: string, limit: number) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT pr."parcel_id", p."code" AS parcel_code, co."name" AS commune_name, pr."crop_group",
           pr."declared_group", pr."confidence"
      FROM "parcel_crop_prediction" pr
      JOIN "parcel" p ON p."id" = pr."parcel_id" AND p."archived_at" IS NULL
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" co ON co."id" = f."commune_id"
     WHERE pr."campaign_id" = ${campaignId}::uuid AND pr."agreement" = 'DIFFERS'
     ORDER BY pr."confidence" DESC, p."code"
     LIMIT ${limit}`;
  return rows.map((row) => disagreementSchema.parse(row));
}

const measuredAreaSchema = z.object({
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  crop_group: z.string(),
  /** Surface de chaque parcelle comptée pour la probabilité de la culture. */
  weighted_ha: z.coerce.number(),
  /** Surface des parcelles dont c'est la culture mesurée. */
  classified_ha: z.coerce.number(),
  classified_parcels: z.coerce.number(),
  /** Surface des parcelles dont c'est la culture déclarée. */
  declared_ha: z.coerce.number(),
});

/**
 * Surfaces mesurées par commune et par culture : chaque parcelle compte pour sa surface relevée
 * (à défaut déclarée), répartie selon les probabilités du modèle.
 */
export async function measuredCropAreas(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH measured AS (
      SELECT f."commune_id", pr."crop_group", pr."declared_group", pr."probabilities",
             coalesce(p."computed_area_ha", p."declared_area_ha") AS area_ha
        FROM "parcel_crop_prediction" pr
        JOIN "parcel" p ON p."id" = pr."parcel_id" AND p."archived_at" IS NULL
        JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
       WHERE pr."campaign_id" = ${campaignId}::uuid
    )
    SELECT m."commune_id", co."code" AS commune_code, co."name" AS commune_name,
           prob.key AS crop_group,
           sum(m.area_ha * prob.value::numeric) AS weighted_ha,
           sum(CASE WHEN m."crop_group" = prob.key THEN m.area_ha ELSE 0 END) AS classified_ha,
           count(*) FILTER (WHERE m."crop_group" = prob.key) AS classified_parcels,
           sum(CASE WHEN m."declared_group" = prob.key THEN m.area_ha ELSE 0 END) AS declared_ha
      FROM measured m
      JOIN "commune" co ON co."id" = m."commune_id"
     CROSS JOIN LATERAL jsonb_each_text(m."probabilities") AS prob(key, value)
     GROUP BY m."commune_id", co."code", co."name", prob.key`;
  return rows.map((row) => measuredAreaSchema.parse(row));
}
