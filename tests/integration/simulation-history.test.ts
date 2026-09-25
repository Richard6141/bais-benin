import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import type { NpiStatus } from "@/generated/prisma/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { BACKFILL_PAST_DAYS, DAILY_PAST_DAYS, runWeatherIngestion } from "@/modules/monitoring";
import { simulateRule } from "@/modules/monitoring/rule-admin";
import { createFixtureWeatherProvider } from "@/services/weather";

// Profondeur d'historique météo et simulation (monitoring-parcours-ux §2.C6). Une base neuve
// n'a que les jours de la première ingestion : l'ingestion rattrape donc 65 jours tant que
// l'historique est incomplet, pour qu'une simulation sur 30 jours trouve 30 jours d'observations
// avant chacun de ses jours. Période isolée (printemps 2022), retirée à la fin avec les
// simulations ; la double authentification du compte ministère est rétablie à son état initial.

const FIRST_DAY = "2022-06-01";
const NEXT_DAY = "2022-06-02";
const DRAFT = { any: [{ indicator: "rain_sum_3d", op: ">=", value: 1 }] };
const runIds: string[] = [];
const simulationIds: string[] = [];
let ministry: Actor;
let ministryNpiStatus: NpiStatus | null = null;

describe("historique météo et simulation", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ministere@bais.demo" } });
    ministryNpiStatus = user.npiStatus;
    await prisma.user.update({ where: { id: user.id }, data: { npiStatus: "PENDING" } });
    ministry = await loadActor(user.id);
  }, 120_000);

  afterAll(async () => {
    await prisma.ruleEvaluation.deleteMany({ where: { simulationId: { in: simulationIds } } });
    await prisma.simulationRun.deleteMany({ where: { id: { in: simulationIds } } });
    await prisma.weatherObservation.deleteMany({ where: { ingestionRunId: { in: runIds } } });
    await prisma.ingestionRun.deleteMany({ where: { id: { in: runIds } } });
    if (ministryNpiStatus !== null) {
      await prisma.user.update({
        where: { email: "ministere@bais.demo" },
        data: { npiStatus: ministryNpiStatus },
      });
    }
    await prisma.$disconnect();
  });

  it("rattrape 65 jours au premier passage, puis revient à 35 jours", async () => {
    const provider = createFixtureWeatherProvider({ seed: 2022 });
    const first = await runWeatherIngestion({
      primary: provider,
      today: FIRST_DAY,
      forecastDays: 3,
    });
    runIds.push(first.runId);
    expect(first.pastDays).toBe(BACKFILL_PAST_DAYS);
    const djougou = await prisma.commune.findFirstOrThrow({ where: { code: "BJ-DON-003" } });
    expect(
      await prisma.weatherObservation.count({
        where: { communeId: djougou.id, kind: "OBSERVED", ingestionRunId: first.runId },
      }),
    ).toBe(BACKFILL_PAST_DAYS);

    const next = await runWeatherIngestion({ primary: provider, today: NEXT_DAY, forecastDays: 3 });
    runIds.push(next.runId);
    expect(next.pastDays).toBe(DAILY_PAST_DAYS);
  }, 240_000);

  it("simule 30 jours couverts par les observations avec les 77 communes évaluables", async () => {
    const summary = await simulateRule(ministry, {
      code: "FLOOD_RISK",
      draftDefinition: DRAFT,
      from: "2022-05-02",
      to: "2022-05-31",
    });
    simulationIds.push(summary.runId);
    expect(summary).toMatchObject({
      days: 30,
      evaluatedDays: 30,
      unevaluated: null,
      historyStart: "2022-03-28",
      insufficientData: [],
      evaluations: 30 * 77,
    });
    const evaluable = await prisma.ruleEvaluation.groupBy({
      by: ["communeId"],
      where: { simulationId: summary.runId, dataStale: false },
    });
    expect(evaluable).toHaveLength(77);
    expect(summary.candidate.alerts).toBeGreaterThan(0);
    expect(summary.candidate.communes.length).toBeGreaterThan(0);
  }, 240_000);

  it("compte à part les jours sans historique au lieu de désigner les 77 communes", async () => {
    const summary = await simulateRule(ministry, {
      code: "FLOOD_RISK",
      draftDefinition: DRAFT,
      from: "2022-04-01",
      to: "2022-04-30",
    });
    simulationIds.push(summary.runId);
    expect(summary.insufficientData).toEqual([]);
    expect(summary.historyStart).toBe("2022-03-28");
    expect(summary.unevaluated).toMatchObject({ from: "2022-04-01" });
    expect(summary.evaluatedDays).toBeGreaterThan(0);
    expect(summary.evaluatedDays + (summary.unevaluated?.days ?? 0)).toBe(30);
    const stale = await prisma.ruleEvaluation.count({
      where: { simulationId: summary.runId, dataStale: true },
    });
    expect(stale).toBe((summary.unevaluated?.days ?? 0) * 77);
  }, 240_000);
});
