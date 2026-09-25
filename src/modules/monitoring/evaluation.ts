import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  readCommuneLocations,
  readCropPresence,
  readWeatherSeries,
  type CommuneLocation,
  type WeatherSeriesRow,
} from "@/database/sql/weather.sql";
import { recordAudit } from "@/modules/audit";
import { addDays, beninToday, isoDate } from "./dates";
import {
  computeIndicators,
  evaluateRule,
  parseRuleDefinition,
  renderMessage,
  SHORT_MESSAGE_MAX,
  type IndicatorValues,
  type WeatherDay,
} from "./rules";

// Évaluation quotidienne des règles actives sur chaque commune (monitoring §2.E).
// Principes :
// - une évaluation (déclenchée ou non) est toujours écrite, avec sa trace ;
// - données de plus de 48 h : l'évaluation est marquée « données anciennes » et ne lève rien ;
// - au plus une alerte active par catégorie et par commune ; une règle plus grave remplace
//   l'alerte en cours, une règle égale ou moins grave prolonge l'existante ;
// - délai de refroidissement : pas de nouvelle alerte d'une même règle sur une commune tant
//   que la précédente date de moins de `cooldownHours`.

const SEVERITY_RANK = { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 } as const;
const PAST_DAYS = 35;
const FORECAST_DAYS = 3;
const STALE_AFTER_DAYS = 2;

export interface EvaluationDeps {
  /** Calcule les destinataires d'une alerte créée (module de diffusion). */
  planRecipients?: (alertId: string) => Promise<void>;
  now?: () => Date;
}

export interface EvaluationOptions {
  referenceDate?: string;
  communeIds?: readonly string[];
}

export interface EvaluationSummary {
  referenceDate: string;
  communes: number;
  evaluations: number;
  matched: number;
  raised: string[];
  extended: number;
  superseded: number;
  expired: number;
  staleCommunes: number;
}

function toWeatherDay(row: WeatherSeriesRow): WeatherDay | null {
  if (
    row.precipitation_mm === null ||
    row.temp_max_c === null ||
    row.temp_min_c === null ||
    row.et0_mm === null
  ) {
    return null;
  }
  return {
    date: isoDate(row.observed_on),
    tempMaxC: row.temp_max_c,
    tempMinC: row.temp_min_c,
    precipitationMm: row.precipitation_mm,
    et0Mm: row.et0_mm,
  };
}

export interface CommuneContext {
  commune: CommuneLocation;
  indicators: IndicatorValues;
  stale: boolean;
  sourceId: string;
  reliability: "ESTIMATED" | "SYNTHETIC" | "OFFICIAL";
  sourceDate: Date;
}

function buildContext(
  commune: CommuneLocation,
  rows: WeatherSeriesRow[],
  crops: { cropCode: string; stage: string }[],
  referenceDate: string,
): CommuneContext {
  const observedRows = rows.filter((r) => r.kind === "OBSERVED");
  const observed = observedRows.map(toWeatherDay).filter((d): d is WeatherDay => d !== null);
  const forecast = rows
    .filter((r) => r.kind === "FORECAST")
    .map(toWeatherDay)
    .filter((d): d is WeatherDay => d !== null);
  const lastObserved = observed.reduce<string | null>(
    (max, d) => (max === null || d.date > max ? d.date : max),
    null,
  );
  const stale = lastObserved === null || lastObserved < addDays(referenceDate, -STALE_AFTER_DAYS);
  const synthetic = observedRows.some((r) => r.reliability === "SYNTHETIC");
  const latestFetch = rows.reduce(
    (max, r) => (r.fetched_at > max ? r.fetched_at : max),
    new Date(0),
  );
  return {
    commune,
    indicators: computeIndicators({
      observed,
      forecast,
      referenceDate,
      zoneCode: commune.zone_code,
      crops,
    }),
    stale,
    sourceId: synthetic ? "BAIS_SEED" : (observedRows[0]?.source_id ?? "OPEN_METEO"),
    reliability: synthetic ? "SYNTHETIC" : "ESTIMATED",
    sourceDate: latestFetch,
  };
}

function truncateShort(message: string): string {
  return message.length <= SHORT_MESSAGE_MAX
    ? message
    : `${message.slice(0, SHORT_MESSAGE_MAX - 1)}…`;
}

