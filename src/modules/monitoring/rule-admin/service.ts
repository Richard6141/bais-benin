import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import {
  SHORT_MESSAGE_MAX,
  parseRuleDefinition,
  renderMessage,
  ruleSchema,
  type IndicatorValues,
  type RuleNode,
} from "@/modules/monitoring/rules";
import {
  applyThresholds,
  diffRules,
  validateBounds,
  type RuleChange,
  type RuleSnapshot,
} from "./thresholds";

// Gouvernance des règles d'alerte (monitoring-parcours-ux §2.C4-C5), réservée au ministère.
// Une règle est identifiée par son code de base (« FLOOD_RISK ») ; chaque modification crée une
// nouvelle version, l'ancienne reste consultable et est désactivée. Une seule version active
// par code. Toute action est journalisée (rule.toggled, rule.updated avec la liste des écarts).

export class RuleAdminError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID"
      | "REASON_REQUIRED"
      | "CONFIRMATION_REQUIRED"
      | "CONFLICT",
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "RuleAdminError";
  }
}

// Droit du rôle, et double authentification active : la gouvernance des règles agit sur les
// alertes de tout le pays, elle est protégée même quand elle est appelée par l'API.
async function requireRight(actor: Actor, action: "rule.manage" | "rule.simulate") {
  const decision = authorize(actor, action, {});
  if (!decision.allowed) throw new RuleAdminError("FORBIDDEN", decision.reason);
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled) {
    throw new RuleAdminError(
      "FORBIDDEN",
      "La double authentification est requise pour gérer les règles",
    );
  }
}

type RuleRow = Awaited<ReturnType<typeof prisma.rule.findFirstOrThrow>>;

/** Version active d'un code, ou la plus récente si aucune n'est active. */
export async function currentVersion(code: string): Promise<RuleRow> {
  const rule =
    (await prisma.rule.findFirst({
      where: { code, enabled: true },
      orderBy: { version: "desc" },
    })) ?? (await prisma.rule.findFirst({ where: { code }, orderBy: { version: "desc" } }));
  if (!rule) throw new RuleAdminError("NOT_FOUND", `Règle « ${code} » introuvable`);
  return rule;
}

export interface RuleListItem {
  code: string;
  id: string;
  version: number;
  name: string;
  severity: string;
  category: string;
  enabled: boolean;
  cooldownHours: number;
  alertsLast30Days: number;
  lastEvaluatedAt: Date | null;
}

