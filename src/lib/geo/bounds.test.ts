import { describe, expect, it } from "vitest";
import { boundsAround } from "./bounds";

describe("emprise autour de points", () => {
  it("entoure un seul point d'une marge symétrique", () => {
    const [sw, ne] = boundsAround([{ lng: 1.6, lat: 9.7 }], 200);
    expect(sw[0]).toBeLessThan(1.6);
    expect(ne[0]).toBeGreaterThan(1.6);
    expect(sw[1]).toBeLessThan(9.7);
    expect(ne[1]).toBeGreaterThan(9.7);
  });

  it("englobe deux points éloignés avec la même marge", () => {
    const farm = { lng: 1.6, lat: 9.7 };
    const fire = { lng: 1.62, lat: 9.71 };
    const [sw, ne] = boundsAround([farm, fire], 150);
    expect(sw[0]).toBeLessThan(Math.min(farm.lng, fire.lng));
    expect(ne[0]).toBeGreaterThan(Math.max(farm.lng, fire.lng));
    expect(sw[1]).toBeLessThan(Math.min(farm.lat, fire.lat));
    expect(ne[1]).toBeGreaterThan(Math.max(farm.lat, fire.lat));
  });
});
