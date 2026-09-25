import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  evaluateCommunes,
  getAlertDetail,
  getCommuneWeather,
  listAlertsForActor,
  MonitoringBusyError,
  resolveAlert,
  runWeatherIngestion,
  seedDefaultRules,
  withMonitoringLock,
} from "@/modules/monitoring";
import { WeatherProviderError, type WeatherProvider } from "@/services/ports/weather-provider";
import { createFixtureWeatherProvider } from "@/services/weather";

// Monitoring sur la base réelle : ingestion par l'adaptateur fixture sur une date passée isolée
// (janvier 2025, saison sèche), évaluation des règles, périmètre de lecture des alertes, levée.
// Tout ce que la suite crée est retiré à la fin.

const REFERENCE = "2025-01-15";
const DJOUGOU = "BJ-DON-003";
const ADJOHOUN = "BJ-OUE-002";

const runIds: string[] = [];
const alertIds: string[] = [];

async function actorForPhone(phone: string): Promise<Actor> {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

async function actorForEmail(email: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return loadActor(user.id);
}

async function communeId(code: string): Promise<string> {
  const commune = await prisma.commune.findFirstOrThrow({ where: { code }, select: { id: true } });
  return commune.id;
}

// Crée une alerte de test directement, pour vérifier la lecture et la levée sans dépendre de
// la météo du jour.
// Catégories absentes des épisodes de démonstration : l'index « une alerte active par commune et
// par catégorie » ne doit pas entrer en conflit avec les alertes de démonstration.
async function createTestAlert(code: string, category: "MARKET" | "ADMIN"): Promise<string> {
  const rule = await prisma.rule.findFirstOrThrow({
    where: { code: "FLOOD_RISK" },
    orderBy: { version: "desc" },
  });
  const alert = await prisma.alert.create({
    data: {
      ruleId: rule.id,
      ruleVersion: rule.version,
      severity: "WARNING",
      category,
      title: "Alerte de test",
      messageFr: "Message de test pour la suite d'intégration.",
      messageShort: "Test",
      adviceFr: "Conseil de test.",
      communeId: await communeId(code),
      indicators: {},
      trace: [],
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000),
      sourceId: "BAIS_SEED",
      sourceDate: new Date(),
      reliability: "SYNTHETIC",
    },
  });
  alertIds.push(alert.id);
  return alert.id;
}

