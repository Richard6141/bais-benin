import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { measureRadarCost, runVegetationChecks } from "@/modules/satellite";
import type { RemoteSensingProvider } from "@/services/ports/remote-sensing-provider";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Radar Sentinel-1 (ADR-0019) sur la vraie base. Un fournisseur de test voit la saison entière
// sous les nuages en optique, et un cycle de culture net au radar : la confrontation doit alors
// être tranchée par le radar, avec la source COPERNICUS_S1 et la série radar gardée à part.

const started = new Date();
// Après la période de pic de toute la grande saison : l'optique aurait dû conclure.
const AFTER_SEASON = new Date("2026-12-20T00:00:00Z");
const fixture = createFixtureRemoteSensingProvider();

const cloudyOpticsClearRadar: RemoteSensingProvider = {
  ...fixture,
  id: "fixture",
  radarProvenance: {
    sourceId: "COPERNICUS_S1",
    reliability: "ESTIMATED",
    licence: "test",
    attribution: "test",
  },
  // Taille suffisante au radar, quelle que soit la parcelle tirée : le test porte sur la bascule,
  // pas sur la surface des parcelles de la base de démonstration.
  async radarStatistics(request) {
    const { intervals } = await fixture.radarStatistics(request);
    return {
      intervals: intervals.map((interval) => ({ ...interval, validPixels: 100 })),
      processingUnits: null,
    };
  },
  async vegetationStatistics(request) {
    const { intervals } = await fixture.vegetationStatistics(request);
    return {
      intervals: intervals.map((interval) => ({
        ...interval,
        ndviMean: null,
        ndviStdDev: null,
        validPixels: 0,
        maskedPixels: 120,
      })),
      processingUnits: null,
    };
  },
};

describe("radar Sentinel-1", () => {
  afterAll(async () => {
    await prisma.parcelVegetationCheck.deleteMany({ where: { computedAt: { gte: started } } });
    await prisma.$disconnect();
  });

  it("ne tranche que si Sentinel-2 n'a pas pu, et seulement une fois activé", async () => {
    const off = await runVegetationChecks({
      provider: cloudyOpticsClearRadar,
      limit: 3,
      now: AFTER_SEASON,
      radarFallback: false,
    });
    expect(off.radarDecided).toBe(0);

    await prisma.parcelVegetationCheck.deleteMany({ where: { computedAt: { gte: started } } });
    const on = await runVegetationChecks({
      provider: cloudyOpticsClearRadar,
      limit: 10,
      now: AFTER_SEASON,
      radarFallback: true,
    });

    expect(on.radarDecided).toBeGreaterThan(0);
    const decided = await prisma.parcelVegetationCheck.findMany({
      where: { computedAt: { gte: started }, sensor: "S1" },
      select: { sourceId: true, reliability: true, radarSeries: true, status: true },
    });
    expect(decided.length).toBe(on.radarDecided);
    for (const row of decided) {
      expect(row).toMatchObject({ sourceId: "COPERNICUS_S1", reliability: "ESTIMATED" });
      expect(Array.isArray(row.radarSeries)).toBe(true);
      expect(row.status).not.toBe("INSUFFICIENT_DATA");
    }
  });

  it("mesure le coût par requête sur un échantillon d'une parcelle par commune", async () => {
    const result = await measureRadarCost({ provider: fixture, limit: 3 });
    expect(result.requests).toBe(3);
    // La fixture ne décompte pas d'unités : elles sont signalées comme non fournies.
    expect(result.processingUnits.unreported).toBe(3);
    expect(result.results.every((entry) => entry.areaHa >= 0.5)).toBe(true);
    expect(result.results.every((entry) => entry.validIntervals > 0)).toBe(true);
  });
});
