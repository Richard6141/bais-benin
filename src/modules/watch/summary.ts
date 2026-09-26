import { prisma } from "@/database/client";
import { getAnalyticsFreshness } from "@/modules/analytics";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { fireFreshness, listFires } from "@/modules/fires";
import { communeAlertLevels, listAlertsForActor, type AlertSeverity } from "@/modules/monitoring";

// Centre de veille du ministère (ADR-0022) : une seule lecture qui résume la situation, relue
// par la page toutes les minutes. Feux des dernières 24 heures, alertes actives, foyers en
// attente de confirmation, volumes nationaux des demandes d'assistance (jamais une demande
// nominative : le ministère n'en lit que des agrégats) et fraîcheur des sources.

const HOUR = 3_600_000;
const FIRE_STALE_MS = 2 * HOUR;

export interface WatchSummary {
  generatedAt: string;
  fires: {
    last24h: number;
    communes: number;
    latest: Array<{ communeName: string; detectedAt: string; frpMw: number | null }>;
  };
  alerts: {
    active: number;
    bySeverity: Record<AlertSeverity, number>;
    items: Array<{
      id: string;
      title: string;
      communeName: string;
      severity: AlertSeverity;
      startsOn: string;
      awaitingConfirmation: boolean;
    }>;
  };
  heldOutbreaks: Array<{ id: string; title: string; communeName: string; startsOn: string }>;
  levels: Array<{ communeCode: string; severity: AlertSeverity; count: number }>;
  assistance: { received24h: number; received7d: number; waiting: number; resolved7d: number };
  freshness: Array<{ source: string; lastAt: string | null; state: "ok" | "stale" | "failed" }>;
}

export class WatchAccessError extends Error {}

export async function getWatchSummary(actor: Actor, now = new Date()): Promise<WatchSummary> {
  // Vue nationale : le ministère seulement.
  if (scopeFilter(actor, "alert.read").kind !== "all") {
    throw new WatchAccessError("Centre de veille réservé au ministère");
  }
  const [fires, alerts, levels, assistance, fireSource, analytics] = await Promise.all([
    listFires("24h", now),
    listAlertsForActor(actor, { status: "ACTIVE", limit: 200 }),
    communeAlertLevels(),
    assistanceVolumes(now),
    fireFreshness(),
    getAnalyticsFreshness(now),
  ]);
  const bySeverity: Record<AlertSeverity, number> = { INFO: 0, WATCH: 0, WARNING: 0, CRITICAL: 0 };
  for (const alert of alerts) bySeverity[alert.severity] += 1;
  const fireLast = fireSource.lastSuccessAt ? new Date(fireSource.lastSuccessAt) : null;

  return {
    generatedAt: now.toISOString(),
    fires: {
      last24h: fires.length,
      communes: new Set(fires.map((fire) => fire.communeName)).size,
      latest: fires.slice(0, 6).map((fire) => ({
        communeName: fire.communeName,
        detectedAt: fire.detectedAt,
        frpMw: fire.frpMw,
      })),
    },
    alerts: {
      active: alerts.length,
      bySeverity,
      items: alerts.slice(0, 8).map((alert) => ({
        id: alert.id,
        title: alert.title,
        communeName: alert.communeName,
        severity: alert.severity,
        startsOn: alert.startsOn,
        awaitingConfirmation: alert.awaitingConfirmation,
      })),
    },
    heldOutbreaks: alerts
      .filter((alert) => alert.awaitingConfirmation)
      .map((alert) => ({
        id: alert.id,
        title: alert.title,
        communeName: alert.communeName,
        startsOn: alert.startsOn,
      })),
    levels,
    assistance,
    freshness: [
      {
        source: "Feux actifs (NASA FIRMS)",
        lastAt: fireSource.lastSuccessAt,
        state:
          fireSource.lastStatus === "FAILED"
            ? "failed"
            : !fireLast || now.getTime() - fireLast.getTime() > FIRE_STALE_MS
              ? "stale"
              : "ok",
      },
      {
        source: "Météo (Open-Meteo)",
        lastAt: analytics.lastIngestionAt?.toISOString() ?? null,
        state: analytics.weatherStale ? "stale" : "ok",
      },
      {
        source: "Agrégats du tableau de bord",
        lastAt: analytics.aggregatesRefreshedAt?.toISOString() ?? null,
        state: analytics.aggregatesStale ? "stale" : "ok",
      },
    ],
  };
}

/** Volumes nationaux des demandes d'assistance : des nombres, jamais une demande. */
async function assistanceVolumes(now: Date): Promise<WatchSummary["assistance"]> {
  const day = new Date(now.getTime() - 24 * HOUR);
  const week = new Date(now.getTime() - 7 * 24 * HOUR);
  const [received24h, received7d, waiting, resolved7d] = await Promise.all([
    prisma.assistanceRequest.count({ where: { createdAt: { gte: day } } }),
    prisma.assistanceRequest.count({ where: { createdAt: { gte: week } } }),
    prisma.assistanceRequest.count({ where: { status: "RECEIVED" } }),
    prisma.assistanceRequest.count({ where: { resolvedAt: { gte: week } } }),
  ]);
  return { received24h, received7d, waiting, resolved7d };
}
