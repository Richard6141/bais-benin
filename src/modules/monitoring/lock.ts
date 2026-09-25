import { prisma } from "@/database/client";

// Exclusion mutuelle des tâches planifiées du monitoring. Un verrou consultatif PostgreSQL de
// niveau transaction est pris par une transaction ouverte le temps de la tâche : il tient quel
// que soit le nombre d'instances de l'application, et se libère seul si le processus meurt.
// La tâche elle-même utilise d'autres connexions du pool.

export const MONITORING_LOCKS = {
  daily: 740_101,
  dispatch: 740_102,
} as const;

export type MonitoringLock = keyof typeof MONITORING_LOCKS;

export class MonitoringBusyError extends Error {
  constructor(readonly lock: MonitoringLock) {
    super(`Une exécution « ${lock} » est déjà en cours`);
    this.name = "MonitoringBusyError";
  }
}

export async function withMonitoringLock<T>(
  lock: MonitoringLock,
  task: () => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${MONITORING_LOCKS[lock]}::bigint) AS locked`;
      if (!rows[0]?.locked) throw new MonitoringBusyError(lock);
      result = await task();
    },
    { maxWait: 10_000, timeout: 290_000 },
  );
  return result as T;
}
