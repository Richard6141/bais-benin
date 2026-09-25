import {
  ANALYTICS_VIEWS,
  readRefreshTimes,
  readRegistryLastChange,
  refreshView,
  type ViewRefresh,
} from "@/database/sql/analytics-refresh.sql";
import { logger } from "@/lib/logger";
import { MonitoringBusyError, withMonitoringLock } from "@/modules/monitoring/lock";

// Rafraîchissement des vues d'agrégats du tableau de bord. Appelé par la tâche planifiée
// d'envoi (toutes les 10 minutes) et à la fin de la tâche quotidienne, jamais par la requête de
// synchronisation (le pic du matin enverrait des dizaines de lots). Un verrou consultatif évite
// deux rafraîchissements simultanés ; REFRESH … CONCURRENTLY ne bloque pas les lectures.

/** Au-delà, les vues sont rafraîchies même sans écriture détectée (horloge, correction en base). */
export const REFRESH_MAX_AGE_MS = 60 * 60 * 1000;

export type RefreshReason =
  "forced" | "never" | "changed" | "expired" | "fresh" | "busy" | "failed";

export interface AnalyticsRefreshResult {
  refreshed: boolean;
  reason: RefreshReason;
  views: ViewRefresh[];
}

async function refreshAll(): Promise<ViewRefresh[]> {
  const views: ViewRefresh[] = [];
  for (const view of ANALYTICS_VIEWS) views.push(await refreshView(view));
  return views;
}

/** Raison de rafraîchir, ou « fresh » : décision pure, testée sans base. */
export function refreshReason(input: {
  refreshedAt: Date | null;
  lastChange: Date | null;
  now: Date;
}): Exclude<RefreshReason, "forced" | "busy" | "failed"> {
  if (!input.refreshedAt) return "never";
  if (input.lastChange && input.lastChange > input.refreshedAt) return "changed";
  if (input.now.getTime() - input.refreshedAt.getTime() > REFRESH_MAX_AGE_MS) return "expired";
  return "fresh";
}

export async function refreshAnalyticsIfStale(
  options: { force?: boolean; now?: Date } = {},
): Promise<AnalyticsRefreshResult> {
  const now = options.now ?? new Date();
  let reason: RefreshReason = "forced";
  if (!options.force) {
    const [times, lastChange] = await Promise.all([readRefreshTimes(), readRegistryLastChange()]);
    const all = ANALYTICS_VIEWS.map((v) => times.get(v) ?? null);
    const refreshedAt = all.includes(null)
      ? null
      : (all as Date[]).reduce((a, b) => (a < b ? a : b));
    reason = refreshReason({ refreshedAt, lastChange, now });
    if (reason === "fresh") return { refreshed: false, reason, views: [] };
  }
  try {
    const views = await withMonitoringLock("analytics", refreshAll);
    logger.info({ reason, views }, "analytics.refresh");
    return { refreshed: true, reason, views };
  } catch (error) {
    if (error instanceof MonitoringBusyError)
      return { refreshed: false, reason: "busy", views: [] };
    throw error;
  }
}

/**
 * Variante des tâches planifiées : un échec du rafraîchissement est journalisé et rendu dans le
 * résultat, sans faire échouer l'envoi des alertes ni la tâche quotidienne.
 */
export async function refreshAnalyticsQuietly(now?: Date): Promise<AnalyticsRefreshResult> {
  try {
    return await refreshAnalyticsIfStale({ now });
  } catch (error) {
    logger.error({ err: error }, "analytics.refresh.failed");
    return { refreshed: false, reason: "failed", views: [] };
  }
}
