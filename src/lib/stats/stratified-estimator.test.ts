import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/ml/random-forest";
import {
  compatibleWeights,
  estimateStratifiedProportion,
  neymanAllocation,
  systematicPositions,
} from "./stratified-estimator";

// Tirage stratifié à deux phases (ADR-0037), vérifié sur des exemples calculés à la main et par
// simulation.

const sd = (p: number) => Math.sqrt(p * (1 - p));

describe("allocation de Neyman avec plancher", () => {
  it("répartit selon W_h S_h, comme l'exemple de l'ADR", () => {
    // 0,1 × 0,5 = 0,05 et 0,9 × 0,218 = 0,196 : 120 × 0,05 / 0,246 = 24,4.
    expect(
      neymanAllocation(
        [
          { candidates: 48, weight: 0.1, sd: 0.5 },
          { candidates: 432, weight: 0.9, sd: sd(0.05) },
        ],
        120,
        20,
      ),
    ).toEqual([24, 96]);
  });

  it("relève une petite strate à son plancher", () => {
    expect(
      neymanAllocation(
        [
          { candidates: 24, weight: 0.05, sd: 0.5 },
          { candidates: 456, weight: 0.95, sd: sd(0.05) },
        ],
        120,
        20,
      ),
    ).toEqual([20, 100]);
  });

  it("prend tous les points d'une strate plus petite que le plancher", () => {
    expect(
      neymanAllocation(
        [
          { candidates: 14, weight: 0.03, sd: 0.5 },
          { candidates: 466, weight: 0.97, sd: sd(0.05) },
        ],
        120,
        20,
      ),
    ).toEqual([14, 106]);
  });

  it("ne dépasse jamais les points de première phase", () => {
    expect(
      neymanAllocation(
        [
          { candidates: 5, weight: 0.3, sd: 0.5 },
          { candidates: 10, weight: 0.7, sd: 0.2 },
        ],
        120,
        20,
      ),
    ).toEqual([5, 10]);
    const capped = neymanAllocation(
      [
        { candidates: 30, weight: 0.5, sd: 0.5 },
        { candidates: 400, weight: 0.5, sd: 0.1 },
      ],
      120,
      20,
    );
    expect(capped).toEqual([30, 90]);
  });
});

describe("tirage systématique dans une strate", () => {
  it("prend un point par pas, à partir d'un départ tiré", () => {
    // Pas de 2,5, départ 1,25 : rangs 1, 3, 6 et 8.
    expect(systematicPositions(10, 4, () => 0.5)).toEqual([1, 3, 6, 8]);
    expect(systematicPositions(3, 5, () => 0.5)).toEqual([0, 1, 2]);
    expect(systematicPositions(10, 0, () => 0.5)).toEqual([]);
  });

  it("donne des rangs distincts, dans la liste", () => {
    const random = seededRandom(7);
    for (let trial = 0; trial < 50; trial += 1) {
      const positions = systematicPositions(432, 96, random);
      expect(new Set(positions).size).toBe(96);
      expect(Math.max(...positions)).toBeLessThan(432);
    }
  });
});

describe("estimateur stratifié", () => {
  // Strate 1 : 4 points de première phase, constats 1, 1, 0, 0 (moyenne 0,5 ; s² = 1/3).
  // Strate 2 : 6 points de première phase, constats 0, 0, 1, 0 (moyenne 0,25 ; s² = 0,25).
  const strata = [
    { firstPhase: 4, values: [1, 1, 0, 0] },
    { firstPhase: 6, values: [0, 0, 1, 0] },
  ];

  it("pondère par les poids connus de la carte", () => {
    const estimate = estimateStratifiedProportion(strata, [0.3, 0.7])!;
    expect(estimate.weightsKnown).toBe(true);
    expect(estimate.proportion).toBeCloseTo(0.325, 10);
    // 0,09 × (1/3) / 4 + 0,49 × 0,25 / 4.
    expect(estimate.variance).toBeCloseTo(0.038125, 10);
    expect(estimate.n).toBe(8);
  });

  it("sans poids connus, prend ceux de la première phase et paie leur incertitude", () => {
    const estimate = estimateStratifiedProportion(strata, null)!;
    expect(estimate.weightsKnown).toBe(false);
    // w = 0,4 et 0,6 : p = 0,4 × 0,5 + 0,6 × 0,25.
    expect(estimate.proportion).toBeCloseTo(0.35, 10);
    // (3/9) 0,4 (1/3) / 4 + (5/9) 0,6 × 0,25 / 4 + [0,4 × 0,15² + 0,6 × 0,1²] / 9.
    expect(estimate.variance).toBeCloseTo(0.4 / 36 + 0.0375 * (5 / 9) + 0.015 / 9, 10);
  });

  it("ne rend rien si une strate a moins de deux points constatés", () => {
    expect(
      estimateStratifiedProportion(
        [
          { firstPhase: 4, values: [1] },
          { firstPhase: 6, values: [0, 0, 1] },
        ],
        null,
      ),
    ).toBeNull();
    // Une strate vide en première phase ne compte pas.
    expect(
      estimateStratifiedProportion(
        [
          { firstPhase: 0, values: [] },
          { firstPhase: 6, values: [0, 0, 1] },
        ],
        null,
      )?.proportion,
    ).toBeCloseTo(1 / 3, 10);
  });

  it("garde les poids de la carte seulement s'ils s'accordent avec la première phase", () => {
    // Part de première phase 0,1 sur 480 points : écart type 0,0137, tolérance 0,041.
    expect(compatibleWeights([0.12, 0.88], [48, 432])).toEqual([0.12, 0.88]);
    expect(compatibleWeights([0.2, 0.8], [48, 432])).toBeNull();
  });

  it("reste sans biais malgré le suréchantillonnage, et sa variance tient (simulation)", () => {
    // Commune de l'ADR : 10 % de cultures annuelles sur la carte, part vivrière 60 % dans cette
    // strate et 2,2 % ailleurs, soit 8 % au total. 24 et 96 points constatés, 480 en 1re phase.
    const random = seededRandom(20260927);
    const draw = (p: number, n: number) => Array.from({ length: n }, () => (random() < p ? 1 : 0));
    const truth = 0.1 * 0.6 + 0.9 * 0.0222;
    const estimates: number[] = [];
    const variances: number[] = [];
    for (let trial = 0; trial < 3000; trial += 1) {
      const estimate = estimateStratifiedProportion(
        [
          { firstPhase: 48, values: draw(0.6, 24) },
          { firstPhase: 432, values: draw(0.0222, 96) },
        ],
        [0.1, 0.9],
      );
      if (!estimate) continue;
      estimates.push(estimate.proportion);
      variances.push(estimate.variance);
    }
    const average = estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
    const spread =
      estimates.reduce((sum, value) => sum + (value - average) ** 2, 0) / (estimates.length - 1);
    const meanVariance = variances.reduce((sum, value) => sum + value, 0) / variances.length;
    expect(average).toBeCloseTo(truth, 3);
    expect(meanVariance / spread).toBeGreaterThan(0.85);
    expect(meanVariance / spread).toBeLessThan(1.15);
    // Mieux qu'un tirage simple de 120 points : p (1 - p) / 120.
    expect(spread).toBeLessThan((truth * (1 - truth)) / 120);
  });
});
