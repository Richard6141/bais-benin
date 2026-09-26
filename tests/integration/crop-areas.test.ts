import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { runCropAreaEstimates, writeDemoCropAreaEstimates } from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Surfaces des cultures par commune (ADR-0021) sur la vraie base : curseur de la passe mensuelle
// et estimations de démonstration. Fixture seulement, sans réseau ni quota. Le mois simulé est
// lointain, pour que toutes les estimations existantes comptent comme anciennes.

const LATER = new Date("2099-03-10T05:30:00Z");

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
});
