import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { runWeatherIngestion } from "@/modules/monitoring";
import { listAffectedFarms } from "@/modules/monitoring/delivery";
import {
  RuleAdminError,
  createRuleVersion,
  getRuleHistory,
  listRules,
  simulateRule,
  toggleRule,
} from "@/modules/monitoring/rule-admin";
import { createFixtureWeatherProvider } from "@/services/weather";

// Gouvernance des règles sur la base réelle, avec des règles de test à codes dédiés et une
// météo de fixture ingérée sur une période isolée (été 2024, sans recouvrement avec les autres
// suites). Tout ce que la suite crée est retiré à la fin ; la double authentification du compte
// ministère est rétablie à son état initial.

const WARNING_CODE = "TEST_ADMIN_FLOOD";
const CRITICAL_CODE = "TEST_ADMIN_CRITICAL";
const INGEST_TODAY = "2024-08-10";
const runIds: string[] = [];
let ministry: Actor;
let agent: Actor;
let ministryTwoFactor: boolean | null = null;

const floodDefinition = {
  any: [
    { indicator: "rain_sum_3d", op: ">=", value: 120 },
    { indicator: "rain_max_1d", op: ">=", value: 100 },
  ],
};

async function createTestRule(code: string, severity: "WARNING" | "CRITICAL") {
  await prisma.rule.create({
    data: {
      code,
      version: 1,
      name: `Règle de test ${code}`,
      description: "Règle créée par la suite d'intégration de gouvernance.",
      severity,
      category: "FLOOD",
      definition: floodDefinition,
      messageFr: "{commune} : {rain_sum_3d} mm en 3 jours.",
      messageShort: "BAIS {commune} : {rain_sum_3d} mm en 3 jours.",
      adviceFr: "Dégagez les rigoles de drainage.",
      cooldownHours: 48,
      sourceId: "BAIS_SEED",
    },
  });
}

