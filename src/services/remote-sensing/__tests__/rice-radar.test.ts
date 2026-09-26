import { describe, expect, it } from "vitest";
import { buildRiceRadarBody, parseRiceRadar } from "../cdse";
import { riceRadarSource } from "../rice-radar";

// Riz par radar Sentinel-1 (ADR-0026) : la règle est exécutée telle qu'envoyée à Copernicus, sur
// des séries mensuelles synthétiques de rétrodiffusion VH.

interface Rule {
  riceFlag: (
    samples: { VH: number; dataMask: number }[],
    scenes: { orbits: { dateFrom: string }[] },
  ) => number;
  preProcessScenes: (collections: { scenes: { orbits: { dateFrom: string }[] } }) => {
    scenes: { orbits: { dateFrom: string }[] };
  };
}

// Évalue notre propre source constant, sans aucune donnée extérieure : test seulement.
const rule = (): Rule =>
  new Function(`${riceRadarSource()}; return { riceFlag, preProcessScenes };`)();

const MONTHS = [5, 6, 7, 8, 9, 10, 11];

/** Une valeur de VH en dB par mois, de mai à novembre. */
function flag(vhDb: (month: number) => number) {
  const samples = MONTHS.map((month) => ({ VH: 10 ** (vhDb(month) / 10), dataMask: 1 }));
  const orbits = MONTHS.map((month) => ({
    dateFrom: `2026-${String(month).padStart(2, "0")}-12T05:40:00Z`,
  }));
  return rule().riceFlag(samples, { orbits });
}

describe("riz vu par le radar", () => {
  it("reconnaît une rizière inondée au repiquage puis couverte", () => {
    const paddy: Record<number, number> = { 6: -22, 7: -18, 8: -14, 9: -13 };
    expect(flag((m) => paddy[m] ?? -16)).toBe(1);
  });

  it("écarte un plan d'eau permanent, un champ sec et une culture pluviale", () => {
    expect(flag(() => -23)).toBe(0);
    expect(flag(() => -15)).toBe(0);
    // Maïs : sol humide puis couvert, sans passer par l'eau libre.
    const maize: Record<number, number> = { 6: -18, 7: -15, 8: -13 };
    expect(flag((m) => maize[m] ?? -17)).toBe(0);
  });

  it("ne conclut pas sur moins de quatre passages", () => {
    const samples = [-22, -14, -13].map((db) => ({ VH: 10 ** (db / 10), dataMask: 1 }));
    const orbits = ["06", "07", "08"].map((month) => ({ dateFrom: `2026-${month}-12T05:40:00Z` }));
    expect(rule().riceFlag(samples, { orbits })).toBe(0);
  });

  it("ne garde qu'un passage par mois et par trace, de mai à novembre", () => {
    const result = rule().preProcessScenes({
      scenes: {
        orbits: [
          { dateFrom: "2026-03-10T05:40:00Z" },
          { dateFrom: "2026-06-24T05:40:00Z" },
          { dateFrom: "2026-06-18T05:40:00Z" },
          { dateFrom: "2026-06-20T05:40:00Z" },
          { dateFrom: "2026-12-02T05:40:00Z" },
        ],
      },
    });
    // Le 18 et le 24 juin : même trace (six jours) ; le 20 : trace voisine.
    expect(result.scenes.orbits.map((orbit) => orbit.dateFrom.slice(5, 10)).sort()).toEqual([
      "06-20",
      "06-24",
    ]);
  });
});

describe("requête du riz radar", () => {
  it("lit VH seul en orbite descendante, corrigé du relief, en un seul pas", () => {
    const body = buildRiceRadarBody({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.3, 6.9],
            [2.4, 6.9],
            [2.4, 7.0],
            [2.3, 6.9],
          ],
        ],
      },
      from: "2026-05-01T00:00:00Z",
      to: "2026-09-27T00:00:00Z",
      resolutionM: 120,
      latitude: 6.95,
    });
    expect(body.input.data[0]).toMatchObject({
      type: "sentinel-1-grd",
      dataFilter: { orbitDirection: "DESCENDING", polarization: "DV" },
      processing: { backCoeff: "GAMMA0_TERRAIN" },
    });
    expect(body.aggregation.aggregationInterval.of).toBe("P149D");
    expect(body.aggregation.evalscript).toContain('bands: ["VH", "dataMask"]');
  });

  it("compte les pixels de rizière et les pixels vus", () => {
    const counts = parseRiceRadar({
      data: [
        {
          outputs: {
            rice: {
              bands: {
                B0: {
                  histogram: {
                    bins: [
                      { lowEdge: 0, highEdge: 1, count: 950 },
                      { lowEdge: 1, highEdge: 2, count: 50 },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    });
    expect(counts).toEqual({ ricePixels: 50, observedPixels: 1000 });
  });
});
