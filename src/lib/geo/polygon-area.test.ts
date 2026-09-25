import { describe, expect, it } from "vitest";
import { closeRing, estimatePolygonAreaHa } from "./polygon-area";

describe("estimatePolygonAreaHa", () => {
  it("renvoie 0 pour moins de trois points", () => {
    expect(estimatePolygonAreaHa([{ lng: 1, lat: 6 }])).toBe(0);
    expect(estimatePolygonAreaHa([])).toBe(0);
  });

  it("estime la surface d'un carré d'environ 100 m de côté à environ 1 ha", () => {
    // ~100 m au sol autour de 9° N : environ 0,0009° en latitude, un peu plus en longitude.
    const points = [
      { lng: 1.6, lat: 9.0 },
      { lng: 1.6009, lat: 9.0 },
      { lng: 1.6009, lat: 9.0009 },
      { lng: 1.6, lat: 9.0009 },
    ];
    const areaHa = estimatePolygonAreaHa(points);
    expect(areaHa).toBeGreaterThan(0.9);
    expect(areaHa).toBeLessThan(1.1);
  });
});

describe("closeRing", () => {
  it("répète le premier point en fin d'anneau", () => {
    const ring = closeRing([
      { lng: 1, lat: 6 },
      { lng: 2, lat: 6 },
      { lng: 2, lat: 7 },
    ]);
    expect(ring).toHaveLength(4);
    expect(ring[3]).toEqual(ring[0]);
  });

  it("ne double pas un anneau déjà fermé", () => {
    const ring = closeRing([
      { lng: 1, lat: 6 },
      { lng: 2, lat: 6 },
      { lng: 2, lat: 7 },
      { lng: 1, lat: 6 },
    ]);
    expect(ring).toHaveLength(4);
  });
});
