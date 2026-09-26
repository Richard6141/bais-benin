import { describe, expect, it } from "vitest";
import { averagePositions, keepPreciseSamples } from "./corner-capture";

describe("averagePositions", () => {
  it("refuse une liste vide", () => {
    expect(() => averagePositions([])).toThrow();
  });

  it("moyenne latitude, longitude et précision de plusieurs lectures", () => {
    const result = averagePositions([
      { lat: 9.0, lng: 1.6, accuracyM: 5 },
      { lat: 9.0002, lng: 1.6002, accuracyM: 9 },
      { lat: 8.9998, lng: 1.5998, accuracyM: 4 },
    ]);
    expect(result.lat).toBeCloseTo(9.0, 5);
    expect(result.lng).toBeCloseTo(1.6, 5);
    expect(result.accuracyM).toBeCloseTo(6, 5);
  });

  it("laisse la précision indéfinie si aucune lecture n'en porte", () => {
    const result = averagePositions([
      { lat: 9, lng: 1.6 },
      { lat: 9.001, lng: 1.601 },
    ]);
    expect(result.accuracyM).toBeUndefined();
  });
});

describe("keepPreciseSamples", () => {
  it("écarte les lectures au-delà du seuil", () => {
    const kept = keepPreciseSamples([
      { lat: 9, lng: 1.6, accuracyM: 6 },
      { lat: 9.01, lng: 1.61, accuracyM: 60 },
      { lat: 9, lng: 1.6, accuracyM: 12 },
    ]);
    expect(kept.map((s) => s.accuracyM)).toEqual([6, 12]);
  });

  it("garde la meilleure moitié si toutes dépassent le seuil", () => {
    const kept = keepPreciseSamples([
      { lat: 9, lng: 1.6, accuracyM: 80 },
      { lat: 9, lng: 1.6, accuracyM: 40 },
      { lat: 9, lng: 1.6, accuracyM: 50 },
      { lat: 9, lng: 1.6, accuracyM: 90 },
    ]);
    expect(kept.map((s) => s.accuracyM)).toEqual([40, 50]);
  });
});