describe("monitoring agricole", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await seedDefaultRules();
  }, 180_000);

  afterAll(async () => {
    const referenceDate = new Date(`${REFERENCE}T00:00:00Z`);
    const evaluations = await prisma.ruleEvaluation.findMany({
      where: { referenceDate },
      select: { id: true },
    });
    const raised = await prisma.alert.findMany({
      where: { raisedByEvaluationId: { in: evaluations.map((e) => e.id) } },
      select: { id: true },
    });
    const ids = [...new Set([...alertIds, ...raised.map((a) => a.id)])];
    await prisma.ruleEvaluation.deleteMany({
      where: { OR: [{ referenceDate }, { alertId: { in: ids } }] },
    });
    await prisma.alertRecipient.deleteMany({ where: { alertId: { in: ids } } });
    await prisma.alert.deleteMany({ where: { id: { in: ids } } });
    await prisma.weatherObservation.deleteMany({ where: { ingestionRunId: { in: runIds } } });
    await prisma.ingestionRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.$disconnect();
  });

  it("ingère la météo des 77 communes et reste idempotente", async () => {
    const provider = createFixtureWeatherProvider({ seed: 11 });
    const first = await runWeatherIngestion({
      primary: provider,
      today: REFERENCE,
      pastDays: 20,
      forecastDays: 4,
    });
    runIds.push(first.runId);
    expect(first.communes).toBe(77);
    expect(first.communesFailed).toBe(0);
    expect(first.fallback).toBe(false);
    const again = await runWeatherIngestion({
      primary: provider,
      today: REFERENCE,
      pastDays: 20,
      forecastDays: 4,
    });
    runIds.push(again.runId);
    const djougou = await communeId(DJOUGOU);
    const rows = await prisma.weatherObservation.count({
      where: {
        communeId: djougou,
        sourceId: "BAIS_SEED",
        kind: "OBSERVED",
        ingestionRunId: { in: runIds },
      },
    });
    // 20 jours passés, une seule ligne par jour observé malgré deux ingestions.
    expect(rows).toBe(20);
    const duplicates = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT "observed_on" FROM "weather_observation"
        WHERE "commune_id" = ${djougou}::uuid AND "kind" = 'OBSERVED' AND "source_id" = 'BAIS_SEED'
        GROUP BY "observed_on" HAVING count(*) > 1
      ) d`;
    expect(Number(duplicates[0]?.n ?? 0)).toBe(0);
  });

  it("bascule sur la fixture quand le fournisseur principal est injoignable", async () => {
    const failing: WeatherProvider = {
      id: "open-meteo",
      provenance: { sourceId: "OPEN_METEO", reliability: "ESTIMATED", licence: "CC BY 4.0" },
      fetchDaily: async () => {
        throw new WeatherProviderError("injoignable", true);
      },
    };
    const result = await runWeatherIngestion({
      primary: failing,
      fallback: createFixtureWeatherProvider({ seed: 11 }),
      today: REFERENCE,
      pastDays: 20,
      forecastDays: 4,
      retries: 2,
      retryDelayMs: 1,
    });
    runIds.push(result.runId);
    expect(result.fallback).toBe(true);
    expect(result.provider).toBe("fixture");
    const run = await prisma.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.fallback).toBe(true);
    expect(run.error).toContain("injoignable");
  });

  it("évalue chaque règle active sur la commune et ne répète pas une alerte en cours", async () => {
    const djougou = await communeId(DJOUGOU);
    const rules = await prisma.rule.count({ where: { enabled: true } });
    const now = () => new Date(`${REFERENCE}T07:00:00Z`);
    const first = await evaluateCommunes(
      { referenceDate: REFERENCE, communeIds: [djougou] },
      { now },
    );
    expect(first.evaluations).toBe(rules);
    expect(first.staleCommunes).toBe(0);
    alertIds.push(...first.raised);
    const evaluations = await prisma.ruleEvaluation.findMany({
      where: { communeId: djougou, referenceDate: new Date(`${REFERENCE}T00:00:00Z`) },
      select: { trace: true, indicatorsSnapshot: true },
    });
    expect(evaluations.every((e) => Array.isArray(e.trace))).toBe(true);
    const second = await evaluateCommunes(
      { referenceDate: REFERENCE, communeIds: [djougou] },
      { now },
    );
    expect(second.raised).toHaveLength(0);
  });

  it("ne lève rien sur des données de plus de 48 heures", async () => {
    const djougou = await communeId(DJOUGOU);
    const summary = await evaluateCommunes(
      { referenceDate: "2025-02-20", communeIds: [djougou] },
      { now: () => new Date("2025-02-20T07:00:00Z") },
    );
    expect(summary.staleCommunes).toBe(1);
    expect(summary.raised).toHaveLength(0);
    await prisma.ruleEvaluation.deleteMany({
      where: { communeId: djougou, referenceDate: new Date("2025-02-20T00:00:00Z") },
    });
  });

  it("limite la lecture des alertes au périmètre de chaque rôle", async () => {
    const djougouAlert = await createTestAlert(DJOUGOU, "MARKET");
    const adjohounAlert = await createTestAlert(ADJOHOUN, "MARKET");
    const agent = await actorForPhone("+2290190000001");
    const farmer = await actorForPhone("+2290190000002");
    const ministry = await actorForEmail("ministere@bais.demo");
    const buyer = await actorForEmail("acheteur@bais.demo");

    const agentIds = (await listAlertsForActor(agent)).map((a) => a.id);
    expect(agentIds).toContain(djougouAlert);
    expect(agentIds).not.toContain(adjohounAlert);
    expect((await listAlertsForActor(farmer)).every((a) => a.communeCode === DJOUGOU)).toBe(true);
    expect(await listAlertsForActor(buyer)).toEqual([]);
    const ministryIds = (await listAlertsForActor(ministry)).map((a) => a.id);
    expect(ministryIds).toEqual(expect.arrayContaining([djougouAlert, adjohounAlert]));

    expect(await getAlertDetail(agent, adjohounAlert)).toBeNull();
    const forFarmer = await getAlertDetail(farmer, djougouAlert);
    expect(forFarmer?.delivery).toBeNull();
    const forAgent = await getAlertDetail(agent, djougouAlert);
    expect(forAgent?.delivery).not.toBeNull();
  });

  it("réserve la levée d'une alerte au ministère, avec un motif", async () => {
    const alertId = await createTestAlert(DJOUGOU, "ADMIN");
    const agent = await actorForPhone("+2290190000001");
    const ministry = await actorForEmail("ministere@bais.demo");
    expect(await resolveAlert(agent, alertId, "Fin de l'épisode")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await resolveAlert(ministry, alertId, "ok")).toEqual({
      ok: false,
      code: "REASON_REQUIRED",
    });
    expect(await resolveAlert(ministry, alertId, "Fin de l'épisode constatée")).toEqual({
      ok: true,
    });
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alert.status).toBe("RESOLVED");
    expect(await resolveAlert(ministry, alertId, "Deuxième levée")).toEqual({
      ok: false,
      code: "NOT_ACTIVE",
    });
  });

  it("refuse une seconde exécution planifiée tant que la première tourne", async () => {
    let release: () => void = () => undefined;
    const first = withMonitoringLock(
      "daily",
      () => new Promise<string>((resolve) => (release = () => resolve("première"))),
    );
    await new Promise((r) => setTimeout(r, 200));
    await expect(withMonitoringLock("daily", async () => "seconde")).rejects.toBeInstanceOf(
      MonitoringBusyError,
    );
    // Un autre verrou (envoi des messages) reste disponible pendant ce temps.
    await expect(withMonitoringLock("dispatch", async () => "envoi")).resolves.toBe("envoi");
    release();
    await expect(first).resolves.toBe("première");
    await expect(withMonitoringLock("daily", async () => "après")).resolves.toBe("après");
  });

  it("expose la météo d'une commune avec sa source", async () => {
    const weather = await getCommuneWeather(DJOUGOU, "2025-01-16");
    expect(weather?.communeName).toBe("Djougou");
    expect(weather?.strip.length).toBeGreaterThan(0);
    expect(weather?.source).toBeTruthy();
    expect(await getCommuneWeather("BJ-XXX-999")).toBeNull();
  });
});
