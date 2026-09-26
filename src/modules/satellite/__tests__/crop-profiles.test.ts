import { describe, expect, it } from "vitest";
import type { VegetationInterval } from "@/services/ports/remote-sensing-provider";
import {
  evaluateVegetation,
  expectedProfile,
  seasonWindow,
  type CropProfileInput,
} from "../crop-profiles";

const MAIZE: CropProfileInput = {
  code: "MAIZE",
  category: "CEREAL",
  cycle: "ANNUAL",
  calendar: {
    south: { sowing: [3, 4], harvest: [7, 8] },
    north: { sowing: [5, 6], harvest: [9, 10] },
  },
};
const CASHEW: CropProfileInput = {
  code: "CASHEW",
  category: "CASH_CROP",
  cycle: "PERENNIAL",
  calendar: { north: { harvest: [2, 5] } },
};
const NOW = new Date("2026-11-15T00:00:00Z");

/** Série décadaire du 1er mai au 31 octobre 2026, NDVI donné par une fonction du mois. */
function series(ndvi: (month: number, index: number) => number | null): VegetationInterval[] {
  const intervals: VegetationInterval[] = [];
  for (let time = Date.UTC(2026, 4, 1); time < Date.UTC(2026, 10, 1); time += 10 * 86_400_000) {
    const middle = new Date(time + 5 * 86_400_000);
    const value = ndvi(middle.getUTCMonth() + 1, intervals.length);
    intervals.push({
      from: new Date(time).toISOString(),
      to: new Date(time + 10 * 86_400_000).toISOString(),
      ndviMean: value,
      ndviStdDev: value === null ? null : 0.05,
      validPixels: value === null ? 0 : 90,
      maskedPixels: value === null ? 90 : 0,
    });
  }
  return intervals;
}

describe("profils de végétation attendus", () => {
  it("abaissent les seuils dans les zones les plus sèches du nord", () => {
    expect(expectedProfile(MAIZE, "ZAE_5")).toEqual({
      kind: "SEASONAL",
      minPeak: 0.45,
      minAmplitude: 0.15,
    });
    expect(expectedProfile(MAIZE, "ZAE_1")).toMatchObject({ minPeak: 0.37 });
    expect(expectedProfile(CASHEW, "ZAE_2")).toEqual({ kind: "PERMANENT", minMedian: 0.36 });
  });

  it("placent la saison du maïs selon le régime des pluies", () => {
    const north = seasonWindow(MAIZE, "UNIMODAL", "MAIN_RAINY", 2026, NOW);
    expect(north?.from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(north?.peakFrom.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(north?.peakTo.toISOString()).toBe("2026-09-30T23:59:59.000Z");
    const south = seasonWindow(MAIZE, "BIMODAL", "MAIN_RAINY", 2026, NOW);
    expect(south?.peakFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(south?.to.toISOString()).toBe("2026-08-31T23:59:59.000Z");
    expect(seasonWindow(MAIZE, "UNIMODAL", "SHORT_RAINY", 2026, NOW)).toBeNull();
    expect(seasonWindow(MAIZE, "BIMODAL", "DRY", 2026, NOW)).toBeNull();
  });
});

describe("jugement d'une parcelle", () => {
  const profile = expectedProfile(MAIZE, "ZAE_5");
  const window = seasonWindow(MAIZE, "UNIMODAL", "MAIN_RAINY", 2026, NOW)!;

  it("reconnaît un cycle de culture normal", () => {
    const verdict = evaluateVegetation(
      series((month) => (month >= 7 && month <= 9 ? 0.68 : 0.22)),
      profile,
      window,
      NOW,
    );
    expect(verdict).toMatchObject({ status: "CONSISTENT", peak: 0.68, base: 0.22 });
  });

  it("signale une parcelle restée nue toute la saison", () => {
    const verdict = evaluateVegetation(
      series(() => 0.17),
      profile,
      window,
      NOW,
    );
    expect(verdict).toMatchObject({ status: "TO_VERIFY", reason: "LOW_PEAK", peak: 0.17 });
  });

  it("signale un couvert dense sans cycle, comme une jachère arborée déclarée en maïs", () => {
    const verdict = evaluateVegetation(
      series(() => 0.66),
      profile,
      window,
      NOW,
    );
    expect(verdict).toMatchObject({ status: "TO_VERIFY", reason: "NO_CYCLE" });
  });

  it("attend la fin de la période de pic avant de signaler", () => {
    const early = new Date("2026-08-10T00:00:00Z");
    const verdict = evaluateVegetation(
      series(() => 0.2),
      profile,
      window,
      early,
    );
    expect(verdict.status).toBe("PENDING");
  });

  it("ne conclut pas quand les nuages ont masqué la période de pic", () => {
    const verdict = evaluateVegetation(
      series((month) => (month >= 7 && month <= 9 ? null : 0.22)),
      profile,
      window,
      NOW,
    );
    expect(verdict.status).toBe("INSUFFICIENT_DATA");
  });

  it("juge une plantation sur son couvert médian", () => {
    const cashew = expectedProfile(CASHEW, "ZAE_5");
    const cashewWindow = seasonWindow(CASHEW, "UNIMODAL", "ANNUAL", 2026, NOW)!;
    expect(
      evaluateVegetation(
        series(() => 0.58),
        cashew,
        cashewWindow,
        NOW,
      ).status,
    ).toBe("CONSISTENT");
    expect(
      evaluateVegetation(
        series(() => 0.2),
        cashew,
        cashewWindow,
        NOW,
      ),
    ).toMatchObject({
      status: "TO_VERIFY",
      reason: "LOW_COVER",
    });
  });
});
