import { z } from "zod";
import { prisma } from "@/database/client";

// Volumes et délais des demandes d'assistance par commune, sur une période : nombre de demandes,
// réparties par statut, et délais médians en heures entre la réception et la prise en charge,
// puis la résolution. Les communes sans demande n'apparaissent pas.

const row = z.object({
  commune_id: z.string(),
  commune_code: z.string(),
  commune_name: z.string(),
  total: z.coerce.number(),
  received: z.coerce.number(),
  in_progress: z.coerce.number(),
  resolved: z.coerce.number(),
  median_hours_to_take: z.coerce.number().nullable(),
  median_hours_to_resolve: z.coerce.number().nullable(),
});

export type AssistanceStatsRow = z.infer<typeof row>;

export async function readAssistanceStats(
  since: Date,
  communeIds: readonly string[] | null,
): Promise<AssistanceStatsRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id"::text AS commune_id, c."code" AS commune_code, c."name" AS commune_name,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE r."status" = 'RECEIVED') AS received,
           COUNT(*) FILTER (WHERE r."status" = 'IN_PROGRESS') AS in_progress,
           COUNT(*) FILTER (WHERE r."status" = 'RESOLVED') AS resolved,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (r."taken_at" - r."created_at")) / 3600
           ) FILTER (WHERE r."taken_at" IS NOT NULL) AS median_hours_to_take,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (r."resolved_at" - r."created_at")) / 3600
           ) FILTER (WHERE r."resolved_at" IS NOT NULL) AS median_hours_to_resolve
    FROM "assistance_request" r
    JOIN "commune" c ON c."id" = r."commune_id"
    WHERE r."created_at" >= ${since}
      AND (${communeIds === null} OR r."commune_id" = ANY(${(communeIds ?? []) as string[]}::uuid[]))
    GROUP BY c."id", c."code", c."name"
    ORDER BY total DESC, c."name"`;
  return rows.map((raw) => row.parse(raw));
}