export async function listRules(actor: Actor, now = new Date()): Promise<RuleListItem[]> {
  await requireRight(actor, "rule.manage");
  const rules = await prisma.rule.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
  const byCode = new Map<string, RuleRow>();
  for (const rule of rules) {
    const kept = byCode.get(rule.code);
    if (!kept || (!kept.enabled && rule.enabled)) byCode.set(rule.code, rule);
  }
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [alerts, evaluations] = await Promise.all([
    prisma.alert.groupBy({
      by: ["ruleId"],
      where: { startsAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.ruleEvaluation.groupBy({
      by: ["ruleId"],
      where: { simulationId: null },
      _max: { evaluatedAt: true },
    }),
  ]);
  const codeOf = new Map(rules.map((r) => [r.id, r.code]));
  const alertCount = new Map<string, number>();
  for (const row of alerts) {
    const code = codeOf.get(row.ruleId);
    if (code) alertCount.set(code, (alertCount.get(code) ?? 0) + row._count._all);
  }
  const lastEval = new Map<string, Date>();
  for (const row of evaluations) {
    const code = codeOf.get(row.ruleId);
    const at = row._max.evaluatedAt;
    if (code && at && (!lastEval.get(code) || at > lastEval.get(code)!)) lastEval.set(code, at);
  }
  return [...byCode.values()].map((rule) => ({
    code: rule.code,
    id: rule.id,
    version: rule.version,
    name: rule.name,
    severity: rule.severity,
    category: rule.category,
    enabled: rule.enabled,
    cooldownHours: rule.cooldownHours,
    alertsLast30Days: alertCount.get(rule.code) ?? 0,
    lastEvaluatedAt: lastEval.get(rule.code) ?? null,
  }));
}

export interface RuleHistory {
  current: RuleRow;
  versions: Array<{
    id: string;
    version: number;
    enabled: boolean;
    createdAt: Date;
    createdByName: string | null;
  }>;
  journal: Array<{ action: string; occurredAt: Date; actorName: string | null; details: unknown }>;
}

export async function getRuleHistory(actor: Actor, code: string): Promise<RuleHistory> {
  await requireRight(actor, "rule.manage");
  const current = await currentVersion(code);
  const versions = await prisma.rule.findMany({ where: { code }, orderBy: { version: "desc" } });
  const authorIds = [
    ...new Set(versions.map((v) => v.createdById).filter((id): id is string => Boolean(id))),
  ];
  const authors = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  const journal = await prisma.auditLog.findMany({
    where: { resourceType: "rule", resourceId: code },
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
  return {
    current,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      enabled: v.enabled,
      createdAt: v.createdAt,
      createdByName: v.createdById ? (authors.get(v.createdById) ?? null) : null,
    })),
    journal: journal.map((entry) => ({
      action: entry.action,
      occurredAt: entry.occurredAt,
      actorName: entry.actor?.name ?? null,
      details: entry.details,
    })),
  };
}

export interface ToggleInput {
  code: string;
  enabled: boolean;
  reason?: string;
  /** Confirmation explicite, exigée pour désactiver une règle CRITICAL. */
  confirmed?: boolean;
}

export async function toggleRule(actor: Actor, input: ToggleInput) {
  await requireRight(actor, "rule.manage");
  const current = await currentVersion(input.code);
  const reason = input.reason?.trim() ?? "";
  if (!input.enabled && current.severity === "CRITICAL") {
    if (reason.length < 10) {
      throw new RuleAdminError(
        "REASON_REQUIRED",
        "Un motif d'au moins 10 caractères est requis pour désactiver une règle critique",
      );
    }
    if (!input.confirmed)
      throw new RuleAdminError(
        "CONFIRMATION_REQUIRED",
        "Confirmez la désactivation d'une règle critique",
      );
  }
  await prisma.$transaction([
    prisma.rule.updateMany({
      where: { code: input.code, id: { not: current.id } },
      data: { enabled: false },
    }),
    prisma.rule.update({ where: { id: current.id }, data: { enabled: input.enabled } }),
  ]);
  await recordAudit({
    action: "rule.toggled",
    actorId: actor.userId,
    resourceType: "rule",
    resourceId: input.code,
    details: { version: current.version, enabled: input.enabled, reason: reason || null },
  });
  return { code: input.code, version: current.version, enabled: input.enabled };
}

export interface RulePatch {
  /** Nouveaux seuils par chemin de condition (voir listThresholds). */
  thresholds?: Record<string, number>;
  /** Définition complète, à la place des seuils (structure modifiée). */
  definition?: unknown;
  name?: string;
  description?: string;
  severity?: "INFO" | "WATCH" | "WARNING" | "CRITICAL";
  cooldownHours?: number;
  messageFr?: string;
  messageShort?: string;
  adviceFr?: string;
  reason?: string;
  /**
   * Version sur laquelle la modification a été préparée (celle affichée à l'utilisateur). Si une
   * autre version a été enregistrée entre-temps, la modification est refusée (CONFLICT) au lieu
   * d'être appliquée, à son insu, sur une version qu'il n'a pas vue.
   */
  baseVersion?: number;
}

/** Indicateurs fictifs de grande taille : le message court rendu doit tenir dans le pire cas. */
const WORST_CASE_INDICATORS: Partial<IndicatorValues> = {
  temp_max_avg_3d: 44.5,
  temp_max_max_3d: 45,
  temp_min_avg_3d: 30,
  rain_sum_3d: 999,
  rain_sum_7d: 999,
  rain_sum_10d: 999,
  rain_sum_30d: 1999,
  rain_max_1d: 499,
  dry_days_consecutive: 120,
  et0_sum_7d: 99,
  water_balance_10d: -499,
  forecast_rain_sum_3d: 999,
  forecast_temp_max_max_3d: 45,
};

async function longestCommuneName(): Promise<string> {
  const communes = await prisma.commune.findMany({
    where: { archivedAt: null },
    select: { name: true },
  });
  return communes.reduce(
    (longest, c) => (c.name.length > longest.length ? c.name : longest),
    "Akpro-Missérété",
  );
}

function snapshotOf(rule: RuleRow, definition: RuleNode): RuleSnapshot {
  return {
    name: rule.name,
    description: rule.description,
    severity: rule.severity,
    cooldownHours: rule.cooldownHours,
    messageFr: rule.messageFr,
    messageShort: rule.messageShort,
    adviceFr: rule.adviceFr,
    definition,
  };
}

function conflict(active: number): RuleAdminError {
  return new RuleAdminError(
    "CONFLICT",
    `La règle a été modifiée entre-temps : la version ${active} est désormais en vigueur. Rechargez la page pour repartir de cette version.`,
  );
}

export async function createRuleVersion(actor: Actor, code: string, patch: RulePatch) {
  await requireRight(actor, "rule.manage");
  const base = await currentVersion(code);
  if (patch.baseVersion !== undefined && patch.baseVersion !== base.version) {
    throw conflict(base.version);
  }
  const baseDefinition = parseRuleDefinition(base.definition);
  let definition: RuleNode;
  try {
    definition =
      patch.definition !== undefined
        ? parseRuleDefinition(patch.definition)
        : applyThresholds(baseDefinition, patch.thresholds ?? {});
  } catch (error) {
    throw new RuleAdminError(
      "INVALID",
      error instanceof Error ? error.message : "Définition invalide",
    );
  }
  const next: RuleSnapshot = {
    ...snapshotOf(base, baseDefinition),
    ...Object.fromEntries(
      Object.entries(patch).filter(
        ([k, v]) => v !== undefined && k in snapshotOf(base, baseDefinition),
      ),
    ),
    definition,
  } as RuleSnapshot;

  const version = base.version + 1;
  const parsed = ruleSchema.safeParse({
    ...next,
    code: `${code}_V${version}`,
    version,
    category: base.category,
    target: base.target,
  });
  const issues = [
    ...(parsed.success
      ? []
      : parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))),
    ...validateBounds(definition),
  ];
  const rendered = renderMessage(next.messageShort, WORST_CASE_INDICATORS, {
    commune: await longestCommuneName(),
  });
  if (rendered.length > SHORT_MESSAGE_MAX) {
    issues.push({
      path: "messageShort",
      message: `Message court trop long une fois rendu : ${rendered.length} caractères pour ${SHORT_MESSAGE_MAX} au plus`,
    });
  }
  if (issues.length > 0)
    throw new RuleAdminError("INVALID", "La nouvelle version n'est pas valide", issues);

  const changes: RuleChange[] = diffRules(snapshotOf(base, baseDefinition), next);
  if (changes.length === 0)
    throw new RuleAdminError("INVALID", "Aucune modification à enregistrer");

  const created = await prisma.$transaction(async (tx) => {
    // Deux enregistrements simultanés du même code : le second attend le premier, puis constate
    // qu'une version plus récente existe (CONFLICT) au lieu d'échouer sur l'unicité (code, version).
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`rule:${code}`}))`;
    const latest = await tx.rule.findFirst({
      where: { code },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    if (latest && latest.version >= version) throw conflict(latest.version);
    await tx.rule.updateMany({ where: { code }, data: { enabled: false } });
    return tx.rule.create({
      data: {
        code,
        version,
        name: next.name,
        description: next.description,
        severity: next.severity as RuleRow["severity"],
        category: base.category,
        target: base.target,
        definition: definition as Prisma.InputJsonValue,
        messageFr: next.messageFr,
        messageShort: next.messageShort,
        adviceFr: next.adviceFr,
        cooldownHours: next.cooldownHours,
        enabled: true,
        supersedesId: base.id,
        createdById: actor.userId,
        // Version décidée par le ministère : la provenance est le ministère de l'Agriculture.
        sourceId: "MAEP_DSA",
      },
    });
  });
  await recordAudit({
    action: "rule.updated",
    actorId: actor.userId,
    resourceType: "rule",
    resourceId: code,
    details: {
      fromVersion: base.version,
      toVersion: version,
      reason: patch.reason ?? null,
      changes,
    } as unknown as Prisma.InputJsonValue,
  });
  return { rule: created, changes };
}

export { requireRight as requireRuleRight };
