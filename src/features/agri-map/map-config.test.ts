import { describe, expect, it } from "vitest";
import { CHOROPLETH_SCALE, classIndex, quantileBreaks } from "./map-config";

describe("classes de la choroplèthe", () => {
  it("ignore les zéros et renvoie des seuils croissants distincts", () => {
    const breaks = quantileBreaks([0, 0, 10, 20, 30, 40, 50, 60, 70]);
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.length).toBeLessThan(CHOROPLETH_SCALE.length);
    expect([...breaks].sort((a, b) => a - b)).toEqual(breaks);
    expect(new Set(breaks).size).toBe(breaks.length);
  });

  it("renvoie aucun seuil sans valeur positive", () => {
    expect(quantileBreaks([0, 0])).toEqual([]);
  });

  it("classe une valeur nulle hors échelle et une valeur maximale dans la dernière classe", () => {
    const breaks = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(classIndex(0, breaks)).toBe(-1);
    expect(classIndex(1, breaks)).toBe(0);
    expect(classIndex(10, breaks)).toBe(Math.min(breaks.length, CHOROPLETH_SCALE.length - 1));
  });
});
