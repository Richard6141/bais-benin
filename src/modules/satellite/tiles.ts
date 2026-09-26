import { bboxToEnvelope3857, tileToBBox } from "@/lib/geo/tile-math";
import { BENIN_IMAGERY_BBOX } from "./periods";

// Découpage des images de la vue du ciel, sans réseau ni base : image d'ensemble du pays aux
// petits zooms, tuiles de 512 px aux zooms rapprochés.

/** Zooms des tuiles détaillées (tuiles de 512 px) : en dessous, l'image d'ensemble suffit. */
export const DETAIL_MIN_ZOOM = 9;
/** Au-delà, la carte agrandit la tuile : la résolution native de Sentinel-2 est de 10 m. */
export const DETAIL_MAX_ZOOM = 13;
export const DETAIL_TILE_SIZE = 512;

/** Largeur de l'image d'ensemble ; la hauteur suit les proportions du pays en Web Mercator. */
const OVERVIEW_WIDTH = 1000;

/** Une tuile hors du Bénin n'est jamais demandée à Copernicus. */
export function isDetailTileInBenin(z: number, x: number, y: number): boolean {
  if (z < DETAIL_MIN_ZOOM || z > DETAIL_MAX_ZOOM) return false;
  const [minLon, minLat, maxLon, maxLat] = tileToBBox(z, x, y);
  const [bMinLon, bMinLat, bMaxLon, bMaxLat] = BENIN_IMAGERY_BBOX;
  return minLon < bMaxLon && maxLon > bMinLon && minLat < bMaxLat && maxLat > bMinLat;
}

export function overviewSize(): { width: number; height: number } {
  const [xmin, ymin, xmax, ymax] = bboxToEnvelope3857(BENIN_IMAGERY_BBOX);
  return {
    width: OVERVIEW_WIDTH,
    height: Math.round((OVERVIEW_WIDTH * (ymax - ymin)) / (xmax - xmin)),
  };
}

/** Contour du pays en EPSG:3857 (mètres), polygone ou multipolygone GeoJSON. */
export interface Outline3857 {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

type Rect = readonly [xmin: number, ymin: number, xmax: number, ymax: number];

function rings(outline: Outline3857): number[][][] {
  return outline.type === "Polygon"
    ? (outline.coordinates as number[][][])
    : (outline.coordinates as number[][][][]).flat();
}

/** Point dans le contour, règle pair-impair sur tous les anneaux (trous compris). */
function insideOutline(x: number, y: number, allRings: number[][][]): boolean {
  let inside = false;
  for (const ring of allRings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  const orient = (
    p: readonly [number, number],
    q: readonly [number, number],
    r: readonly [number, number],
  ) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

/**
 * Vrai si le rectangle (tuile en EPSG:3857) touche le contour du pays : un sommet du contour
 * dans la tuile, un coin de la tuile dans le pays, ou deux bords qui se croisent. Une tuile qui
 * ne touche pas le pays ne réserve rien du quota (plus de la moitié du rectangle du Bénin est
 * hors frontière).
 */
export function rectTouchesOutline(rect: Rect, outline: Outline3857): boolean {
  const [xmin, ymin, xmax, ymax] = rect;
  const allRings = rings(outline);
  for (const ring of allRings) {
    for (const [x, y] of ring as [number, number][]) {
      if (x >= xmin && x <= xmax && y >= ymin && y <= ymax) return true;
    }
  }
  const corners: [number, number][] = [
    [xmin, ymin],
    [xmax, ymin],
    [xmax, ymax],
    [xmin, ymax],
  ];
  if (corners.some(([x, y]) => insideOutline(x, y, allRings))) return true;
  for (const ring of allRings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const a = ring[i] as [number, number];
      const b = ring[i + 1] as [number, number];
      for (let k = 0; k < 4; k += 1) {
        if (
          segmentsCross(
            a,
            b,
            corners[k] as [number, number],
            corners[(k + 1) % 4] as [number, number],
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
