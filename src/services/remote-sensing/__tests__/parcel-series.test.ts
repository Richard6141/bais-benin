import { describe, expect, it } from "vitest";
import { buildParcelSeriesBodies, parseParcelS1, parseParcelS2 } from "../cdse";
import { syntheticParcelSeries } from "../fixture-parcel-series";

// Séries d'une parcelle (ADR-0030) : ce qui part vers Copernicus, ce qui en revient, et la fixture.

const PARCEL = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2.6, 9.1],
      [2.601, 9.1],
      [2.601, 9.101],
      [2.6, 9.101],
      [2.6, 9.1],
    ],
  ],
};

const stats = (mean: number, sampleCount: number, noDataCount: number) => ({
  bands: { B0: { stats: { mean, sampleCount, noDataCount } } },
});

describe("requêtes de séries de parcelle", () => {
  const bodies = buildParcelSeriesBodies({
    geometry: PARCEL,
    from: "2026-01-01T00:00:00Z",
    to: "2026-09-27T00:00:00Z",
    latitude: 9.1,
  });

  it("demande Sentinel-2 par décade, la scène la moins nuageuse d'abord", () => {
    expect(bodies.s2.aggregation.aggregationInterval.of).toBe("P10D");
    expect(bodies.s2.input.data[0]?.dataFilter).toEqual({ mosaickingOrder: "leastCC" });
    expect(bodies.s2.aggregation.evalscript).toContain('bands: ["B04", "B08", "B11", "SCL"');
    expect(bodies.s2.aggregation.resx).toBeCloseTo(10.13, 2);
  });

  it("demande Sentinel-1 par 12 jours, sans les options qui multiplient le coût", () => {
    expect(bodies.s1.aggregation.aggregationInterval.of).toBe("P12D");
    expect(bodies.s1.input.data[0]?.processing).toEqual({
      backCoeff: "SIGMA0_ELLIPSOID",
      orthorectify: true,
      demInstance: "COPERNICUS_30",
    });
  });

  it("rapporte les pixels vus à la décade la plus dégagée", () => {
    const s2 = parseParcelS2({
      data: [
        {
          interval: { from: "2026-07-01", to: "2026-07-11" },
          outputs: { ndvi: stats(0.6, 120, 20), ndmi: stats(0.3, 120, 20) },
        },
        {
          interval: { from: "2026-07-11", to: "2026-07-21" },
          outputs: { ndvi: stats(0, 120, 120), ndmi: stats(0, 120, 120) },
        },
        {
          interval: { from: "2026-07-21", to: "2026-07-31" },
          outputs: { ndvi: stats(0.65, 120, 70), ndmi: stats(0.35, 120, 70) },
        },
      ],
    });
    expect(s2.map((entry) => entry.valid)).toEqual([1, 0, 0.5]);
    expect(s2[1]?.ndvi).toBeNull();
  });

  it("lit VV et VH en décibels, rien sur un pas sans donnée", () => {
    const s1 = parseParcelS1({
      data: [
        {
          interval: { from: "2026-07-01", to: "2026-07-13" },
          outputs: { vv: stats(-11.2, 90, 0), vh: stats(-17.5, 90, 0) },
        },
        {
          interval: { from: "2026-07-13", to: "2026-07-25" },
          outputs: { vv: stats(0, 90, 90), vh: stats(0, 90, 90) },
        },
      ],
    });
    expect(s1).toEqual([
      { from: "2026-07-01", to: "2026-07-13", vv: -11.2, vh: -17.5 },
      { from: "2026-07-13", to: "2026-07-25", vv: null, vh: null },
    ]);
  });
});

describe("séries de démonstration", () => {
  const request = {
    geometry: PARCEL,
    from: "2026-01-01T00:00:00Z",
    to: "2026-12-31T00:00:00Z",
    latitude: 9.1,
    expectedGroup: "COTTON",
  };

  it("donne une décade tous les dix jours et un pas radar tous les douze", () => {
    const series = syntheticParcelSeries(
      { ...request, demoKeys: { commune: "C", parcel: "p1" } },
      0,
    );
    expect(series.s2).toHaveLength(37);
    expect(series.s1).toHaveLength(31);
    const peak = series.s2.reduce(
      (best, entry) => ((entry.ndvi ?? 0) > (best.ndvi ?? 0) ? entry : best),
      series.s2[0]!,
    );
    expect(new Date(peak.from).getUTCMonth()).toBeGreaterThanOrEqual(7);
  });

  it("ne fausse jamais la culture d'une parcelle vérifiée", () => {
    for (let index = 0; index < 60; index += 1) {
      const keys = { commune: "C", parcel: `p${index}` };
      const verified = syntheticParcelSeries({ ...request, demoKeys: keys, verified: true }, 0);
      const peakMonth = new Date(
        verified.s2.reduce((best, entry) => ((entry.ndvi ?? 0) > (best.ndvi ?? 0) ? entry : best))
          .from,
      ).getUTCMonth();
      expect(peakMonth).toBeGreaterThanOrEqual(7);
    }
  });
});
