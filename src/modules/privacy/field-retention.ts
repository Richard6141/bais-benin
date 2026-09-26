import { prisma } from "@/database/client";
import { ROLLING_PERIOD, recentPeriods } from "@/modules/satellite/periods";

// Durées de conservation des données des phases 0 à 2 (revue de sécurité R3), fixées par défaut
// dans le registre des traitements (docs/recherche/registre-des-traitements.md). Le ministère peut
// les ajuster : chaque durée est une constante de ce fichier, reprise telle quelle par le
// registre. Purges idempotentes, lancées avec les autres par runRetentionPurge (`pnpm db:purge`).

const DAY_MS = 86_400_000;

/** Signalements de terrain (description, position précise) : 3 ans après leur dépôt. */
export const FIELD_REPORT_RETENTION_DAYS = 3 * 365;
/** Photos des signalements : 1 an après le dépôt ; le signalement lui-même reste. */
export const FIELD_REPORT_PHOTO_RETENTION_DAYS = 365;
/** Demandes d'assistance : 3 ans après leur résolution ; une demande ouverte n'expire pas. */
export const ASSISTANCE_RETENTION_DAYS = 3 * 365;

function before(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export async function purgeFieldReportPhotos(
  now: Date = new Date(),
  retentionDays: number = FIELD_REPORT_PHOTO_RETENTION_DAYS,
): Promise<number> {
  const result = await prisma.fieldReportPhoto.deleteMany({
    where: { report: { createdAt: { lt: before(now, retentionDays) } } },
  });
  return result.count;
}

/** Supprime les signalements déposés depuis plus de 3 ans (leur photo suit en cascade). */
export async function purgeFieldReports(
  now: Date = new Date(),
  retentionDays: number = FIELD_REPORT_RETENTION_DAYS,
): Promise<number> {
  const result = await prisma.fieldReport.deleteMany({
    where: { createdAt: { lt: before(now, retentionDays) } },
  });
  return result.count;
}

export async function purgeResolvedAssistanceRequests(
  now: Date = new Date(),
  retentionDays: number = ASSISTANCE_RETENTION_DAYS,
): Promise<number> {
  const result = await prisma.assistanceRequest.deleteMany({
    where: { status: "RESOLVED", resolvedAt: { lt: before(now, retentionDays) } },
  });
  return result.count;
}

/**
 * Lauréats d'un palmarès retiré par le ministère : conservés jusqu'au retrait seulement. Le retrait
 * les supprime déjà ; cette purge couvre les palmarès retirés auparavant. Le retrait de l'accord
 * supprime, lui, les lignes du producteur au moment même (setRankingConsent).
 */
export async function purgeWithdrawnRankingEntries(): Promise<number> {
  const result = await prisma.publishedRankingEntry.deleteMany({
    where: { ranking: { withdrawnAt: { not: null } } },
  });
  return result.count;
}

/** Images satellite en cache des mois sortis de la fenêtre proposée (12 mois et 60 jours). */
export async function purgeSatelliteTilesOutsideWindow(now: Date = new Date()): Promise<number> {
  const offered = [...recentPeriods(now), ROLLING_PERIOD];
  const result = await prisma.satelliteTile.deleteMany({ where: { period: { notIn: offered } } });
  return result.count;
}