export async function evaluateCommunes(
  options: EvaluationOptions = {},
  deps: EvaluationDeps = {},
): Promise<EvaluationSummary> {
  const now = deps.now?.() ?? new Date();
  const referenceDate = options.referenceDate ?? beninToday(now);
  const rules = await prisma.rule.findMany({ where: { enabled: true }, orderBy: { code: "asc" } });
  const allCommunes = await readCommuneLocations();
  const communes = options.communeIds
    ? allCommunes.filter((c) => options.communeIds!.includes(c.id))
    : allCommunes;
  const ids = communes.map((c) => c.id);
  const [series, presence] = await Promise.all([
    readWeatherSeries(ids, referenceDate, PAST_DAYS, FORECAST_DAYS),
    readCropPresence(ids),
  ]);

  const summary: EvaluationSummary = {
    referenceDate,
    communes: communes.length,
    evaluations: 0,
    matched: 0,
    raised: [],
    extended: 0,
    superseded: 0,
    expired: 0,
    staleCommunes: 0,
  };
  const parsedRules = rules.map((rule) => ({
    rule,
    definition: parseRuleDefinition(rule.definition),
  }));

  for (const commune of communes) {
    const context = buildContext(
      commune,
      series.filter((r) => r.commune_id === commune.id),
      presence
        .filter((p) => p.commune_id === commune.id)
        .map((p) => ({ cropCode: p.crop_code, stage: p.stage })),
      referenceDate,
    );
    if (context.stale) summary.staleCommunes += 1;

    for (const { rule, definition } of parsedRules) {
      const result = evaluateRule(definition, context.indicators);
      const matched = result.matched && !context.stale;
      const evaluation = await prisma.ruleEvaluation.create({
        data: {
          ruleId: rule.id,
          communeId: commune.id,
          referenceDate: new Date(`${referenceDate}T00:00:00Z`),
          matched,
          indicatorsSnapshot: context.indicators as Prisma.InputJsonValue,
          trace: result.trace as unknown as Prisma.InputJsonValue,
          missing: result.missing,
          dataStale: context.stale,
        },
      });
      summary.evaluations += 1;
      if (!matched) continue;
      summary.matched += 1;

      const outcome = await raiseOrExtend(rule, context, evaluation.id, result.trace, now);
      if (outcome.kind === "raised") {
        summary.raised.push(outcome.alertId);
        if (outcome.superseded) summary.superseded += 1;
        if (deps.planRecipients) await deps.planRecipients(outcome.alertId);
      } else if (outcome.kind === "extended") {
        summary.extended += 1;
      }
    }
  }

  const expired = await prisma.alert.updateMany({
    where: {
      status: "ACTIVE",
      endsAt: { lt: now },
      ...(options.communeIds ? { communeId: { in: ids } } : {}),
    },
    data: { status: "EXPIRED" },
  });
  summary.expired = expired.count;
  return summary;
}

export type RuleRow = Awaited<ReturnType<typeof prisma.rule.findMany>>[number];

export async function raiseOrExtend(
  rule: RuleRow,
  context: CommuneContext,
  evaluationId: string,
  trace: unknown,
  now: Date,
): Promise<
  { kind: "raised"; alertId: string; superseded: boolean } | { kind: "extended" | "skipped" }
> {
  const cooldownEnd = new Date(now.getTime() + rule.cooldownHours * 3_600_000);
  const active = await prisma.alert.findMany({
    where: { communeId: context.commune.id, category: rule.category, status: "ACTIVE" },
    include: { rule: { select: { code: true } } },
  });
  const strongest = active.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];

  if (strongest && SEVERITY_RANK[strongest.severity] >= SEVERITY_RANK[rule.severity]) {
    // Même épisode ou épisode plus grave déjà signalé : on prolonge sans renvoyer de message.
    await prisma.$transaction([
      prisma.alert.update({
        where: { id: strongest.id },
        data: {
          endsAt:
            strongest.endsAt && strongest.endsAt > cooldownEnd ? strongest.endsAt : cooldownEnd,
        },
      }),
      prisma.ruleEvaluation.update({
        where: { id: evaluationId },
        data: { alertId: strongest.id },
      }),
    ]);
    return { kind: strongest.rule.code === rule.code ? "extended" : "skipped" };
  }

  if (!strongest) {
    // Refroidissement : une alerte récente de la même règle, même levée, bloque la répétition.
    const recent = await prisma.alert.findFirst({
      where: {
        communeId: context.commune.id,
        rule: { code: rule.code },
        startsAt: { gt: new Date(now.getTime() - rule.cooldownHours * 3_600_000) },
      },
      select: { id: true },
    });
    if (recent) return { kind: "skipped" };
  }

  const messageContext = {
    commune: context.commune.name,
    departement: context.commune.departement_name,
  };
  const alert = await prisma.$transaction(async (tx) => {
    const created = await tx.alert.create({
      data: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        severity: rule.severity,
        category: rule.category,
        title: rule.name,
        messageFr: renderMessage(rule.messageFr, context.indicators, messageContext),
        messageShort: truncateShort(
          renderMessage(rule.messageShort, context.indicators, messageContext),
        ),
        adviceFr: renderMessage(rule.adviceFr, context.indicators, messageContext),
        communeId: context.commune.id,
        indicators: context.indicators as Prisma.InputJsonValue,
        trace: trace as Prisma.InputJsonValue,
        startsAt: now,
        endsAt: cooldownEnd,
        raisedByEvaluationId: evaluationId,
        sourceId: context.sourceId,
        sourceDate: context.sourceDate,
        reliability: context.reliability,
      },
    });
    await tx.ruleEvaluation.update({ where: { id: evaluationId }, data: { alertId: created.id } });
    if (strongest) {
      await tx.alert.update({
        where: { id: strongest.id },
        data: { status: "SUPERSEDED", supersededById: created.id, endsAt: now },
      });
    }
    return created;
  });

  await recordAudit({
    action: "alert.raised",
    resourceType: "alert",
    resourceId: alert.id,
    details: {
      rule: rule.code,
      version: rule.version,
      commune: context.commune.code,
      severity: rule.severity,
    },
  });
  return { kind: "raised", alertId: alert.id, superseded: Boolean(strongest) };
}
