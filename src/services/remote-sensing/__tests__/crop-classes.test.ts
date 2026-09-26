import { describe, expect, it } from "vitest";
import { buildCropAreaBody, parseCropArea } from "../cdse";
import { CROP_CLASS_CODES, cropClassifierSource } from "../crop-classes";

// La règle de classification est exécutée telle qu'envoyée à Copernicus : son source JavaScript
// est évalué ici sur des séries mensuelles synthétiques de pixels, une par classe.

interface Classifier {
  classify: (samples: Sample[], scenes: { orbits: { dateFrom: string }[] }) => number;
  preProcessScenes: (collections: {
    scenes: { orbits: { dateFrom: string; tiles?: { cloudCoverage?: number }[] }[] };
  }) => { scenes: { orbits: { dateFrom: string }[] } };
}

interface Sample {
  B03: number;
  B04: number;
  B08: number;
  B11: number;
  SCL: number;
  dataMask: number;
}

// Évalue notre propre source constant, sans aucune donnée extérieure : test seulement.
function classifier(offset = 0): Classifier {
  return new Function(`${cropClassifierSource(offset)}; return { classify, preProcessScenes };`)();
}

interface Month {
  ndvi: number;
  water?: number;
  built?: number;
}

// Mois 10 à 12 de l'année précédente, puis janvier à septembre : douze passages, un par mois.
const ORDER = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Réflectances cohérentes avec les indices voulus (NDVI, MNDWI, indice de bâti). */
function sample({ ndvi, water = -0.3, built }: Month): Sample {
  const b08 = built === undefined ? 0.3 : 0.1;
  const b04 = (b08 * (1 - ndvi)) / (1 + ndvi);
  const b11 = built === undefined ? 0.2 : (b08 * (1 + built)) / (1 - built);
  const b03 = (b11 * (1 + water)) / (1 - water);
  return { B03: b03, B04: b04, B08: b08, B11: b11, SCL: 4, dataMask: 1 };
}

function pixel(profile: (month: number) => Month, months = ORDER) {
  const samples = months.map((month) => sample(profile(month)));
  const orbits = months.map((month) => ({
    dateFrom: `${month >= 10 ? 2025 : 2026}-${String(month).padStart(2, "0")}-15T10:00:00Z`,
  }));
  return { samples, scenes: { orbits } };
}

function classOf(profile: (month: number) => Month, offset = 0, months = ORDER) {
  const { samples, scenes } = pixel(profile, months);
  return classifier(offset).classify(samples, scenes);
}

const dry = (month: number) => month === 12 || month <= 3;

