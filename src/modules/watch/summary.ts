import { prisma } from "@/database/client";
import {
  fireExposureByCommune,
  reportGroups,
  type FireExposureRow,
} from "@/database/sql/watch.sql";
import { K_ANONYMITY, getAnalyticsFreshness, getCropCondition } from "@/modules/analytics";
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
    last7d: number;
    communes: number;
  };
  /** Communes où des feux ont touché les abords de parcelles enregistrées (moins de 1 km). */
  exposure: Record<"24h" | "7d", FireExposureRow[]>;
  /** Signalements des 7 derniers jours groupés par commune et type (deux au moins). */
  reportGroups: Array<{
    communeName: string;
    type: string;
    reports: number;
    producers: number;
    confirmed: number;
    lastAt: string;
  }>;
  /** Cultures dont la part de surface en état « faible » est la plus haute (vue du satellite). */
  cropCondition: {
    campaignCode: string;
    demo: boolean;
    worst: Array<{ code: string; name: string; poorShare: number; observedHa: number }>;
  } | null;
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
  const day = new Date(now.getTime() - 24 * HOUR);
  const week = new Date(now.getTime() - 7 * 24 * HOUR);
  const [fires, fires7d, alerts, levels, assistance, fireSource, analytics] = await Promise.all([
    listFires("24h", now),
    prisma.fireDetection.count({ where: { detectedAt: { gte: week } } }),
    listAlertsForActor(actor, { status: "ACTIVE", limit: 200 }),
    communeAlertLevels(),
    assistanceVolumes(now),
    fireFreshness(),
    getAnalyticsFreshness(now),
  ]);
  const [exposure24h, exposure7d, groups, condition] = await Promise.all([
    fireExposureByCommune(day),
    fireExposureByCommune(week),
    reportGroups(week),
    worstCropCondition(actor),
  ]);
  const bySeverity: Record<AlertSeverity, number> = { INFO: 0, WATCH: 0, WARNING: 0, CRITICAL: 0 };
  for (const alert of alerts) bySeverity[alert.severity] += 1;
  const fireLast = fireSource.lastSuccessAt ? new Date(fireSource.lastSuccessAt) : null;

  return {
    generatedAt: now.toISOString(),
    fires: {
      last24h: fires.length,
      last7d: fires7d,
      communes: new Set(fires.map((fire) => fire.communeName)).size,
    },
    exposure: { "24h": exposure24h, "7d": exposure7d },
    reportGroups: groups.map((group) => ({
      communeName: group.commune_name,
      type: group.type,
      reports: group.reports,
      producers: group.producers,
      confirmed: group.confirmed,
      lastAt: group.last_at.toISOString(),
    })),
    cropCondition: condition,
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

/**
 * Les trois cultures dont la part de surface observée en état « faible » est la plus haute,
 * d'après l'état des cultures de la campagne en cours (getCropCondition). Une culture observée
 * sur moins de 5 parcelles n'est pas citée (secret statistique). Null si l'état des cultures
 * n'est pas disponible (aucune campagne, aucun contrôle) : l'encart l'indique sans bloquer la page.
 */
async function worstCropCondition(actor: Actor): Promise<WatchSummary["cropCondition"]> {
  try {
    const condition = await getCropCondition(actor);
    const worst = condition.crops
      .filter((crop) => crop.national.poorShare !== null && crop.national.parcels >= K_ANONYMITY)
      .map((crop) => ({
        code: crop.code,
        name: crop.name,
        poorShare: crop.national.poorShare as number,
        observedHa: crop.national.areaHa - crop.national.byClass.UNOBSERVED.areaHa,
      }))
      .sort((a, b) => b.poorShare - a.poorShare)
      .slice(0, 3);
    return { campaignCode: condition.campaign.code, demo: condition.demo, worst };
  } catch {
    return null;
  }
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
