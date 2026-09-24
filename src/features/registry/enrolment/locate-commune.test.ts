import { describe, expect, it } from "vitest";

import { distanceKm, locateCommune, pointInGeometry, type CommuneRef } from "./locate-commune";

function square(code: string, name: string, lng: number, lat: number, size: number): CommuneRef {
  return {
    code,
    name,
    departementCode: "BJ-DO",
    departementName: "Donga",
    zoneCode: "ZAE_4",
    rainfallRegime: "UNIMODAL",
    centroid: [lng + size / 2, lat + size / 2],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng, lat],
          [lng + size, lat],
          [lng + size, lat + size],
          [lng, lat + size],
          [lng, lat],
        ],
      ],
    },
  };
}

const djougou = square("BJ-DON-003", "Djougou", 1.5, 9.5, 0.4);
const copargo = square("BJ-DON-002", "Copargo", 1.9, 9.7, 0.2);

describe("locateCommune", () => {
  it("reconnaît un point à l'intérieur d'un contour, y compris multipolygone", () => {
    expect(pointInGeometry([1.7, 9.7], djougou.geometry)).toBe(true);
    expect(pointInGeometry([2.5, 9.7], djougou.geometry)).toBe(false);
    const multi = {
      type: "MultiPolygon",
      coordinates: [
        (djougou.geometry as { coordinates: unknown[] }).coordinates,
        (copargo.geometry as { coordinates: unknown[] }).coordinates,
      ],
    };
    expect(pointInGeometry([2.0, 9.8], multi)).toBe(true);
  });

  it("rattache une position à la commune qui la contient", () => {
    const located = locateCommune([copargo, djougou], [1.6, 9.6]);
    expect(located?.commune.code).toBe("BJ-DON-003");
    expect(located?.method).toBe("POLYGON");
  });

  it("se rabat sur le centroïde le plus proche en bordure ou sans géométrie", () => {
    const sansGeometrie: CommuneRef = { ...copargo, geometry: null };
    const located = locateCommune([sansGeometrie], [2.02, 9.82]);
    expect(located?.commune.code).toBe("BJ-DON-002");
    expect(located?.method).toBe("NEAREST");
    expect(located?.distanceKm).toBeLessThan(5);
  });

  it("ne rattache rien quand la position est trop loin de toute commune", () => {
    expect(locateCommune([djougou, copargo], [2.4, 6.4])).toBeNull();
  });

  it("mesure les distances à l'échelle du pays", () => {
    // Djougou à Parakou : environ 130 km à vol d'oiseau.
    expect(distanceKm([1.667, 9.708], [2.63, 9.337])).toBeGreaterThan(110);
    expect(distanceKm([1.667, 9.708], [2.63, 9.337])).toBeLessThan(140);
  });
});
