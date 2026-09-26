import { describe, expect, it } from "vitest";
import { createFixtureRemoteSensingProvider, demoVigour } from "../fixture-provider";

// Vigueur de démonstration : sans elle, toutes les parcelles d'une culture avaient le même pic,
// et l'état des cultures sortait « moyen » partout.

const SQUARE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2.3, 9.3],
      [2.301, 9.3],
      [2.301, 9.301],
      [2.3, 9.301],
      [2.3, 9.3],
    ],
  ],
};

async function peak(commune: string, parcel: string) {
  const { intervals } = await createFixtureRemoteSensingProvider().vegetationStatistics({
    geometry: SQUARE,
    from: "2026-05-01T00:00:00Z",
    to: "2026-10-30T00:00:00Z",
    intervalDays: 10,
    expectedCover: "SEASONAL",
    expectedPeak: { from: "2026-07-15T00:00:00Z", to: "2026-08-31T00:00:00Z" },
    demoKeys: { commune, parcel },
  });
  return Math.max(...intervals.map((interval) => interval.ndviMean ?? 0));
}

describe("vigueur de démonstration", () => {
  it("reste dans ±0,10 et tient surtout à la commune", () => {
    const values = Array.from({ length: 200 }, (_, index) =>
      demoVigour({ commune: `BJ-ALI-00${index % 5}`, parcel: `parcelle-${index}` }),
    );
    expect(Math.max(...values)).toBeLessThanOrEqual(0.1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-0.1);
    expect(new Set(values.map((value) => value.toFixed(4))).size).toBeGreaterThan(150);
    expect(demoVigour(undefined)).toBe(0);
  });

  it("déplace le pic d'une même parcelle d'une commune à l'autre, jamais la base", async () => {
    const peaks = await Promise.all(
      ["BJ-ALI-001", "BJ-ZOU-004", "BJ-MON-002", "BJ-COL-003"].map((code) => peak(code, "p")),
    );
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThan(0.03);
    expect(Math.min(...peaks)).toBeGreaterThan(0.55);
  });
});
