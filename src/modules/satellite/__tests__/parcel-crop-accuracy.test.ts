import { describe, expect, it } from "vitest";
import {
  countPairs,
  crossValidationMetrics,
  crossValidationSchema,
  groupConfusion,
  wilsonInterval,
} from "../parcel-crop-accuracy";

// Précision du modèle par parcelle (ADR-0032) : matrice, taux par culture et marge d'erreur.

describe("marge d'erreur", () => {
  it("encadre une proportion, plus serrée avec plus de parcelles", () => {
    const small = wilsonInterval(40, 50)!;
    const large = wilsonInterval(400, 500)!;
    expect(small.low).toBeLessThan(0.8);
    expect(small.high).toBeGreaterThan(0.8);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
    expect(large.low).toBeCloseTo(0.763, 2);
    expect(large.high).toBeCloseTo(0.833, 2);
  });

  it("reste dans [0, 1] à l'extrême, et ne dit rien sans parcelle", () => {
    const perfect = wilsonInterval(20, 20)!;
    expect(perfect.high).toBeCloseTo(1, 6);
    expect(perfect.high).toBeLessThanOrEqual(1);
    expect(perfect.low).toBeGreaterThan(0.8);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe("matrice de confusion par culture", () => {
  const pairs = countPairs([
    ...Array.from({ length: 18 }, () => ({ reference: "MAIZE", predicted: "MAIZE" })),
    ...Array.from({ length: 2 }, () => ({ reference: "MAIZE", predicted: "SORGHUM_MILLET" })),
    ...Array.from({ length: 9 }, () => ({ reference: "COTTON", predicted: "COTTON" })),
    ...Array.from({ length: 3 }, () => ({ reference: "COTTON", predicted: "MAIZE" })),
    { reference: "RICE", predicted: null },
  ]);

  it("compte la diagonale et donne la précision avec sa marge", () => {
    const matrix = groupConfusion(pairs);
    expect(matrix.judged).toBe(32);
    expect(matrix.correct).toBe(27);
    expect(matrix.accuracy).toBeCloseTo(27 / 32, 5);
    expect(matrix.interval!.low).toBeLessThan(matrix.accuracy!);
    expect(matrix.interval!.high).toBeGreaterThan(matrix.accuracy!);
    expect(matrix.columns).toEqual(["MAIZE", "SORGHUM_MILLET", "COTTON"]);
    expect(matrix.rows.map((row) => row.reference)).toEqual(["MAIZE", "COTTON"]);
  });

  it("donne pour chaque culture la part reconnue, la classe fiable et la confusion principale", () => {
    const { classes } = groupConfusion(pairs);
    const maize = classes.find((entry) => entry.group === "MAIZE")!;
    expect(maize.recall).toBeCloseTo(0.9, 5);
    expect(maize.precision).toBeCloseTo(18 / 21, 5);
    expect(maize.mainConfusion).toEqual({ predicted: "SORGHUM_MILLET", share: 0.1 });
    const cotton = classes.find((entry) => entry.group === "COTTON")!;
    expect(cotton.recall).toBeCloseTo(0.75, 5);
    // Neuf parcelles classées coton : trop peu pour un taux.
    expect(cotton.precision).toBeNull();
  });

  it("ne donne aucun taux sur trop peu de parcelles", () => {
    const matrix = groupConfusion([{ reference: "MAIZE", predicted: "MAIZE", count: 5 }]);
    expect(matrix.accuracy).toBeNull();
    expect(matrix.interval).toBeNull();
  });
});

describe("résumé de la validation croisée", () => {
  it("compte par commune et à part les parcelles jugées avec assurance", () => {
    const metrics = crossValidationMetrics(
      2,
      [
        { reference: "MAIZE", commune: "B", predicted: { label: "MAIZE", confidence: 0.9 } },
        { reference: "MAIZE", commune: "B", predicted: { label: "COTTON", confidence: 0.5 } },
        { reference: "COTTON", commune: "A", predicted: { label: "COTTON", confidence: 0.7 } },
        { reference: "COTTON", commune: "A", predicted: null },
      ],
      0.6,
    );
    expect(metrics.communes).toEqual([
      { code: "A", judged: 1, correct: 1 },
      { code: "B", judged: 2, correct: 1 },
    ]);
    expect(metrics.confident).toEqual({ judged: 2, correct: 2 });
    expect(metrics.pairs.reduce((sum, pair) => sum + pair.count, 0)).toBe(3);
    // Trois parcelles jugées : trop peu pour une précision.
    expect(metrics.accuracy).toBeNull();
    expect(crossValidationSchema.parse(JSON.parse(JSON.stringify(metrics)))).toEqual(metrics);
  });
});
