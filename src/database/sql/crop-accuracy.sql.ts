import { z } from "zod";
import { prisma } from "@/database/client";
import type { CropMapClassCode } from "./crop-areas.sql";

// Précision de la carte des cultures (ADR-0021) : parcelles des exploitations vérifiées, classe
// vue par satellite face à la culture déclarée, et comptes de la matrice de confusion.

const candidateSchema = z.object({
  parcel_id: z.string(),
  parcel_code: z.string(),
  crop_id: z.string(),
  crop_code: z.string(),
  verification_status: z.enum(["AGENT_VERIFIED", "FIELD_VERIFIED"]),
  zone_code: z.string().nullable(),
  latitude: z.coerce.number(),
  geometry: z.string(),
});

export type AccuracyCandidate = z.infer<typeof candidateSchema>;

/**
 * Parcelles relevées des exploitations vérifiées, culture principale de la campagne (la plus
 * grande surface) : jamais contrôlées d'abord, puis les contrôles les plus anciens, les visites
 * de terrain avant les vérifications au bureau. Chaque lot mensuel renouvelle ainsi l'échantillon.
 */
export async function listAccuracyCandidates(options: {
  campaignId: string;
  limit: number;
  /** Vrai pour une mesure réelle : les contrôles de démonstration passent en premier. */
  replaceSynthetic: boolean;
}): Promise<AccuracyCandidate[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH main_crop AS (
      SELECT DISTINCT ON (pc."parcel_id") pc."parcel_id", pc."crop_id"
        FROM "parcel_crop" pc
       WHERE pc."campaign_id" = ${options.campaignId}::uuid AND pc."archived_at" IS NULL
       ORDER BY pc."parcel_id", pc."area_ha" DESC, pc."id"
    )
    SELECT p."id" AS parcel_id, p."code" AS parcel_code, c."id" AS crop_id, c."code" AS crop_code,
           f."verification_status"::text AS verification_status, z."code" AS zone_code,
           ST_Y(ST_Centroid(p."geom"::geometry)) AS latitude,
           ST_AsGeoJSON(p."geom"::geometry, 6) AS geometry
      FROM main_crop mc
      JOIN "parcel" p ON p."id" = mc."parcel_id"
      JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "commune" co ON co."id" = f."commune_id"
      LEFT JOIN "agro_ecological_zone" z ON z."id" = co."agro_ecological_zone_id"
      JOIN "crop" c ON c."id" = mc."crop_id"
      LEFT JOIN "parcel_crop_class_check" k
             ON k."parcel_id" = p."id" AND k."campaign_id" = ${options.campaignId}::uuid
     WHERE p."archived_at" IS NULL AND f."archived_at" IS NULL AND p."geom" IS NOT NULL
       AND f."verification_status" IN ('AGENT_VERIFIED', 'FIELD_VERIFIED')
     ORDER BY (k."id" IS NULL OR (${options.replaceSynthetic} AND k."source_id" = 'BAIS_SEED')) DESC,
              k."computed_at" NULLS FIRST,
              (f."verification_status" = 'FIELD_VERIFIED') DESC, p."id"
     LIMIT ${options.limit}`;
  return rows.map((row) => candidateSchema.parse(row));
}

export interface CropClassCheckRow {
  parcelId: string;
  campaignId: string;
  cropId: string;
  declaredClass: CropMapClassCode;
  observedClass: CropMapClassCode;
  classPixels: number[];
  classifiedPixels: number;
  verificationStatus: "AGENT_VERIFIED" | "FIELD_VERIFIED";
  windowFrom: Date;
  windowTo: Date;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC";
  computedAt: Date;
}

export async function upsertCropClassCheck(row: CropClassCheckRow): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "parcel_crop_class_check" (
      "id", "parcel_id", "campaign_id", "crop_id", "declared_class", "observed_class",
      "class_pixels", "classified_pixels", "verification_status", "window_from", "window_to",
      "source_id", "reliability", "computed_at"
    ) VALUES (
      gen_random_uuid(), ${row.parcelId}::uuid, ${row.campaignId}::uuid, ${row.cropId}::uuid,
      ${row.declaredClass}::"CropMapClass", ${row.observedClass}::"CropMapClass",
      ${JSON.stringify(row.classPixels)}::jsonb, ${row.classifiedPixels},
      ${row.verificationStatus}::"VerificationStatus", ${row.windowFrom}::date,
      ${row.windowTo}::date, ${row.sourceId}, ${row.reliability}::"Reliability",
      ${row.computedAt}::timestamp
    )
    ON CONFLICT ("parcel_id", "campaign_id") DO UPDATE SET
      "crop_id" = EXCLUDED."crop_id", "declared_class" = EXCLUDED."declared_class",
      "observed_class" = EXCLUDED."observed_class", "class_pixels" = EXCLUDED."class_pixels",
      "classified_pixels" = EXCLUDED."classified_pixels",
      "verification_status" = EXCLUDED."verification_status",
      "window_from" = EXCLUDED."window_from", "window_to" = EXCLUDED."window_to",
      "source_id" = EXCLUDED."source_id", "reliability" = EXCLUDED."reliability",
      "computed_at" = EXCLUDED."computed_at"`;
}

const countSchema = z.object({
  declared_class: z.string(),
  observed_class: z.string(),
  verification_status: z.string(),
  source_id: z.string(),
  count: z.coerce.number(),
  last_computed_at: z.date(),
});

/** Comptes de la matrice de confusion de la campagne, par statut de vérification et source. */
export async function cropClassCheckCounts(campaignId: string) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT "declared_class"::text AS declared_class, "observed_class"::text AS observed_class,
           "verification_status"::text AS verification_status, "source_id",
           count(*) AS count, max("computed_at") AS last_computed_at
      FROM "parcel_crop_class_check"
     WHERE "campaign_id" = ${campaignId}::uuid
     GROUP BY 1, 2, 3, 4`;
  return rows.map((row) => countSchema.parse(row));
}
