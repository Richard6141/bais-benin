import { z } from "zod";
import { prisma } from "@/database/client";
import { logger } from "@/lib/logger";

const versionRow = z.object({
  postgres: z.string(),
  postgis: z.string().nullable(),
});

export type DatabaseHealth =
  | { status: "up"; postgresVersion: string; postgisVersion: string | null; latencyMs: number }
  | { status: "down"; reason: string };

// Vérifie la connexion et la présence de PostGIS. Utilisée par la page d'accueil
// et par /api/health : c'est le premier signal qu'un déploiement est sain.
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  try {
    const rows = await prisma.$queryRaw<unknown[]>`
      SELECT
        split_part(version(), ' ', 2) AS postgres,
        (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis
    `;
    const row = versionRow.parse(rows[0]);
    return {
      status: "up",
      postgresVersion: row.postgres,
      postgisVersion: row.postgis,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    // D : le message d'origine (hôte, port, utilisateur de la base) reste dans les journaux.
    logger.error({ err: error }, "Base de données injoignable");
    return { status: "down", reason: "Base de données injoignable" };
  }
}
