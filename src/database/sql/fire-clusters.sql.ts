import { z } from "zod";
import { prisma } from "@/database/client";
import { FIRE_RADIUS_M } from "./fires.sql";

// Foyers de feux et densité de saison (ADR-0038), à côté des requêtes de feux de l'ADR-0022.
// Un foyer réunit les détections à moins de 750 m l'une de l'autre, quel que soit le passage :
// le même feu vu à 1 h 30 puis à 13 h 30 compte une fois.

/** Confiances retenues pour les alertes, comme fires.sql.ts (une détection faible ne compte pas). */
const ALERT_CONFIDENCES = ["NOMINAL", "HIGH"];
/** Deux détections plus proches que deux pixels VIIRS appartiennent au même foyer. */
export const SAME_FOYER_DISTANCE_M = 750;
/**
 * Feu à moins de 500 m d'une parcelle : gravité CRITICAL pour l'exploitation (chantier K). Un
 * producteur dans ce cas reçoit toujours le message d'une alerte qui en remplace une autre.
 */
export const CLOSE_FIRE_M = 500;

const foyerRow = z.object({ commune_id: z.string(), foyers: z.coerce.number() });

/**
 * Par commune : foyers distincts détectés depuis `since` (confiance nominale ou haute) à moins de
 * 1 km d'une parcelle active d'une exploitation active de la commune (fire_count_near_parcels).
 */
export async function fireFoyersNearParcelsByCommune(
  communeIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (communeIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH near AS (
      SELECT DISTINCT f."commune_id", d."id", d."location"
        FROM "fire_detection" d
        JOIN "parcel" p
          ON p."archived_at" IS NULL
         AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                        ${FIRE_RADIUS_M})
        JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
       WHERE d."detected_at" >= ${since}
         AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
         AND f."commune_id" = ANY(${communeIds as string[]}::uuid[])
    ), grouped AS (
      SELECT "commune_id",
             ST_ClusterDBSCAN(ST_Transform("location"::geometry, 32631),
                              eps := ${SAME_FOYER_DISTANCE_M}, minpoints := 1)
               OVER (PARTITION BY "commune_id") AS foyer
        FROM near
    )
    SELECT "commune_id"::text AS commune_id, COUNT(DISTINCT foyer) AS foyers
      FROM grouped
     GROUP BY "commune_id"`;
  return new Map(rows.map((raw) => foyerRow.parse(raw)).map((r) => [r.commune_id, r.foyers]));
}

/** Exploitations d'une commune dont une parcelle est à moins de 500 m d'un feu depuis `since`. */
export async function farmsWithCloseFire(communeId: string, since: Date): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ farm_id: string }[]>`
    SELECT DISTINCT f."id"::text AS farm_id
      FROM "farm" f
      JOIN "parcel" p ON p."farm_id" = f."id" AND p."archived_at" IS NULL
      JOIN "fire_detection" d
        ON d."detected_at" >= ${since}
       AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
       AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                      ${CLOSE_FIRE_M})
     WHERE f."archived_at" IS NULL AND f."commune_id" = ${communeId}::uuid`;
  return new Set(rows.map((row) => row.farm_id));
}

const densityRow = z.object({
  commune_id: z.string(),
  commune_name: z.string(),
  area_km2: z.coerce.number(),
  detections: z.coerce.number(),
});

/**
 * Détections de confiance nominale ou haute par commune entre `from` et `to`, avec la surface de
 * la commune : densité de feux d'une saison (prévention, ADR-0038 §3). Toutes les communes, même
 * sans feu.
 */
export async function fireDetectionsByCommune(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id"::text AS commune_id, c."name" AS commune_name,
           ST_Area(c."geom") / 1e6 AS area_km2,
           COUNT(d."id") AS detections
      FROM "commune" c
      LEFT JOIN "fire_detection" d
        ON d."commune_id" = c."id"
       AND d."detected_at" >= ${from} AND d."detected_at" < ${to}
       AND d."confidence"::text = ANY(${ALERT_CONFIDENCES})
     WHERE c."archived_at" IS NULL AND c."geom" IS NOT NULL
     GROUP BY c."id", c."name"`;
  return rows.map((raw) => densityRow.parse(raw));
}

/**
 * Mois (heure du Bénin) où au moins un feu est en base entre `from` et `to` : une saison sèche
 * est complète quand ses six mois le sont. Chaque mois de saison sèche compte des milliers de
 * détections au Bénin ; un mois vide dit que la saison n'a pas été lue, pas qu'il n'y a pas eu
 * de feu. Une saison importée puis une lecture en continu laissent un trou entre les deux : la
 * plus ancienne détection ne suffit donc pas.
 */
export async function monthsWithFires(from: Date, to: Date): Promise<number> {
  const [row] = await prisma.$queryRaw<{ months: bigint }[]>`
    SELECT COUNT(DISTINCT date_trunc('month', "detected_at" + interval '1 hour')) AS months
      FROM "fire_detection"
     WHERE "detected_at" >= ${from} AND "detected_at" < ${to}`;
  return Number(row?.months ?? 0);
}
