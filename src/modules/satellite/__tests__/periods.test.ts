import { describe, expect, it } from "vitest";
import { isDetailTileInBenin, overviewSize } from "../tiles";
import {
  ROLLING_PERIOD,
  defaultPeriod,
  isOfferedPeriod,
  isPeriod,
  periodLabel,
  periodRange,
  recentPeriods,
  summarizePeriod,
  type ImageryPeriod,
} from "../periods";

const NOW = new Date("2026-09-26T08:00:00Z");

function period(value: string, clearSceneCount: number): ImageryPeriod {
  return {
    period: value,
    label: value,
    current: false,
    rolling: false,
    clearSceneCount,
    clearest: null,
    lastAcquiredAt: null,
  };
}

describe("périodes d'imagerie", () => {
  it("bornent un mois révolu à son dernier jour et le mois en cours à maintenant", () => {
    expect(periodRange("2026-02", NOW)).toEqual({
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-28T23:59:59.000Z",
    });
    expect(periodRange("2026-09", NOW).to).toBe(NOW.toISOString());
  });

  it("proposent les douze derniers mois, du plus récent au plus ancien", () => {
    const periods = recentPeriods(NOW);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe("2026-09");
    expect(periods[11]).toBe("2025-10");
  });

  it("proposent aussi les 60 derniers jours, par défaut dès qu'ils ont une scène dégagée", () => {
    expect(isOfferedPeriod(ROLLING_PERIOD, NOW)).toBe(true);
    expect(periodRange(ROLLING_PERIOD, NOW)).toEqual({
      from: "2026-07-28T08:00:00.000Z",
      to: NOW.toISOString(),
    });
    expect(periodLabel(ROLLING_PERIOD)).toBe("60 derniers jours");
    expect(
      defaultPeriod([{ ...period(ROLLING_PERIOD, 400), rolling: true }, period("2026-09", 30)]),
    ).toBe(ROLLING_PERIOD);
    expect(
      defaultPeriod([{ ...period(ROLLING_PERIOD, 0), rolling: true }, period("2026-09", 30)]),
    ).toBe("2026-09");
  });

  it("valident le format et nomment le mois en français", () => {
    expect(isPeriod("2026-08")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-8")).toBe(false);
    expect(periodLabel("2026-08")).toBe("août 2026");
  });

  it("comptent les scènes dégagées et retiennent la plus dégagée", () => {
    const summary = summarizePeriod(
      "2026-08",
      [
        {
          id: "a",
          acquiredAt: "2026-08-03T10:00:00Z",
          cloudCover: 80,
          platform: null,
          gridCode: null,
        },
        {
          id: "b",
          acquiredAt: "2026-08-18T10:00:00Z",
          cloudCover: 10,
          platform: null,
          gridCode: null,
        },
        {
          id: "c",
          acquiredAt: "2026-08-28T10:00:00Z",
          cloudCover: 40,
          platform: null,
          gridCode: null,
        },
        {
          id: "d",
          acquiredAt: "2026-08-30T10:00:00Z",
          cloudCover: null,
          platform: null,
          gridCode: null,
        },
      ],
      NOW,
    );
    expect(summary.clearSceneCount).toBe(4);
    expect(summary.clearest).toEqual({ acquiredAt: "2026-08-18T10:00:00Z", cloudCover: 10 });
    expect(summary.lastAcquiredAt).toBe("2026-08-30T10:00:00Z");
  });

  it("choisissent le mois récent qui couvre le pays, sinon le plus dégagé des trois derniers", () => {
    expect(
      defaultPeriod([period("2026-09", 12), period("2026-08", 43), period("2026-07", 60)]),
    ).toBe("2026-08");
    expect(defaultPeriod([period("2026-09", 4), period("2026-08", 11), period("2026-07", 9)])).toBe(
      "2026-08",
    );
    expect(defaultPeriod([period("2026-09", 0), period("2026-08", 0)])).toBeNull();
  });
});

describe("tuiles satellite", () => {
  it("ne demandent jamais à Copernicus une tuile hors du Bénin ou hors des zooms détaillés", () => {
    // z10 : la tuile x=516, y=484 couvre Djougou (1,67° E ; 9,71° N).
    expect(isDetailTileInBenin(10, 516, 484)).toBe(true);
    expect(isDetailTileInBenin(10, 0, 0)).toBe(false);
    expect(isDetailTileInBenin(8, 129, 120)).toBe(false);
    expect(isDetailTileInBenin(14, 8261, 7730)).toBe(false);
  });

  it("gardent les proportions du pays pour l'image d'ensemble", () => {
    const { width, height } = overviewSize();
    expect(width).toBe(1000);
    expect(height).toBeGreaterThan(1900);
    expect(height).toBeLessThan(2500);
  });
});
