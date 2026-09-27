import { describe, expect, it } from "vitest";
import { buildBurnSeverityBody, parseBurnSeverity } from "../cdse";
import { MASKED_SCL_CLASSES, burnSeverityEvalscript } from "../evalscripts";
import { createFixtureRemoteSensingProvider, syntheticBurnPixels } from "../fixture-provider";

// Surface brûlée par Sentinel-2 (ADR-0038 §2) : requête Statistical, script dNBR, lecture de
// l'histogramme des classes et surface de démonstration reproductible.

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2.6, 9.34],
      [2.6015, 9.34],
      [2.6015, 9.3415],
      [2.6, 9.3415],
      [2.6, 9.34],
    ],
  ],
};

describe("requête de surface brûlée", () => {
  it("lit B8A et B12 à 20 m, en un seul intervalle d'avant à après le feu", () => {
    const body = buildBurnSeverityBody({
      geometry: square,
      fireAt: "2026-12-10T13:30:00.000Z",
      preFrom: "2026-11-20T13:30:00.000Z",
      postTo: "2026-12-25T13:30:00.000Z",
      latitude: 9.34,
    });
    expect(body.aggregation.aggregationInterval.of).toBe("P35D");
    expect(body.aggregation.timeRange).toEqual({
      from: "2026-11-20T13:30:00.000Z",
      to: "2026-12-25T13:30:00.000Z",
    });
    // 20 m au sol, en unités Web Mercator vers 9° nord.
    expect(body.aggregation.resx).toBeCloseTo(20 / Math.cos((9.34 * Math.PI) / 180), 6);
    expect(body.calculations.default.histograms.default).toEqual({
      nBins: 5,
      lowEdge: 0,
      highEdge: 5,
    });
    const script = body.aggregation.evalscript;
    expect(script).toContain('mosaicking: "ORBIT"');
    expect(script).toContain('bands: ["B8A", "B12", "SCL", "dataMask"]');
    expect(script).toContain('Date.parse("2026-12-10T13:30:00.000Z")');
    expect(script).toContain(JSON.stringify(MASKED_SCL_CLASSES));
    expect(script).toContain("d < 0.1 ? 1 : d < 0.27 ? 2 : d < 0.66 ? 3 : 4");
  });

  it("additionne les pixels de chaque classe", () => {
    const payload = {
      data: [
        {
          outputs: {
            burn: {
              bands: {
                B0: {
                  histogram: {
                    bins: [
                      { lowEdge: 0, highEdge: 1, count: 4 },
                      { lowEdge: 1, highEdge: 2, count: 50 },
                      { lowEdge: 2, highEdge: 3, count: 6 },
                      { lowEdge: 3, highEdge: 4, count: 30 },
                      { lowEdge: 4, highEdge: 5, count: 10 },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    };
    expect(parseBurnSeverity(payload)).toEqual([4, 50, 6, 30, 10]);
    expect(parseBurnSeverity({ data: [{}] })).toEqual([0, 0, 0, 0, 0]);
  });

  it("garde le script lisible par Copernicus (pas de barre oblique échappée)", () => {
    expect(burnSeverityEvalscript("2026-12-10T13:30:00.000Z")).not.toContain("\\/");
  });
});

describe("script dNBR, pixel par pixel", () => {
  type Sample = { B8A: number; B12: number; SCL: number; dataMask: number };
  const FIRE = "2026-12-10T13:30:00.000Z";
  const evaluatePixel = new Function(
    `${burnSeverityEvalscript(FIRE)}\nreturn evaluatePixel;`,
  )() as (
    samples: Sample[],
    scenes: { orbits: { dateFrom: string }[] },
  ) => { burn: number[]; dataMask: number[] };
  /** Un passage : date, NBR voulu et classe SCL. */
  const pass = (date: string, nbr: number, scl: number) => ({
    sample: { B8A: 1 + nbr, B12: 1 - nbr, SCL: scl, dataMask: 1 },
    orbit: { dateFrom: `${date}T10:00:00Z` },
  });
  const run = (...passes: ReturnType<typeof pass>[]) =>
    evaluatePixel(
      passes.map((entry) => entry.sample),
      { orbits: passes.map((entry) => entry.orbit) },
    );

  it("compare la dernière image nette avant le feu à la première après", () => {
    // Avant : 0,5 (le 5) puis 0,45 (le 8, plus récente) ; après : 0,1 (le 15), puis 0,4 (le 20).
    const result = run(
      pass("2026-12-05", 0.5, 4),
      pass("2026-12-08", 0.45, 4),
      pass("2026-12-15", 0.1, 5),
      pass("2026-12-20", 0.4, 4),
    );
    // dNBR = 0,45 - 0,1 = 0,35 : brûlé.
    expect(result).toEqual({ burn: [3], dataMask: [1] });
  });

  it("retient une cicatrice prise pour de l'eau, faute d'image nette, sur un pixel terrestre", () => {
    expect(run(pass("2026-12-08", 0.5, 4), pass("2026-12-15", -0.3, 6))).toEqual({
      burn: [4],
      dataMask: [1],
    });
    // Image nette après le feu : elle passe avant l'image sombre.
    expect(
      run(pass("2026-12-08", 0.5, 4), pass("2026-12-13", -0.3, 3), pass("2026-12-16", 0.45, 4)),
    ).toEqual({ burn: [1], dataMask: [1] });
  });

  it("ne mesure pas une vraie eau, ni un pixel sans image nette avant le feu", () => {
    expect(run(pass("2026-12-08", -0.2, 6), pass("2026-12-15", -0.4, 6))).toEqual({
      burn: [0],
      dataMask: [1],
    });
    expect(run(pass("2026-12-08", 0.5, 9), pass("2026-12-15", 0.1, 4))).toEqual({
      burn: [0],
      dataMask: [1],
    });
    expect(evaluatePixel([], { orbits: [] })).toEqual({ burn: [0], dataMask: [0] });
  });
});

describe("surface brûlée de démonstration", () => {
  it("est la même pour une même parcelle, et varie d'une parcelle à l'autre", async () => {
    const ring = square.coordinates[0]!;
    expect(syntheticBurnPixels(ring, "parcelle-a")).toEqual(
      syntheticBurnPixels(ring, "parcelle-a"),
    );
    const shapes = new Set(
      Array.from({ length: 40 }, (_, index) =>
        JSON.stringify(syntheticBurnPixels(ring, `parcelle-${index}`)),
      ),
    );
    expect(shapes.size).toBeGreaterThan(5);
    const read = await createFixtureRemoteSensingProvider().burnSeverity({
      geometry: square,
      fireAt: "2026-12-10T13:30:00.000Z",
      preFrom: "2026-11-20T13:30:00.000Z",
      postTo: "2026-12-25T13:30:00.000Z",
      latitude: 9.34,
      demoKey: "parcelle-a",
    });
    // Environ 2,7 ha, soit près de 70 pixels de 20 m.
    expect(read.classPixels.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(50);
    expect(read.processingUnits).toBeNull();
  });
});
