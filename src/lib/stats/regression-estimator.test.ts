import { describe, expect, it } from "vitest";
import { combineStrata, estimateProportion } from "./regression-estimator";

// Estimateur par régression d'une proportion (ADR-0033), vérifié sur un exemple calculé à la main.

describe("estimateur par régression", () => {
  // Six points : la carte voit la classe sur les trois premiers, l'agent la culture sur trois.
  const x = [1, 1, 1, 0, 0, 0];
  const y = [1, 1, 0, 0, 0, 1];

  it("corrige la moyenne de l'échantillon par l'écart de la carte à sa moyenne connue", () => {
    const estimate = estimateProportion(y, x, 0.4)!;
    expect(estimate.method).toBe("regression");
    // b = Sxy / Sxx = 0,5 / 1,5 ; p = 0,5 + b (0,4 - 0,5).
    expect(estimate.proportion).toBeCloseTo(0.5 - 0.1 / 3, 10);
    // Somme des résidus au carré 4/3, sur n - 2 = 4, divisée par n = 6.
    expect(estimate.variance).toBeCloseTo(1 / 18, 10);
    expect(estimate.directVariance).toBeCloseTo(0.05, 10);
    expect(estimate.correlation).toBeCloseTo(1 / 3, 10);
  });

  it("gagne en précision quand la carte suit le terrain", () => {
    const map = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const ground = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    const estimate = estimateProportion(ground, map, 0.3)!;
    expect(estimate.method).toBe("regression");
    expect(estimate.variance).toBeLessThan(estimate.directVariance / 2);
    expect(estimate.proportion).toBeGreaterThan(0.25);
  });

  it("revient à l'estimateur direct sans carte, ou quand la carte ne varie pas", () => {
    const direct = estimateProportion(y, null, null)!;
    expect(direct.method).toBe("direct");
    expect(direct.proportion).toBe(0.5);
    expect(direct.variance).toBeCloseTo(0.05, 10);
    const flat = estimateProportion(y, [1, 1, 1, 1, 1, 1], 0.4)!;
    expect(flat.method).toBe("direct");
    expect(flat.correlation).toBeNull();
  });

  it("borne la proportion à [0, 1] et refuse moins de trois points", () => {
    const high = estimateProportion([1, 1, 1, 0], [1, 1, 1, 0], 1)!;
    expect(high.proportion).toBeLessThanOrEqual(1);
    expect(estimateProportion([1, 0], [1, 0], 0.5)).toBeNull();
    expect(() => estimateProportion([1, 0, 1], [1, 0], 0.5)).toThrow(RangeError);
  });
});

describe("strates", () => {
  it("additionne surfaces et variances de communes indépendantes", () => {
    const total = combineStrata([
      { areaHa: 1000, varianceHa2: 400 },
      { areaHa: 500, varianceHa2: 225 },
    ]);
    expect(total.areaHa).toBe(1500);
    expect(total.standardErrorHa).toBeCloseTo(25, 10);
    expect(total.marginHa).toBeCloseTo(49, 10);
    expect(total.cv).toBeCloseTo(25 / 1500, 10);
  });

  it("n'a pas de coefficient de variation pour une surface nulle", () => {
    expect(combineStrata([{ areaHa: 0, varianceHa2: 0 }]).cv).toBeNull();
  });
});
