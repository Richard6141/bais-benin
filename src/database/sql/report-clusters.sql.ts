import { z } from "zod";
import { prisma } from "@/database/client";

// Regroupements de signalements de terrain (ADR-0015). Pour chaque signalement d'une commune,
// dans la fenêtre de temps, on compte les producteurs distincts dont une exploitation a signalé
// le même type de problème à moins du rayon donné (lui compris) ; la valeur de la commune est le
// plus grand de ces comptes. Producteurs et non exploitations : un producteur peut déclarer
// lui-même plusieurs exploitations, il ne doit jamais pouvoir lever seul une alerte diffusée à
// toute la commune. Un signalement écarté après visite ne compte jamais. L'index GiST sur
// field_report.location sert ST_DWithin.

export interface ClusterQuery {
  type: "PEST" | "CROP_DISEASE" | "ANIMAL_DISEASE" | "OTHER";
  radiusKm: number;
  days: number;
  confirmedOnly?: boolean;
  /** Fin de la fenêtre, exclue : lendemain de la date de référence à minuit (UTC). */
  until: Date;
  communeIds: readonly string[];
}

const row = z.object({ commune_id: z.string(), producers: z.coerce.number() });

export async function readReportClusters(query: ClusterQuery): Promise<Map<string, number>> {
  if (query.communeIds.length === 0) return new Map();
  const since = new Date(query.until.getTime() - query.days * 86_400_000);
  const statuses = query.confirmedOnly ? ["CONFIRMED"] : ["SUBMITTED", "CONFIRMED"];
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT r1."commune_id"::text AS commune_id, MAX(near.producers) AS producers
    FROM "field_report" r1
    CROSS JOIN LATERAL (
      SELECT COUNT(DISTINCT f2."farmer_id") AS producers
      FROM "field_report" r2
      JOIN "farm" f2 ON f2."id" = r2."farm_id"
      WHERE r2."type" = r1."type"
        AND r2."location" IS NOT NULL
        AND r2."status"::text = ANY(${statuses})
        AND r2."observed_at" >= ${since} AND r2."observed_at" < ${query.until}
        AND ST_DWithin(r2."location", r1."location", ${query.radiusKm * 1000})
    ) near
    WHERE r1."type"::text = ${query.type}
      AND r1."location" IS NOT NULL
      AND r1."status"::text = ANY(${statuses})
      AND r1."observed_at" >= ${since} AND r1."observed_at" < ${query.until}
      AND r1."commune_id" = ANY(${query.communeIds as string[]}::uuid[])
    GROUP BY r1."commune_id"`;
  return new Map(rows.map((raw) => row.parse(raw)).map((r) => [r.commune_id, r.producers]));
}

/**
 * Communes où un regroupement peut désormais atteindre ces signalements : celles des
 * signalements situés à moins de `radiusKm` d'eux. Sert à réévaluer tout de suite les communes
 * voisines quand un signalement arrive.
 */
export async function communesNearReports(
  reportIds: readonly string[],
  radiusKm: number,
): Promise<string[]> {
  if (reportIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ commune_id: string }[]>`
    SELECT DISTINCT other."commune_id"::text AS commune_id
    FROM "field_report" fresh
    JOIN "field_report" other
      ON other."location" IS NOT NULL
     AND ST_DWithin(other."location", fresh."location", ${radiusKm * 1000})
    WHERE fresh."id" = ANY(${reportIds as string[]}::uuid[]) AND fresh."location" IS NOT NULL
    UNION
    SELECT fresh."commune_id"::text FROM "field_report" fresh
    WHERE fresh."id" = ANY(${reportIds as string[]}::uuid[])`;
  return rows.map((r) => r.commune_id);
}
