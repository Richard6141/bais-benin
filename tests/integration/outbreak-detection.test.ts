import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import { beninToday, evaluateNewReports, seedDefaultRules } from "@/modules/monitoring";
import { simulateRule } from "@/modules/monitoring/rule-admin";

// Détection des foyers (ADR-0015) sur Glazoué, commune qu'aucun autre test n'utilise : trois
// signalements d'une même exploitation ne font pas un foyer ; trois exploitations d'un même
// producteur non plus, ni deux producteurs ; trois producteurs proches en 7 jours lèvent une
// alerte « épidémie probable » de ravageurs, provenance « signalements », avec un message qui dit
// combien de producteurs.

const COMMUNE = "BJ-COL-003";
const PREFIX = "019284a0-0000-7000-8000-0000000e";
// Le premier producteur tient trois exploitations (0 à 2), les deux autres une chacune (3 et 4).
const ids = {
  farmers: [`${PREFIX}0001`, `${PREFIX}0002`, `${PREFIX}0003`],
  farms: [`${PREFIX}0011`, `${PREFIX}0012`, `${PREFIX}0013`, `${PREFIX}0014`, `${PREFIX}0015`],
  reports: Array.from({ length: 7 }, (_, i) => `${PREFIX}010${i}`),
};
const FARMER_OF_FARM = [0, 0, 0, 1, 2];
const now = new Date();
let communeId = "";
let reporterId = "";

async function report(id: string, farmIndex: number, offsetDeg: number) {
  await prisma.fieldReport.create({
    data: {
      id,
      farmId: ids.farms[farmIndex]!,
      communeId,
      type: "PEST",
      description: "Chenilles légionnaires sur le maïs",
      locationSource: "GPS",
      observedAt: now,
      reportedById: reporterId,
    },
  });
  await prisma.$executeRaw`
    UPDATE "field_report" fr
    SET "location" = ST_Project(c."centroid", ${offsetDeg * 111_000}::float8, radians(45))
    FROM "commune" c WHERE c."id" = ${communeId}::uuid AND fr."id" = ${id}::uuid`;
}

async function activePestAlert() {
  return prisma.alert.findFirst({
    where: { communeId, category: "PEST", status: "ACTIVE", rule: { code: "PEST_OUTBREAK" } },
  });
}

describe("détection des foyers par regroupement de signalements", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await seedDefaultRules();
    const commune = await prisma.commune.findUniqueOrThrow({ where: { code: COMMUNE } });
    communeId = commune.id;
    const agent = await prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000001" } });
    reporterId = agent.id;
    for (const [index, id] of ids.farmers.entries()) {
      await prisma.farmer.create({
        data: {
          id,
          code: `BJ-TEST-OUTB-000${index + 1}`,
          firstName: "Foyer",
          lastName: `Test ${index + 1}`,
          communeId,
          sourceId: "ATDA_TERRAIN",
          sourceDate: now,
          reliability: "DECLARED",
        },
      });
    }
    for (const [index, id] of ids.farms.entries()) {
      await prisma.farm.create({
        data: {
          id,
          code: `BJ-COL-GLA-99990${index}`,
          farmerId: ids.farmers[FARMER_OF_FARM[index]!]!,
          communeId,
          declaredAreaHa: 1,
          verificationStatus: "DECLARED",
          sourceId: "ATDA_TERRAIN",
          sourceDate: now,
          reliability: "DECLARED",
        },
      });
    }
  }, 180_000);

  afterAll(async () => {
    const alerts = await prisma.alert.findMany({
      where: { communeId, rule: { code: { endsWith: "_OUTBREAK" } } },
      select: { id: true },
    });
    await prisma.alert.deleteMany({ where: { id: { in: alerts.map((a) => a.id) } } });
    await prisma.ruleEvaluation.deleteMany({
      where: { communeId, rule: { code: { endsWith: "_OUTBREAK" } } },
    });
    await prisma.simulationRun.deleteMany({ where: { rule: { code: { endsWith: "_OUTBREAK" } } } });
    await prisma.fieldReport.deleteMany({ where: { id: { in: ids.reports } } });
    await prisma.farm.deleteMany({ where: { id: { in: ids.farms } } });
    await prisma.farmer.deleteMany({ where: { id: { in: ids.farmers } } });
    await prisma.$disconnect();
  });

  it("ne voit pas de foyer dans trois signalements d'une même exploitation", async () => {
    await report(ids.reports[0]!, 0, 0.001);
    await report(ids.reports[1]!, 0, 0.002);
    await report(ids.reports[2]!, 0, 0.003);
    const summary = await evaluateNewReports(ids.reports.slice(0, 3), now);
    expect(summary?.raised).toEqual([]);
    expect(await activePestAlert()).toBeNull();
  });

  it("ni dans trois exploitations proches d'un même producteur", async () => {
    await report(ids.reports[3]!, 1, 0.005);
    await report(ids.reports[4]!, 2, 0.006);
    const summary = await evaluateNewReports(ids.reports.slice(3, 5), now);
    expect(summary?.raised).toEqual([]);
    expect(await activePestAlert()).toBeNull();
  });

  it("ni dans deux producteurs proches", async () => {
    await report(ids.reports[5]!, 3, 0.01);
    await evaluateNewReports([ids.reports[5]!], now);
    expect(await activePestAlert()).toBeNull();
  });

  it("lève une alerte d'épidémie probable au troisième producteur, à moins de 5 km", async () => {
    await report(ids.reports[6]!, 4, 0.02);
    const summary = await evaluateNewReports([ids.reports[6]!], now);
    expect(summary?.raised.length).toBe(1);
    const alert = await activePestAlert();
    expect(alert).toMatchObject({
      severity: "WARNING",
      sourceId: "BAIS_SIGNALEMENTS",
      reliability: "DECLARED",
    });
    expect(alert?.messageFr).toContain("3 producteurs signalent des ravageurs");
    expect(alert?.messageFr).toContain("5 km en 7 jours");

    // Une deuxième évaluation ne relance pas d'alerte : elle prolonge l'épisode en cours.
    const again = await evaluateNewReports([ids.reports[6]!], now);
    expect(again?.raised).toEqual([]);
  });

  it("se simule sur la journée, sans être bloquée par la météo", async () => {
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    const today = beninToday(now);
    const summary = await simulateRule(await loadActor(ministryUser.id), {
      code: "PEST_OUTBREAK",
      from: today,
      to: today,
    });
    expect(summary.candidate.communes.map((c) => c.code)).toContain(COMMUNE);
  });
});
