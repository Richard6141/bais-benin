import { describe, expect, it } from "vitest";
import { ringsOverlap, selfIntersects } from "./ring-checks";

const square = (lng: number, lat: number, size = 0.001) => [
  { lng, lat },
  { lng: lng + size, lat },
  { lng: lng + size, lat: lat + size },
  { lng, lat: lat + size },
];

describe("selfIntersects", () => {
  it("accepte un contour simple", () => {
    expect(selfIntersects(square(1.6, 9))).toBe(false);
  });

  it("détecte un contour en huit", () => {
    const [a, b, c, d] = square(1.6, 9);
    expect(selfIntersects([a!, c!, b!, d!])).toBe(true);
  });

  it("ignore moins de quatre points", () => {
    expect(selfIntersects(square(1.6, 9).slice(0, 3))).toBe(false);
  });
});

describe("ringsOverlap", () => {
  it("détecte deux contours qui se chevauchent", () => {
    expect(ringsOverlap(square(1.6, 9), square(1.6005, 9.0005))).toBe(true);
  });

  it("détecte un contour contenu dans un autre", () => {
    expect(ringsOverlap(square(1.6, 9, 0.002), square(1.6005, 9.0005, 0.0003))).toBe(true);
  });

  it("laisse passer deux parcelles voisines", () => {
    expect(ringsOverlap(square(1.6, 9), square(1.602, 9))).toBe(false);
  });
});
