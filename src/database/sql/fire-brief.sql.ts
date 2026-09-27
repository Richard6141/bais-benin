import { z } from "zod";
import { prisma } from "@/database/client";

// Fiche courte d'un feu détecté (ADR-0022, chantier K) : exploitations à moins de 500 m et de
// 1 km, cultures déclarées concernées. Un seul passage à 1 km (le plus large des deux rayons)
// donne les deux comptes, la distance minimale par exploitation servant à les répartir.

export const FIRE_BRIEF_NEAR_RADIUS_M = 500;
export const FIRE_BRIEF_FAR_RADIUS_M = 1000;

const nearFarmRow = z.object({ farm_id: z.string(), distance_m: z.coerce.number() });

export interface NearFarm {
  farmId: string;
  distanceM: number;
}

/** Exploitations dont une parcelle est à moins de `FIRE_BRIEF_FAR_RADIUS_M` du feu, avec la
 * distance de leur parcelle la plus proche. Vide si le feu n'existe pas. */
export async function farmsNearFireDetection(fireId: string): Promise<NearFarm[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."id"::text AS farm_id,
           MIN(ST_Distance(COALESCE(p."geom"::geography, p."centroid"::geography), d."location"))
             AS distance_m
    FROM "fire_detection" d
    JOIN "parcel" p
      ON p."archived_at" IS NULL
     AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location",
                    ${FIRE_BRIEF_FAR_RADIUS_M}::float8)
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    WHERE d."id" = ${fireId}::uuid
    GROUP BY f."id"`;
  return rows.map((raw) => {
    const row = nearFarmRow.parse(raw);
    return { farmId: row.farm_id, distanceM: row.distance_m };
  });
}

/** Cultures déclarées de la campagne ouverte, distinctes, pour ces exploitations. */
export async function cropsDeclaredByFarms(farmIds: readonly string[]): Promise<string[]> {
  if (farmIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ name_fr: string }[]>`
    SELECT DISTINCT c."name_fr"
    FROM "parcel_crop" pc
    JOIN "crop" c ON c."id" = pc."crop_id"
    JOIN "agricultural_campaign" camp ON camp."id" = pc."campaign_id" AND camp."status" = 'OPEN'
    JOIN "parcel" p ON p."id" = pc."parcel_id" AND p."archived_at" IS NULL
    WHERE pc."archived_at" IS NULL AND p."farm_id" = ANY(${farmIds as string[]}::uuid[])
    ORDER BY c."name_fr"`;
  return rows.map((row) => row.name_fr);
}

/** Destinataires de l'alerte parmi ces exploitations dont l'envoi a abouti (parti, livré ou lu). */
export async function notifiedFarmsCount(
  alertId: string,
  farmIds: readonly string[],
): Promise<number> {
  if (farmIds.length === 0) return 0;
  const result = await prisma.alertRecipient.groupBy({
    by: ["farmId"],
    where: {
      alertId,
      farmId: { in: [...farmIds] },
      status: { in: ["SENT", "DELIVERED", "READ"] },
    },
  });
  return result.length;
}
