import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Surface brûlée des parcelles exposées (ADR-0038 §2) : mise en file des parcelles dont le contour
// est à moins de 500 m d'un feu, lecture de celles à mesurer, unités dépensées dans le mois.

const ALERT_CONFIDENCES = ["NOMINAL", "HIGH"];

/**
 * Met en file une mesure par parcelle exposée : contour relevé d'au moins 0,25 ha, à moins de
 * `exposureM` d'une détection de confiance nominale ou haute depuis `since`, dans la commune ou
 * l'exploitation donnée. Avec `realOnly`, les parcelles de démonstration (SYNTHETIC) sont écartées :
 * leur contour est inventé, même noté « relevé GPS ». Un contour relevé sur place par un agent fait
 * passer la parcelle en FIELD_VERIFIED ou AGENT_VERIFIED, et la rend mesurable. La détection la
 * plus proche est retenue ; une parcelle déjà en file pour ce feu est ignorée. Renvoie les
 * identifiants créés.
 */
export async function queueExposedParcels(options: {
  since: Date;
  exposureM: number;
  minAreaM2: number;
  measureAfterDays: number;
  expireDays: number;
  trigger: "ALERT" | "REQUEST";
  alertId?: string | null;
  requestedById?: string | null;
  communeId?: string | null;
  farmId?: string | null;
  realOnly: boolean;
}): Promise<string[]> {
  const scope = options.farmId
    ? Prisma.sql`f."id" = ${options.farmId}::uuid`
    : options.communeId
      ? Prisma.sql`f."commune_id" = ${options.communeId}::uuid`
      : Prisma.sql`false`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "burn_assessment" (
      "id", "parcel_id", "fire_detection_id", "fire_detected_at", "fire_distance_m", "trigger",
      "alert_id", "requested_by_id", "measure_after", "expires_at", "created_at", "updated_at")
    SELECT gen_random_uuid(), p."id", near."id", near."detected_at", round(near.dist)::int,
           ${options.trigger}::"BurnAssessmentTrigger",
           ${options.alertId ?? null}::uuid, ${options.requestedById ?? null}::uuid,
           near."detected_at" + make_interval(days => ${options.measureAfterDays}::int),
           near."detected_at" + make_interval(days => ${options.expireDays}::int),
           now(), now()
      FROM "parcel" p
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      CROSS JOIN LATERAL (
        SELECT d."id", d."detected_at", ST_Distance(p."geom", d."location") AS dist
          FROM "fire_detection" d
         WHERE d."detected_at" >= ${options.since}
           AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
           AND ST_DWithin(p."geom", d."location", ${options.exposureM})
         ORDER BY dist
         LIMIT 1
      ) near
     WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL
       AND ST_Area(p."geom") >= ${options.minAreaM2}
       AND (NOT ${options.realOnly} OR p."reliability" <> 'SYNTHETIC')
       AND ${scope}
    ON CONFLICT ("parcel_id", "fire_detected_at") DO NOTHING
    RETURNING "id"::text AS id`;
  return rows.map((row) => row.id);
}

/** Mesures arrivées à échéance sans avoir été faites : expirées. */
export async function expireBurnAssessments(now: Date): Promise<number> {
  return prisma.burnAssessment
    .updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    })
    .then((result) => result.count);
}

const candidateSchema = z.object({
  id: z.string(),
  parcel_id: z.string(),
  parcel_code: z.string(),
  farm_id: z.string(),
  fire_detected_at: z.date(),
  geometry: z.string(),
  latitude: z.coerce.number(),
  area_ha: z.coerce.number(),
});

export type BurnCandidate = z.infer<typeof candidateSchema>;

/** Mesures en attente dont la fenêtre d'après le feu est close, les plus anciennes d'abord. */
export async function burnCandidates(now: Date, limit: number): Promise<BurnCandidate[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT b."id"::text AS id, p."id"::text AS parcel_id, p."code" AS parcel_code,
           p."farm_id"::text AS farm_id, b."fire_detected_at",
           ST_AsGeoJSON(p."geom"::geometry) AS geometry,
           ST_Y(ST_Centroid(p."geom"::geometry)) AS latitude,
           ST_Area(p."geom") / 10000 AS area_ha
      FROM "burn_assessment" b
      JOIN "parcel" p ON p."id" = b."parcel_id" AND p."geom" IS NOT NULL
     WHERE b."status" = 'PENDING' AND b."measure_after" <= ${now} AND b."expires_at" > ${now}
     ORDER BY b."measure_after"
     LIMIT ${limit}`;
  return rows.map((row) => candidateSchema.parse(row));
}

/** Unités dépensées par les mesures de surface brûlée depuis `since`. */
export async function burnUnitsSince(since: Date): Promise<number> {
  const result = await prisma.burnAssessment.aggregate({
    where: { measuredAt: { gte: since } },
    _sum: { processingUnits: true },
  });
  return Number(result._sum.processingUnits ?? 0);
}