describe("gouvernance des règles", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await createTestRule(WARNING_CODE, "WARNING");
    await createTestRule(CRITICAL_CODE, "CRITICAL");
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    ministryTwoFactor = ministryUser.twoFactorEnabled;
    await prisma.user.update({ where: { id: ministryUser.id }, data: { twoFactorEnabled: true } });
    ministry = await loadActor(ministryUser.id);
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000001" },
    });
    agent = await loadActor(agentUser.id);
    const run = await runWeatherIngestion({
      primary: createFixtureWeatherProvider({ seed: 2024 }),
      today: INGEST_TODAY,
      pastDays: 45,
      forecastDays: 3,
    });
    runIds.push(run.runId);
  }, 240_000);

  afterAll(async () => {
    const rules = await prisma.rule.findMany({
      where: { code: { in: [WARNING_CODE, CRITICAL_CODE] } },
      select: { id: true },
    });
    const ruleIds = rules.map((r) => r.id);
    await prisma.ruleEvaluation.deleteMany({ where: { ruleId: { in: ruleIds } } });
    await prisma.simulationRun.deleteMany({ where: { ruleId: { in: ruleIds } } });
    await prisma.rule.deleteMany({ where: { id: { in: ruleIds } } });
    await prisma.weatherObservation.deleteMany({ where: { ingestionRunId: { in: runIds } } });
    await prisma.ingestionRun.deleteMany({ where: { id: { in: runIds } } });
    if (ministryTwoFactor !== null) {
      await prisma.user.update({
        where: { email: "ministere@bais.demo" },
        data: { twoFactorEnabled: ministryTwoFactor },
      });
    }
    await prisma.$disconnect();
  });

  it("réserve la gouvernance au ministère avec double authentification", async () => {
    const rules = await listRules(ministry);
    expect(rules.map((r) => r.code)).toEqual(expect.arrayContaining([WARNING_CODE, CRITICAL_CODE]));
    expect(rules.find((r) => r.code === WARNING_CODE)).toMatchObject({
      version: 1,
      enabled: true,
      alertsLast30Days: 0,
    });
    await expect(listRules(agent)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.user.update({ where: { id: ministry.userId }, data: { twoFactorEnabled: false } });
    await expect(listRules(ministry)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({ where: { id: ministry.userId }, data: { twoFactorEnabled: true } });
  });

  it("désactive une règle avec motif et confirmation quand elle est critique", async () => {
    await expect(toggleRule(agent, { code: WARNING_CODE, enabled: false })).rejects.toBeInstanceOf(
      RuleAdminError,
    );
    expect(await toggleRule(ministry, { code: WARNING_CODE, enabled: false })).toMatchObject({
      enabled: false,
    });
    expect(await toggleRule(ministry, { code: WARNING_CODE, enabled: true })).toMatchObject({
      enabled: true,
    });

    await expect(
      toggleRule(ministry, { code: CRITICAL_CODE, enabled: false }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(
      toggleRule(ministry, {
        code: CRITICAL_CODE,
        enabled: false,
        reason: "Seuils en révision avec l'ATDA",
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await toggleRule(ministry, {
      code: CRITICAL_CODE,
      enabled: false,
      reason: "Seuils en révision avec l'ATDA",
      confirmed: true,
    });
    const critical = await prisma.rule.findFirstOrThrow({ where: { code: CRITICAL_CODE } });
    expect(critical.enabled).toBe(false);

    const history = await getRuleHistory(ministry, CRITICAL_CODE);
    expect(history.journal[0]).toMatchObject({ action: "rule.toggled" });
    expect(history.journal[0]?.details).toMatchObject({
      enabled: false,
      reason: "Seuils en révision avec l'ATDA",
    });
  });

  it("crée une nouvelle version validée, désactive l'ancienne et journalise les écarts", async () => {
    await expect(
      createRuleVersion(ministry, WARNING_CODE, { thresholds: { "any.0": -5 } }),
    ).rejects.toMatchObject({
      code: "INVALID",
      issues: [expect.objectContaining({ path: "any.0" })],
    });
    await expect(
      createRuleVersion(ministry, WARNING_CODE, {
        messageShort: `BAIS {commune} : ${"pluie très forte ".repeat(12)}`,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(createRuleVersion(ministry, WARNING_CODE, {})).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(
      createRuleVersion(agent, WARNING_CODE, { thresholds: { "any.0": 110 } }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const { rule, changes } = await createRuleVersion(ministry, WARNING_CODE, {
      thresholds: { "any.0": 110 },
      cooldownHours: 24,
      reason: "Calage sur les crues de 2024",
    });
    expect(rule).toMatchObject({
      version: 2,
      enabled: true,
      createdById: ministry.userId,
      sourceId: "MAEP_DSA",
    });
    expect(changes.map((c) => c.field)).toEqual(["cooldownHours", "definition.any.0"]);
    const versions = await prisma.rule.findMany({
      where: { code: WARNING_CODE },
      orderBy: { version: "asc" },
    });
    expect(versions.map((v) => [v.version, v.enabled])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(versions[1]?.supersedesId).toBe(versions[0]?.id);
    const history = await getRuleHistory(ministry, WARNING_CODE);
    expect(history.current.version).toBe(2);
    expect(history.journal.find((j) => j.action === "rule.updated")?.details).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
    });
  });

  it("simule un brouillon sur les observations stockées sans lever d'alerte", async () => {
    const alertsBefore = await prisma.alert.count();
    const summary = await simulateRule(ministry, {
      code: WARNING_CODE,
      // Brouillon volontairement très sensible : 1 mm en 3 jours suffit.
      draftDefinition: { any: [{ indicator: "rain_sum_3d", op: ">=", value: 1 }] },
      from: "2024-08-01",
      to: "2024-08-10",
    });
    expect(summary).toMatchObject({
      code: WARNING_CODE,
      days: 10,
      usesDraft: true,
      evaluations: 770,
    });
    expect(summary.candidate.alerts).toBeGreaterThan(summary.active.alerts);
    expect(summary.candidate.communes.length).toBeGreaterThan(0);
    expect(summary.candidate.affectedFarms).toBeGreaterThan(0);
    expect(summary.insufficientData).toEqual([]);
    expect(await prisma.ruleEvaluation.count({ where: { simulationId: summary.runId } })).toBe(770);
    expect(await prisma.alert.count()).toBe(alertsBefore);
    const run = await prisma.simulationRun.findUniqueOrThrow({ where: { id: summary.runId } });
    expect(run.status).toBe("SUCCEEDED");

    const empty = await simulateRule(ministry, {
      code: WARNING_CODE,
      from: "2023-01-01",
      to: "2023-01-03",
    });
    expect(empty.candidate.alerts).toBe(0);
    expect(empty.insufficientData).toHaveLength(77);
    await expect(
      simulateRule(agent, { code: WARNING_CODE, from: "2024-08-01", to: "2024-08-02" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      simulateRule(ministry, { code: WARNING_CODE, from: "2024-08-10", to: "2024-08-01" }),
    ).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("liste les exploitations concernées d'une alerte pour l'agent, pas pour un producteur", async () => {
    const alert = await prisma.alert.findFirst({
      where: {
        status: "ACTIVE",
        recipients: { some: { farmId: { not: null } } },
        commune: { code: "BJ-DON-003" },
      },
      select: { id: true },
    });
    if (!alert) return; // Aucune alerte de démonstration sur Djougou : rien à lister.
    const farms = await listAffectedFarms(agent, alert.id);
    expect(farms.length).toBeGreaterThan(0);
    expect(farms.every((f) => f.farmCode.startsWith("BJ-"))).toBe(true);
    const farmer = await loadActor(
      (await prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000002" } })).id,
    );
    await expect(listAffectedFarms(farmer, alert.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
