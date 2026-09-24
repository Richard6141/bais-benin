import { describe, expect, it } from "vitest";

import {
  EARTH_CIRCUMFERENCE_M,
  MAX_LATITUDE,
  WORLD_HALF_SIZE_M,
  isValidTile,
  lonLatToTile,
  metersPerPixel,
  simplifyToleranceMeters,
  tileToBBox,
  tileToEnvelope3857,
} from "./tile-math";

// Cotonou, place de l'Étoile Rouge.
const COTONOU = { lon: 2.42, lat: 6.37 };

describe("isValidTile", () => {
  it("accepte les indices dans la grille du zoom", () => {
    expect(isValidTile(0, 0, 0)).toBe(true);
    expect(isValidTile(10, 518, 493)).toBe(true);
    expect(isValidTile(3, 7, 7)).toBe(true);
  });

  it("refuse les indices hors grille, négatifs, non entiers ou un zoom hors bornes", () => {
    expect(isValidTile(3, 8, 0)).toBe(false);
    expect(isValidTile(3, 0, 8)).toBe(false);
    expect(isValidTile(3, -1, 0)).toBe(false);
    expect(isValidTile(3, 1.5, 0)).toBe(false);
    expect(isValidTile(-1, 0, 0)).toBe(false);
    expect(isValidTile(23, 0, 0)).toBe(false);
    expect(() => tileToBBox(3, 8, 0)).toThrow(RangeError);
  });
});

describe("tileToBBox", () => {
  it("la tuile 0/0/0 couvre le monde Web Mercator", () => {
    const [minLon, minLat, maxLon, maxLat] = tileToBBox(0, 0, 0);
    expect(minLon).toBe(-180);
    expect(maxLon).toBe(180);
    expect(minLat).toBeCloseTo(-MAX_LATITUDE, 6);
    expect(maxLat).toBeCloseTo(MAX_LATITUDE, 6);
  });

  it("découpe le zoom 1 en quatre quadrants autour de l'équateur et du méridien", () => {
    const [minLon, minLat, maxLon, maxLat] = tileToBBox(1, 1, 1);
    expect(minLon).toBe(0);
    expect(maxLon).toBe(180);
    expect(maxLat).toBeCloseTo(0, 9);
    expect(minLat).toBeCloseTo(-MAX_LATITUDE, 6);
  });

  it("contient Cotonou dans la tuile 10/518/493", () => {
    const [minLon, minLat, maxLon, maxLat] = tileToBBox(10, 518, 493);
    expect(COTONOU.lon).toBeGreaterThanOrEqual(minLon);
    expect(COTONOU.lon).toBeLessThan(maxLon);
    expect(COTONOU.lat).toBeGreaterThanOrEqual(minLat);
    expect(COTONOU.lat).toBeLessThan(maxLat);
    // Une tuile de zoom 10 fait 360 / 1024 degrés de large.
    expect(maxLon - minLon).toBeCloseTo(360 / 1024, 9);
  });
});

describe("lonLatToTile", () => {
  it("calcule la tuile de Cotonou au zoom 10 : x 518, y 493", () => {
    expect(lonLatToTile(COTONOU.lon, COTONOU.lat, 10)).toEqual({ x: 518, y: 493 });
  });

  it("est cohérent avec tileToBBox à plusieurs zooms", () => {
    for (const z of [3, 6, 12, 16]) {
      const { x, y } = lonLatToTile(COTONOU.lon, COTONOU.lat, z);
      const [minLon, minLat, maxLon, maxLat] = tileToBBox(z, x, y);
      expect(COTONOU.lon).toBeGreaterThanOrEqual(minLon);
      expect(COTONOU.lon).toBeLessThan(maxLon);
      expect(COTONOU.lat).toBeGreaterThanOrEqual(minLat);
      expect(COTONOU.lat).toBeLessThan(maxLat);
    }
  });

  it("place le sud du Bénin dans la tuile 6/32/30 et les bords extrêmes sur la dernière tuile", () => {
    expect(lonLatToTile(COTONOU.lon, COTONOU.lat, 6)).toEqual({ x: 32, y: 30 });
    expect(lonLatToTile(180, -90, 2)).toEqual({ x: 3, y: 3 });
    expect(lonLatToTile(-180, 90, 2)).toEqual({ x: 0, y: 0 });
    expect(() => lonLatToTile(0, 0, 40)).toThrow(RangeError);
  });
});

describe("tileToEnvelope3857", () => {
  it("la tuile 0/0/0 couvre toute l'étendue en mètres", () => {
    const [xmin, ymin, xmax, ymax] = tileToEnvelope3857(0, 0, 0);
    expect(xmin).toBeCloseTo(-WORLD_HALF_SIZE_M, 3);
    expect(ymin).toBeCloseTo(-WORLD_HALF_SIZE_M, 3);
    expect(xmax).toBeCloseTo(WORLD_HALF_SIZE_M, 3);
    expect(ymax).toBeCloseTo(WORLD_HALF_SIZE_M, 3);
  });

  it("produit des tuiles carrées dont la taille est divisée par deux à chaque zoom", () => {
    const [xmin, ymin, xmax, ymax] = tileToEnvelope3857(5, 16, 15);
    expect(xmax - xmin).toBeCloseTo(EARTH_CIRCUMFERENCE_M / 32, 3);
    expect(ymax - ymin).toBeCloseTo(EARTH_CIRCUMFERENCE_M / 32, 3);
    // La tuile 5/16/15 touche le méridien de Greenwich et l'équateur par son coin sud-ouest.
    expect(xmin).toBeCloseTo(0, 3);
    expect(ymin).toBeCloseTo(0, 3);
  });

  it("place l'emprise 3857 de la tuile de Cotonou autour de sa projection", () => {
    // x = R * lon (rad), y = R * ln(tan(π/4 + lat/2)).
    const radius = 6_378_137;
    const px = radius * ((COTONOU.lon * Math.PI) / 180);
    const py = radius * Math.log(Math.tan(Math.PI / 4 + (COTONOU.lat * Math.PI) / 360));
    const [xmin, ymin, xmax, ymax] = tileToEnvelope3857(10, 518, 493);
    expect(px).toBeGreaterThanOrEqual(xmin);
    expect(px).toBeLessThan(xmax);
    expect(py).toBeGreaterThanOrEqual(ymin);
    expect(py).toBeLessThan(ymax);
  });
});

describe("tolérance de simplification", () => {
  it("vaut environ 156 km par pixel au zoom 0 et se divise par deux à chaque zoom", () => {
    expect(metersPerPixel(0)).toBeCloseTo(156_543.03, 1);
    expect(metersPerPixel(10)).toBeCloseTo(152.87, 1);
    expect(simplifyToleranceMeters(10)).toBeCloseTo(305.75, 1);
    expect(simplifyToleranceMeters(10, 1)).toBeCloseTo(metersPerPixel(10), 6);
  });
});
