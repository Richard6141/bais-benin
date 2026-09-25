import { prisma } from "@/database/client";
import {
  readCommuneLocations,
  readCropPresence,
  readObservedCoverage,
  readWeatherSeries,
} from "@/database/sql/weather.sql";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/modules/audit";
import type { Actor } from "@/modules/authorization";
import { cropFilterFromDefinition } from "@/modules/monitoring/delivery/crop-filter";
import { addDays } from "@/modules/monitoring/dates";
import { buildContext } from "@/modules/monitoring/evaluation";
import { evaluateRule, parseRuleDefinition, type RuleNode } from "@/modules/monitoring/rules";
import { RuleAdminError, currentVersion, requireRuleRight } from "./service";
import { validateBounds } from "./thresholds";

// Simulation d'une règle (monitoring-parcours-ux §2.C6) : rejoue la version active, ou un
// brouillon de définition, jour par jour sur les observations météo stockées, sans jamais lever
// d'alerte ni rien diffuser. Les évaluations sont écrites avec `simulationId` pour la trace.
// Limite connue : les cultures en place sont celles d'aujourd'hui, pas celles de la période.

const MAX_DAYS = 90;
const PAST_DAYS = 35;
const FORECAST_DAYS = 3;
/** Au-delà de 6 jours manquants sur 30 (20 %), les données d'une commune sont insuffisantes. */
const MAX_MISSING_DAYS = 6;

export interface SimulationInput {
  code: string;
  draftDefinition?: unknown;
  from: string;
  to: string;
}

interface Outcome {
  alerts: number;
  communes: Array<{ code: string; name: string; alerts: number }>;
  affectedFarms: number;
}

export interface SimulationSummary {
  runId: string;
  code: string;
  version: number;
  from: string;
  to: string;
  days: number;
  usesDraft: boolean;
  candidate: Outcome;
  active: Outcome;
  /** Jours où au moins une commune avait assez d'observations pour être évaluée. */
  evaluatedDays: number;
  /** Jours où aucune commune n'était évaluable (historique trop court ou panne générale). */
  unevaluated: { days: number; from: string; to: string } | null;
  /** Premier jour observé stocké dans la fenêtre lue par la simulation. */
  historyStart: string | null;
  /** Communes sans données suffisantes certains jours où les autres étaient évaluables. */
  insufficientData: Array<{ code: string; name: string; days: number }>;
  evaluations: number;
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to && out.length <= MAX_DAYS; day = addDays(day, 1)) out.push(day);
  return out;
}

/** Épisodes distincts : un nouveau déclenchement compte si le précédent date d'au moins le refroidissement. */
function countEpisodes(matchedDays: readonly string[], cooldownDays: number): number {
  let count = 0;
  let last: string | null = null;
  for (const day of matchedDays) {
    if (last === null || day >= addDays(last, cooldownDays)) {
      count += 1;
      last = day;
    }
  }
  return count;
}

async function countFarms(communeIds: string[], definition: RuleNode): Promise<number> {
  if (communeIds.length === 0) return 0;
  const filter = cropFilterFromDefinition(definition);
  const crops: Prisma.ParcelCropWhereInput = {
    archivedAt: null,
    campaign: { status: "OPEN" },
    ...(filter.cropCodes ? { crop: { code: { in: filter.cropCodes } } } : {}),
    ...(filter.stages ? { stage: { in: filter.stages as Prisma.EnumCropStageFilter["in"] } } : {}),
  };
  return prisma.farm.count({
    where: {
      communeId: { in: communeIds },
      archivedAt: null,
      ...(filter.cropCodes || filter.stages
        ? { parcels: { some: { archivedAt: null, crops: { some: crops } } } }
        : {}),
    },
  });
}

