import { describe, expect, it } from "vitest";
import { segmentField, simplifyRing, traceOutline, type FeatureGrid } from "../field-segmentation";

const SIZE = 64;
const PIXEL_M2 = 100; // pixels de 10 m

interface Surface {
  peak: number;
  low: number;
  swir: number;
}

const BUSH: Surface = { peak: 0.45, low: 0.3, swir: 0.22 };
const MAIZE: Surface = { peak: 0.72, low: 0.18, swir: 0.16 };
const FALLOW: Surface = { peak: 0.3, low: 0.15, swir: 0.3 };

/** Image synthétique : brousse partout, puis des rectangles de surfaces données. */
function grid(
  rects: { x: number; y: number; w: number; h: number; surface: Surface }[],
  options: { noise?: number; clouds?: { x: number; y: number }[] } = {},
): FeatureGrid {
  const peak = new Float32Array(SIZE * SIZE);
  const low = new Float32Array(SIZE * SIZE);
  const swir = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const rect = rects.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      const surface = rect?.surface ?? BUSH;
      // Bruit déterministe, pour ne pas dépendre du hasard.
      const jitter = options.noise ? (((x * 7 + y * 13) % 11) / 10 - 0.5) * options.noise : 0;
      const index = y * SIZE + x;
      peak[index] = surface.peak + jitter;
      low[index] = surface.low + jitter / 2;
      swir[index] = surface.swir;
    }
  }
  for (const cloud of options.clouds ?? []) {
    peak[cloud.y * SIZE + cloud.x] = Number.NaN;
  }
  return { width: SIZE, height: SIZE, peak, low, swir };
}

describe("délimitation assistée d'un champ", () => {
  it("retrouve un champ de maïs rectangulaire de 3 ha au milieu de la brousse", () => {
    const result = segmentField(
      grid([{ x: 20, y: 25, w: 20, h: 15, surface: MAIZE }], { noise: 0.03 }),
      { col: 30, row: 32 },
      PIXEL_M2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const medium = result.candidates.find((c) => c.level === "MEDIUM") ?? result.candidates[0];
    expect(medium?.pixelCount).toBe(300);
    expect(medium?.touchesEdge).toBe(false);
    expect(medium?.confidence).toBeGreaterThan(0.6);
    // Un rectangle se simplifie en quatre coins (anneau fermé : cinq points).
    expect(medium?.ring).toHaveLength(5);
    expect(medium?.ring).toEqual(
      expect.arrayContaining([
        [20, 25],
        [40, 25],
        [40, 40],
        [20, 40],
      ]),
    );
  });

  it("s'arrête à la limite d'une jachère voisine", () => {
    const result = segmentField(
      grid([
        { x: 10, y: 10, w: 15, h: 20, surface: MAIZE },
        { x: 25, y: 10, w: 15, h: 20, surface: FALLOW },
      ]),
      { col: 15, row: 20 },
      PIXEL_M2,
    );
    expect(result.ok && result.candidates.every((c) => c.pixelCount === 300)).toBe(true);
  });

  it("ne propose rien pour un champ de moins de 0,5 ha", () => {
    const result = segmentField(
      grid([{ x: 30, y: 30, w: 6, h: 6, surface: MAIZE }]),
      { col: 32, row: 32 },
      PIXEL_M2,
    );
    expect(result).toEqual({ ok: false, reason: "TOO_SMALL" });
  });

  it("refuse un point masqué par les nuages", () => {
    const result = segmentField(
      grid([{ x: 20, y: 20, w: 20, h: 20, surface: MAIZE }], { clouds: [{ x: 30, y: 30 }] }),
      { col: 30, row: 30 },
      PIXEL_M2,
    );
    expect(result).toEqual({ ok: false, reason: "SEED_INVALID" });
  });

  it("comble un trou de nuage à l'intérieur du champ", () => {
    const result = segmentField(
      grid([{ x: 20, y: 20, w: 20, h: 20, surface: MAIZE }], {
        clouds: [
          { x: 28, y: 28 },
          { x: 29, y: 28 },
        ],
      }),
      { col: 24, row: 24 },
      PIXEL_M2,
    );
    expect(result.ok && result.candidates[0]?.pixelCount).toBe(400);
  });

  it("baisse la confiance d'un champ qui déborde de la fenêtre", () => {
    const result = segmentField(
      grid([{ x: 0, y: 20, w: 30, h: 20, surface: MAIZE }]),
      { col: 10, row: 30 },
      PIXEL_M2,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates[0]?.touchesEdge).toBe(true);
      expect(result.candidates[0]?.confidence).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("contour d'un masque", () => {
  it("suit le bord des pixels en anneau fermé, puis se simplifie", () => {
    const mask = new Uint8Array(16);
    // Carré de 2 × 2 pixels en (1, 1) dans une grille de 4 × 4.
    for (const index of [5, 6, 9, 10]) mask[index] = 1;
    const ring = traceOutline(mask, 4, 4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(simplifyRing(ring, 0.7)).toHaveLength(5);
  });
});
