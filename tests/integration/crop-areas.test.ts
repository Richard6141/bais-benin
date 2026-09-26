import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import {
  getCropAreaComparison,
  getCropMapAccuracy,
  runCropAreaEstimates,
  runCropClassChecks,
  writeDemoCropAreaEstimates,
} from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Surfaces des cultures par commune (ADR-0021) sur la vraie base : curseur de la passe mensuelle
// et estimations de démonstration. Fixture seulement, sans réseau ni quota. Le mois simulé est
// lointain, pour que toutes les estimations existantes comptent comme anciennes.

const LATER = new Date("2099-03-10T05:30:00Z");
const AGENT_PHONE = "+2290190000001";
const MINISTRY_PHONE = "+2290190000003";

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

describe("surfaces des cultures par commune", () => {
  afterAll(async () => {
    // Remet les estimations de démonstration du jour à la place de celles du mois simulé.
    await writeDemoCropAreaEstimates();
    await prisma.$disconnect();
  });

  it("reprend au lot suivant les communes pas encore calculées ce mois-ci", async () => {
    const provider = createFixtureRemoteSensingProvider();
    const first = await runCropAreaEstimates({ provider, limit: 3, now: LATER });
    const second = await runCropAreaEstimates({ provider, limit: 3, now: LATER });

    expect(first.computed).toBe(3);
    expect(second.computed).toBe(3);
    const firstCodes = first.perCommune.map((entry) => entry.code);
    const secondCodes = second.perCommune.map((entry) => entry.code);
    expect(secondCodes.some((code) => firstCodes.includes(code))).toBe(false);
    expect(second.remaining).toBe(first.remaining - 3);

    const rows = await prisma.cropAreaEstimate.findMany({
      where: { commune: { code: firstCodes[0] }, computedAt: LATER },
      select: { cropClass: true, pixelShare: true },
    });
    expect(rows).toHaveLength(10);
    const total = rows.reduce((sum, row) => sum + Number(row.pixelShare), 0);
    expect(total).toBeCloseTo(1, 2);
  }, 60_000);

  it("donne une estimation de démonstration à chaque commune", async () => {
    const communes = await writeDemoCropAreaEstimates();
    const open = await prisma.agriculturalCampaign.findFirstOrThrow({
      where: { status: "OPEN" },
      select: { id: true },
    });
    const annual = await prisma.cropAreaEstimate.count({
      where: { campaignId: open.id, cropClass: "ANNUAL", sourceId: "BAIS_SEED" },
    });
    expect(communes).toBeGreaterThan(70);
    expect(annual).toBe(communes);
  }, 60_000);

  it("compare au registre pour le ministère seulement, communes au plus gros écart d'abord", async () => {
    await writeDemoCropAreaEstimates();
    const agent = await actorForPhone(AGENT_PHONE);
    expect(await getCropAreaComparison(agent)).toBeNull();

    const ministry = await actorForPhone(MINISTRY_PHONE);
    const comparison = await getCropAreaComparison(ministry);
    expect(comparison).not.toBeNull();
    const { totals, communes, byClass } = comparison!;
    expect(totals.estimatedCommunes).toBeGreaterThan(70);
    expect(totals.declaredHa).toBeGreaterThan(0);
    expect(totals.enrolmentRate).toBeGreaterThan(0);
    expect(totals.enrolmentRate).toBeLessThan(1);
    expect(byClass.map((entry) => entry.cropClass)).toEqual([
      "RICE",
      "ANNUAL",
      "COTTON",
      "PERENNIAL",
      "GARDEN",
    ]);
    const gaps = communes.map((commune) => commune.gapHa);
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));

    const cotton = await getCropAreaComparison(ministry, {
      cropClass: "COTTON",
      departementCode: "BJ-AL",
    });
    expect(cotton?.byClass).toHaveLength(1);
    expect(cotton?.departements.map((entry) => entry.code)).toEqual(["BJ-AL"]);
  }, 60_000);

  it("mesure la précision de la carte sur les parcelles vérifiées, pour le ministère", async () => {
    const run = await runCropClassChecks({
      provider: createFixtureRemoteSensingProvider(),
      limit: 150,
    });
    expect(run.checked).toBe(150);
    const agent = await actorForPhone(AGENT_PHONE);
    expect(await getCropMapAccuracy(agent)).toBeNull();
    const accuracy = await getCropMapAccuracy(await actorForPhone(MINISTRY_PHONE));
    expect(accuracy!.checked).toBeGreaterThan(100);
    expect(accuracy!.overallAccuracy).toBeGreaterThan(0.6);
    expect(accuracy!.overallAccuracy).toBeLessThan(0.95);
    const checked = await prisma.parcelCropClassCheck.findFirstOrThrow({
      select: { verificationStatus: true, classifiedPixels: true },
    });
    expect(["AGENT_VERIFIED", "FIELD_VERIFIED"]).toContain(checked.verificationStatus);
  }, 120_000);
});
