import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { scopedCommuneIds } from "@/modules/registry";
import { explainTrace, type TraceEntry } from "./rules";

// Lecture des alertes par rôle (monitoring §2.A-C). Le périmètre est appliqué en base :
// ministère = tout le territoire ; agent, coopérative = communes du périmètre ; producteur =
// communes de ses exploitations. Un foyer en attente de confirmation (ADR-0015) n'est montré
// qu'à ceux qui encadrent la diffusion (agent, ministère : droit alert.relay).

export type AlertSeverity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";
export type AlertCategory =
  | "WATER_STRESS"
  | "FLOOD"
  | "HEAT"
  | "PEST"
  | "CROP_DISEASE"
  | "ANIMAL_DISEASE"
  | "MARKET"
  | "ADMIN";

export interface AlertListItem {
  id: string;
  title: string;
  communeCode: string;
  communeName: string;
  severity: AlertSeverity;
  category: AlertCategory;
  status: string;
  message: string;
  advice: string;
  startsOn: string;
  endsOn: string | null;
  farmCount: number;
  hectares: number;
  source: string;
  sourceDate: string;
  reliability: string;
  readAt: string | null;
  /** Foyer pas encore diffusé aux producteurs : il attend la confirmation d'un agent. */
  awaitingConfirmation: boolean;
}

export interface AlertListFilters {
  status?: "ACTIVE" | "RECENT";
  severity?: AlertSeverity;
  category?: AlertCategory;
  communeCode?: string;
  limit?: number;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  WATCH: 2,
  INFO: 3,
};
const SOURCE_LABELS: Record<string, string> = {
  OPEN_METEO: "Open-Meteo",
  BAIS_SEED: "Données de démonstration",
};

/** Foyers retenus : visibles seulement de ceux qui encadrent la diffusion. */
function seesHeldAlerts(actor: Actor): boolean {
  return scopeFilter(actor, "alert.relay").kind !== "none";
}

function heldFilter(actor: Actor): Prisma.AlertWhereInput {
  return seesHeldAlerts(actor) ? {} : { awaitingConfirmation: false };
}

/** Communes visibles par l'acteur pour les alertes ; "all" pour le ministère. */
export async function alertCommuneIds(actor: Actor): Promise<"all" | string[]> {
  const filter = scopeFilter(actor, "alert.read");
  if (filter.kind === "all") return "all";
  if (filter.kind === "none") return [];
  if (filter.kind === "self") {
    const farms = await prisma.farm.findMany({
      where: { archivedAt: null, farmer: { userId: filter.userId } },
      select: { communeId: true },
    });
    return [...new Set(farms.map((f) => f.communeId))];
  }
  return scopedCommuneIds(actor);
}

const listSelect = {
  id: true,
  title: true,
  severity: true,
  category: true,
  status: true,
  messageFr: true,
  adviceFr: true,
  startsAt: true,
  endsAt: true,
  affectedFarmCount: true,
  affectedAreaHa: true,
  sourceId: true,
  sourceDate: true,
  reliability: true,
  awaitingConfirmation: true,
  commune: { select: { code: true, name: true } },
} satisfies Prisma.AlertSelect;

type ListRow = Prisma.AlertGetPayload<{ select: typeof listSelect }>;

function toItem(row: ListRow, readAt: Date | null): AlertListItem {
  return {
    id: row.id,
    title: row.title,
    communeCode: row.commune.code,
    communeName: row.commune.name,
    severity: row.severity,
    category: row.category,
    status: row.status,
    message: row.messageFr,
    advice: row.adviceFr,
    startsOn: row.startsAt.toISOString(),
    endsOn: row.endsAt?.toISOString() ?? null,
    farmCount: row.affectedFarmCount,
    hectares: Number(row.affectedAreaHa),
    source: SOURCE_LABELS[row.sourceId] ?? row.sourceId,
    sourceDate: row.sourceDate.toISOString(),
    reliability: row.reliability,
    readAt: readAt?.toISOString() ?? null,
    awaitingConfirmation: row.awaitingConfirmation,
  };
}

async function readMarks(userId: string, alertIds: string[]): Promise<Map<string, Date>> {
  if (alertIds.length === 0) return new Map();
  const rows = await prisma.alertRecipient.findMany({
    where: { userId, alertId: { in: alertIds }, acknowledgedAt: { not: null } },
    select: { alertId: true, acknowledgedAt: true },
  });
  return new Map(rows.map((r) => [r.alertId, r.acknowledgedAt as Date]));
}

export async function listAlertsForActor(
  actor: Actor,
  filters: AlertListFilters = {},
): Promise<AlertListItem[]> {
  const communes = await alertCommuneIds(actor);
  if (communes !== "all" && communes.length === 0) return [];
  const since = new Date(Date.now() - 30 * 86_400_000);
  const where: Prisma.AlertWhereInput = {
    ...heldFilter(actor),
    ...(communes === "all" ? {} : { communeId: { in: communes } }),
    ...(filters.status === "RECENT" ? { startsAt: { gte: since } } : { status: "ACTIVE" }),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.communeCode ? { commune: { code: filters.communeCode } } : {}),
  };
  const rows = await prisma.alert.findMany({
    where,
    select: listSelect,
    orderBy: { startsAt: "desc" },
    take: Math.min(filters.limit ?? 100, 500),
  });
  const marks = await readMarks(
    actor.userId,
    rows.map((r) => r.id),
  );
  return rows
    .map((row) => toItem(row, marks.get(row.id) ?? null))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.farmCount - a.farmCount,
    );
}

