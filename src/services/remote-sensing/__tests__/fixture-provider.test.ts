import { describe, expect, it } from "vitest";
import { lonLatTo3857 } from "@/lib/geo/tile-math";
import { createFixtureRemoteSensingProvider, seasonalNdvi } from "../fixture-provider";

function square(lon: number, lat: number) {
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [lon, lat],
        [lon + 0.001, lat],
        [lon + 0.001, lat + 0.001],
        [lon, lat + 0.001],
        [lon, lat],
      ],
    ],
  };
}

describe("fournisseur de télédétection fixture", () => {
  it("suit une saison unique au nord et deux saisons au sud", () => {
    // Nord (Kandi, 11,1° N) : pic fin août, sec en février.
    expect(seasonalNdvi(11.1, 240)).toBeGreaterThan(0.6);
    expect(seasonalNdvi(11.1, 45)).toBeLessThan(0.25);
    // Sud (Allada, 6,7° N) : pics fin juin et mi-octobre, creux en août.
    expect(seasonalNdvi(6.7, 178)).toBeGreaterThan(seasonalNdvi(6.7, 228));
    expect(seasonalNdvi(6.7, 288)).toBeGreaterThan(seasonalNdvi(6.7, 228));
  });

  it("rend une série reproductible par décade, avec des décades nuageuses sans valeur", async () => {
    const provider = createFixtureRemoteSensingProvider();
    const request = {
      geometry: square(2.1, 10.3),
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-10-31T00:00:00.000Z",
      intervalDays: 10,
    };
    const first = await provider.vegetationStatistics(request);
    const second = await provider.vegetationStatistics(request);
    expect(first).toEqual(second);
    expect(first.intervals).toHaveLength(19);
    expect(first.intervals.some((interval) => interval.ndviMean === null)).toBe(true);
    expect(
      await provider.renderImage({
        layer: "NDVI",
        envelope: [0, 0, 1, 1],
        width: 512,
        height: 512,
        from: request.from,
        to: request.to,
        maxCloudCover: 80,
      }),
    ).toBeNull();
  });
});

describe("radar synthétique", () => {
  it("monte avec la saison au nord et reste plat sur un couvert permanent", async () => {
    const provider = createFixtureRemoteSensingProvider();
    const request = {
      geometry: square(2.1, 10.3),
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-10-31T00:00:00.000Z",
      intervalDays: 12,
      orbitDirection: "DESCENDING" as const,
    };
    const seasonal = await provider.radarStatistics(request);
    const values = seasonal.intervals.map((interval) => interval.rviMean ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.2);
    expect(seasonal.intervals.every((interval) => interval.validPixels > 0)).toBe(true);
    const permanent = await provider.radarStatistics({ ...request, expectedCover: "PERMANENT" });
    const flat = permanent.intervals.map((interval) => interval.rviMean ?? 0);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.05);
  });
});

describe("projection Web Mercator", () => {
  it("place l'origine au centre et un degré de longitude à 111,3 km à l'équateur", () => {
    const [originX, originY] = lonLatTo3857(0, 0);
    expect(originX).toBeCloseTo(0, 6);
    expect(originY).toBeCloseTo(0, 6);
    const [x, y] = lonLatTo3857(1, 0);
    expect(x).toBeCloseTo(111_319.49, 1);
    expect(y).toBeCloseTo(0, 6);
    expect(lonLatTo3857(2.35, 9.3)[1]).toBeCloseTo(1_039_847.4, 0);
  });
});