describe("classification phénologique d'un pixel", () => {
  it("reconnaît le riz à la submersion suivie d'un couvert dense", () => {
    const rice: Record<number, Month> = {
      6: { ndvi: 0.2, water: 0.12 },
      7: { ndvi: 0.6 },
      8: { ndvi: 0.72 },
      9: { ndvi: 0.6 },
    };
    expect(classOf((m) => rice[m] ?? { ndvi: 0.2 })).toBe(CROP_CLASS_CODES.RICE);
  });

  it("classe le maïs du sud et celui du nord en cultures annuelles", () => {
    const south: Record<number, number> = { 5: 0.45, 6: 0.66, 7: 0.6, 8: 0.3, 9: 0.35, 10: 0.52 };
    expect(classOf((m) => ({ ndvi: south[m] ?? 0.2 }))).toBe(CROP_CLASS_CODES.ANNUAL);
    const north: Record<number, number> = { 6: 0.3, 7: 0.55, 8: 0.68, 9: 0.5, 10: 0.3 };
    expect(classOf((m) => ({ ndvi: north[m] ?? 0.18 }))).toBe(CROP_CLASS_CODES.ANNUAL);
  });

  it("reconnaît le coton à son pic tardif, encore vert en novembre, sans pic de juin", () => {
    const cotton: Record<number, number> = { 7: 0.4, 8: 0.6, 9: 0.72, 10: 0.65, 11: 0.5 };
    expect(classOf((m) => ({ ndvi: cotton[m] ?? 0.18 }))).toBe(CROP_CLASS_CODES.COTTON);
  });

  it("sépare cultures pérennes, forêt et savane", () => {
    expect(classOf((m) => ({ ndvi: dry(m) ? 0.52 : 0.6 }))).toBe(CROP_CLASS_CODES.PERENNIAL);
    expect(classOf(() => ({ ndvi: 0.78 }))).toBe(CROP_CLASS_CODES.NATURAL);
    const savanna = (m: number) => ({ ndvi: m >= 5 && m <= 10 ? 0.62 : 0.3 });
    expect(classOf(savanna)).toBe(CROP_CLASS_CODES.NATURAL);
  });

  it("reconnaît le maraîchage de contre-saison", () => {
    const garden: Record<number, number> = { 1: 0.5, 2: 0.55, 3: 0.45, 12: 0.4 };
    expect(classOf((m) => ({ ndvi: garden[m] ?? 0.25 }))).toBe(CROP_CLASS_CODES.GARDEN);
  });

  it("reconnaît la jachère, l'eau et le bâti", () => {
    expect(classOf(() => ({ ndvi: 0.25 }))).toBe(CROP_CLASS_CODES.FALLOW);
    expect(classOf(() => ({ ndvi: 0.02, water: 0.4 }))).toBe(CROP_CLASS_CODES.WATER);
    expect(classOf(() => ({ ndvi: 0.1, built: 0.3 }))).toBe(CROP_CLASS_CODES.BUILT);
  });

  it("ne classe pas un pixel vu moins de quatre fois", () => {
    expect(classOf(() => ({ ndvi: 0.6 }), 0, [7, 8, 9])).toBe(CROP_CLASS_CODES.UNCLASSIFIED);
  });

  it("abaisse les seuils dans les zones les plus sèches", () => {
    // Céréale maigre de l'extrême nord : pic à 0,48.
    const sparse: Record<number, number> = { 7: 0.4, 8: 0.48, 9: 0.44 };
    const profile = (m: number) => ({ ndvi: sparse[m] ?? 0.18 });
    expect(classOf(profile, 0)).toBe(CROP_CLASS_CODES.FALLOW);
    expect(classOf(profile, 0.08)).toBe(CROP_CLASS_CODES.ANNUAL);
  });

  it("ne garde qu'un passage par mois, le moins nuageux", () => {
    const result = classifier().preProcessScenes({
      scenes: {
        orbits: [
          { dateFrom: "2026-07-03T10:00:00Z", tiles: [{ cloudCoverage: 70 }] },
          { dateFrom: "2026-07-18T10:00:00Z", tiles: [{ cloudCoverage: 12 }] },
          {
            dateFrom: "2026-08-02T10:00:00Z",
            tiles: [{ cloudCoverage: 40 }, { cloudCoverage: 20 }],
          },
          { dateFrom: "2026-08-22T10:00:00Z", tiles: [] },
        ],
      },
    });
    expect(result.scenes.orbits.map((orbit) => orbit.dateFrom)).toEqual([
      "2026-07-18T10:00:00Z",
      "2026-08-02T10:00:00Z",
    ]);
  });
});

describe("surfaces par commune", () => {
  it("demande un histogramme des classes sur un seul pas, à 100 m au sol", () => {
    const body = buildCropAreaBody({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [1.6, 9.6],
            [1.8, 9.6],
            [1.8, 9.8],
            [1.6, 9.6],
          ],
        ],
      },
      from: "2025-10-01T00:00:00Z",
      to: "2026-09-26T00:00:00Z",
      resolutionM: 100,
      latitude: 9.7,
      zoneOffset: 0,
    });
    expect(body.aggregation.aggregationInterval.of).toBe("P360D");
    expect(body.aggregation.resx).toBeCloseTo(101.45, 1);
    expect(body.calculations.default.histograms.default).toEqual({
      nBins: 10,
      lowEdge: 0,
      highEdge: 10,
    });
    expect(body.aggregation.evalscript).toContain('mosaicking: "ORBIT"');
    expect(body.aggregation.evalscript).toContain("preProcessScenes");
  });

  it("lit les pixels par code de classe", () => {
    const pixels = parseCropArea({
      data: [
        {
          outputs: {
            crop: {
              bands: {
                B0: {
                  histogram: {
                    bins: [
                      { lowEdge: 0, highEdge: 1, count: 12 },
                      { lowEdge: 1, highEdge: 2, count: 40 },
                      { lowEdge: 2, highEdge: 3, count: 900 },
                      { lowEdge: 9, highEdge: 10, count: 5 },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    });
    expect(pixels).toEqual([12, 40, 900, 0, 0, 0, 0, 0, 0, 5]);
  });
});