export interface DeliveryCount {
  channel: string;
  status: string;
  count: number;
}

export interface AlertDetail extends AlertListItem {
  ruleCode: string;
  ruleVersion: number;
  explanation: string[];
  indicators: Record<string, unknown>;
  delivery: DeliveryCount[] | null;
  resolvedReason: string | null;
}

// Fiche d'une alerte ; hors périmètre, null (la route répond 404). La diffusion détaillée n'est
// montrée qu'aux rôles qui encadrent (agent, ministère), jamais au producteur.
export async function getAlertDetail(actor: Actor, alertId: string): Promise<AlertDetail | null> {
  const row = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      ...listSelect,
      communeId: true,
      ruleVersion: true,
      indicators: true,
      trace: true,
      resolvedReason: true,
      rule: { select: { code: true } },
    },
  });
  if (!row || (row.awaitingConfirmation && !seesHeldAlerts(actor))) return null;
  const communes = await alertCommuneIds(actor);
  if (communes !== "all" && !communes.includes(row.communeId)) return null;
  const marks = await readMarks(actor.userId, [row.id]);
  const supervises = scopeFilter(actor, "alert.relay").kind !== "none";
  const delivery = supervises
    ? (
        await prisma.alertRecipient.groupBy({
          by: ["channel", "status"],
          where: { alertId },
          _count: { _all: true },
        })
      ).map((g) => ({ channel: g.channel, status: g.status, count: g._count._all }))
    : null;
  return {
    ...toItem(row, marks.get(row.id) ?? null),
    ruleCode: row.rule.code,
    ruleVersion: row.ruleVersion,
    explanation: explainTrace(row.trace as unknown as TraceEntry[]),
    indicators: row.indicators as Record<string, unknown>,
    delivery,
    resolvedReason: row.resolvedReason,
  };
}

export interface MonitoringOverview {
  activeBySeverity: Record<AlertSeverity, number>;
  communesInAlert: number;
  affectedFarms: number;
  affectedAreaHa: number;
  readRate: number | null;
  lastIngestion: {
    finishedAt: string | null;
    provider: string;
    fallback: boolean;
    status: string;
  } | null;
}

export async function getMonitoringOverview(actor: Actor): Promise<MonitoringOverview> {
  const communes = await alertCommuneIds(actor);
  const scope: Prisma.AlertWhereInput = {
    ...heldFilter(actor),
    ...(communes === "all" ? {} : { communeId: { in: communes } }),
  };
  const active = await prisma.alert.findMany({
    where: { ...scope, status: "ACTIVE" },
    select: {
      id: true,
      severity: true,
      communeId: true,
      affectedFarmCount: true,
      affectedAreaHa: true,
    },
  });
  const activeBySeverity: Record<AlertSeverity, number> = {
    INFO: 0,
    WATCH: 0,
    WARNING: 0,
    CRITICAL: 0,
  };
  for (const alert of active) activeBySeverity[alert.severity] += 1;
  const [recipients, read, lastRun] = await Promise.all([
    prisma.alertRecipient.count({
      where: { alertId: { in: active.map((a) => a.id) }, channel: { not: "RELAY" } },
    }),
    prisma.alertRecipient.count({
      where: { alertId: { in: active.map((a) => a.id) }, acknowledgedAt: { not: null } },
    }),
    prisma.ingestionRun.findFirst({
      where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  return {
    activeBySeverity,
    communesInAlert: new Set(active.map((a) => a.communeId)).size,
    affectedFarms: active.reduce((sum, a) => sum + a.affectedFarmCount, 0),
    affectedAreaHa: active.reduce((sum, a) => sum + Number(a.affectedAreaHa), 0),
    readRate: recipients === 0 ? null : read / recipients,
    lastIngestion: lastRun
      ? {
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          provider: lastRun.provider,
          fallback: lastRun.fallback,
          status: lastRun.status,
        }
      : null,
  };
}

/** Sévérité maximale active par commune (couche cartographique du centre d'alertes). */
export async function communeAlertLevels(): Promise<
  Array<{ communeCode: string; severity: AlertSeverity; count: number }>
> {
  const rows = await prisma.alert.findMany({
    where: { status: "ACTIVE" },
    select: { severity: true, commune: { select: { code: true } } },
  });
  const byCommune = new Map<string, { severity: AlertSeverity; count: number }>();
  for (const row of rows) {
    const current = byCommune.get(row.commune.code);
    if (!current) byCommune.set(row.commune.code, { severity: row.severity, count: 1 });
    else {
      current.count += 1;
      if (SEVERITY_ORDER[row.severity] < SEVERITY_ORDER[current.severity])
        current.severity = row.severity;
    }
  }
  return [...byCommune].map(([communeCode, v]) => ({ communeCode, ...v }));
}
