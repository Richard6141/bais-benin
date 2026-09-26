import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_AREA_HA,
  DEFAULT_MIN_CONFIDENCE,
  bboxesIntersect,
  keepRow,
  polygonBbox,
  roundCoordinates,
  yearOf,
  type FtwRow,
} from "../ftw-filter";

const square = (lng: number, lat: number, size = 0.001) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [lng, lat],
      [lng + size, lat],
      [lng + size, lat + size],
      [lng, lat + size],
      [lng, lat],
    ],
  ],
});

const filter = {
  bbox: [1.6, 9.6, 1.8, 9.8] as const,
  minConfidence: DEFAULT_MIN_CONFIDENCE,
  minAreaHa: DEFAULT_MIN_AREA_HA,
};
const row = (overrides: Partial<FtwRow> = {}): FtwRow => ({
  id: "1",
  geometry: square(1.7, 9.7),
  areaM2: 12_000,
  confidence: 80,
  year: 2025,
  ...overrides,
});

describe("filtres d'import FTW", () => {
  it("garde un champ fiable, assez grand, dans l'emprise", () => {
    expect(keepRow(row(), filter)).toBe(true);
  });

  it("écarte un champ trop petit, peu fiable, sans confiance ou hors emprise", () => {
    expect(keepRow(row({ areaM2: 300 }), filter)).toBe(false);
    expect(keepRow(row({ confidence: 40 }), filter)).toBe(false);
    expect(keepRow(row({ confidence: null }), filter)).toBe(false);
    expect(keepRow(row({ geometry: square(2.5, 9.7) }), filter)).toBe(false);
  });

  it("garde une confiance absente quand le seuil est zéro", () => {
    expect(keepRow(row({ confidence: null }), { ...filter, minConfidence: 0 })).toBe(true);
  });

  it("écarte une géométrie qui n'est pas un polygone exploitable", () => {
    expect(keepRow(row({ geometry: { type: "Point", coordinates: [1.7, 9.7] } }), filter)).toBe(
      false,
    );
    expect(keepRow(row({ geometry: { type: "Polygon", coordinates: [[]] } }), filter)).toBe(false);
  });

  it("calcule l'emprise d'un polygone et le croisement de deux emprises", () => {
    expect(polygonBbox(square(1, 2, 0.5))).toEqual([1, 2, 1.5, 2.5]);
    expect(bboxesIntersect([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true);
    expect(bboxesIntersect([0, 0, 1, 1], [1.1, 0, 2, 1])).toBe(false);
  });

  it("arrondit les coordonnées et lit l'année", () => {
    expect(roundCoordinates(square(1.12345678, 9.98765432)).coordinates[0]?.[0]).toEqual([
      1.123457, 9.987654,
    ]);
    expect(yearOf("2025-01-01T00:00:00.000Z")).toBe(2025);
    expect(yearOf(new Date("2024-06-01T00:00:00Z"))).toBe(2024);
    expect(yearOf("n/a")).toBe(2025);
  });
});