export async function simulateRule(
  actor: Actor,
  input: SimulationInput,
): Promise<SimulationSummary> {
  await requireRuleRight(actor, "rule.simulate");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.to) ||
    input.from > input.to
  ) {
    throw new RuleAdminError("INVALID", "Période invalide (dates AAAA-MM-JJ, début avant fin)");
  }
  const days = daysBetween(input.from, input.to);
  if (days.length > MAX_DAYS)
    throw new RuleAdminError("INVALID", `Période limitée à ${MAX_DAYS} jours`);

  const rule = await currentVersion(input.code);
  const activeDefinition = parseRuleDefinition(rule.definition);
  let candidate = activeDefinition;
  if (input.draftDefinition !== undefined) {
    try {
      candidate = parseRuleDefinition(input.draftDefinition);
    } catch (error) {
      throw new RuleAdminError(
        "INVALID",
        error instanceof Error ? error.message : "Définition invalide",
      );
    }
    const issues = validateBounds(candidate);
    if (issues.length > 0) throw new RuleAdminError("INVALID", "Seuils hors limites", issues);
  }

  const run = await prisma.simulationRun.create({
    data: {
      ruleId: rule.id,
      draftDefinition:
        input.draftDefinition === undefined ? undefined : (candidate as Prisma.InputJsonValue),
      fromDate: new Date(`${input.from}T00:00:00Z`),
      toDate: new Date(`${input.to}T00:00:00Z`),
      requestedById: actor.userId,
    },
  });

  const communes = await readCommuneLocations();
  const ids = communes.map((c) => c.id);
  const presence = await readCropPresence(ids);
  const cropsOf = new Map<string, { cropCode: string; stage: string }[]>();
  for (const row of presence) {
    const list = cropsOf.get(row.commune_id) ?? [];
    list.push({ cropCode: row.crop_code, stage: row.stage });
    cropsOf.set(row.commune_id, list);
  }

  const matchedCandidate = new Map<string, string[]>();
  const matchedActive = new Map<string, string[]>();
  const lackingByDay = new Map<string, string[]>();
  const evaluations: Prisma.RuleEvaluationCreateManyInput[] = [];

  for (const day of days) {
    // Comme l'évaluation quotidienne : le jour de référence est le dernier jour observé, et les
    // prévisions acceptées sont celles émises au plus tard le lendemain.
    const series = await readWeatherSeries(ids, day, PAST_DAYS, FORECAST_DAYS, addDays(day, 1));
    for (const commune of communes) {
      const context = buildContext(
        commune,
        series.filter((r) => r.commune_id === commune.id),
        cropsOf.get(commune.id) ?? [],
        day,
      );
      const missing = Number(context.indicators.observed_days_missing_30d ?? 30);
      const lacking = context.stale || missing > MAX_MISSING_DAYS;
      if (lacking) lackingByDay.set(day, [...(lackingByDay.get(day) ?? []), commune.id]);
      const result = evaluateRule(candidate, context.indicators);
      const matched = result.matched && !lacking;
      if (matched)
        matchedCandidate.set(commune.id, [...(matchedCandidate.get(commune.id) ?? []), day]);
      if (!lacking && evaluateRule(activeDefinition, context.indicators).matched) {
        matchedActive.set(commune.id, [...(matchedActive.get(commune.id) ?? []), day]);
      }
      evaluations.push({
        ruleId: rule.id,
        communeId: commune.id,
        referenceDate: new Date(`${day}T00:00:00Z`),
        matched,
        indicatorsSnapshot: context.indicators as Prisma.InputJsonValue,
        trace: result.trace as unknown as Prisma.InputJsonValue,
        missing: result.missing,
        dataStale: lacking,
        simulationId: run.id,
      });
    }
  }
  for (let i = 0; i < evaluations.length; i += 1000) {
    await prisma.ruleEvaluation.createMany({ data: evaluations.slice(i, i + 1000) });
  }

  // Un jour où aucune commune n'est évaluable relève de l'historique (ou d'une panne générale),
  // pas d'une commune : il est compté à part pour ne pas désigner les 77 communes.
  const deadDays = days.filter((day) => (lackingByDay.get(day)?.length ?? 0) === communes.length);
  const insufficient = new Map<string, number>();
  for (const [day, lackingIds] of lackingByDay) {
    if (deadDays.includes(day)) continue;
    for (const id of lackingIds) insufficient.set(id, (insufficient.get(id) ?? 0) + 1);
  }
  const coverage = await readObservedCoverage(addDays(input.from, -PAST_DAYS), input.to);

  const cooldownDays = Math.max(1, Math.ceil(rule.cooldownHours / 24));
  const byId = new Map(communes.map((c) => [c.id, c]));
  async function outcome(matched: Map<string, string[]>, definition: RuleNode): Promise<Outcome> {
    const list = [...matched.entries()]
      .map(([id, matchedDays]) => ({
        code: byId.get(id)?.code ?? id,
        name: byId.get(id)?.name ?? id,
        alerts: countEpisodes(matchedDays, cooldownDays),
      }))
      .sort((a, b) => b.alerts - a.alerts || a.name.localeCompare(b.name, "fr"));
    return {
      alerts: list.reduce((sum, c) => sum + c.alerts, 0),
      communes: list,
      affectedFarms: await countFarms([...matched.keys()], definition),
    };
  }

  const summary: SimulationSummary = {
    runId: run.id,
    code: input.code,
    version: rule.version,
    from: input.from,
    to: input.to,
    days: days.length,
    usesDraft: input.draftDefinition !== undefined,
    candidate: await outcome(matchedCandidate, candidate),
    active: await outcome(matchedActive, activeDefinition),
    evaluatedDays: days.length - deadDays.length,
    unevaluated:
      deadDays.length > 0
        ? { days: deadDays.length, from: deadDays[0]!, to: deadDays[deadDays.length - 1]! }
        : null,
    historyStart: coverage.first,
    insufficientData: [...insufficient.entries()]
      .map(([id, count]) => ({
        code: byId.get(id)?.code ?? id,
        name: byId.get(id)?.name ?? id,
        days: count,
      }))
      .sort((a, b) => b.days - a.days),
    evaluations: evaluations.length,
  };
  await prisma.simulationRun.update({
    where: { id: run.id },
    data: {
      status: "SUCCEEDED",
      finishedAt: new Date(),
      summary: summary as unknown as Prisma.InputJsonValue,
    },
  });
  await recordAudit({
    action: "rule.simulated",
    actorId: actor.userId,
    resourceType: "rule",
    resourceId: input.code,
    details: {
      runId: run.id,
      from: input.from,
      to: input.to,
      usesDraft: summary.usesDraft,
      alerts: summary.candidate.alerts,
    },
  });
  return summary;
}
