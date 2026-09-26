import type { LngLat } from "./polygon-area";

interface Point {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

// Projection équirectangulaire locale en mètres, suffisante à l'échelle d'une parcelle.
function project(points: readonly LngLat[], meanLat: number): Point[] {
  const cosLat = Math.cos(meanLat * (Math.PI / 180));
  return points.map((p) => ({
    x: p.lng * (Math.PI / 180) * EARTH_RADIUS_M * cosLat,
    y: p.lat * (Math.PI / 180) * EARTH_RADIUS_M,
  }));
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Croisement strict de deux segments : les extrémités partagées ne comptent pas.
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function edges(ring: readonly Point[]): Array<[Point, Point]> {
  return ring.map((p, i) => [p, ring[(i + 1) % ring.length]!]);
}

function contains(ring: readonly Point[], p: Point): boolean {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function meanLatOf(...rings: Array<readonly LngLat[]>): number {
  const all = rings.flat();
  return all.reduce((sum, p) => sum + p.lat, 0) / all.length;
}

/** Vrai si deux côtés non contigus du contour se croisent (contour « en huit »). */
export function selfIntersects(points: readonly LngLat[]): boolean {
  if (points.length < 4) return false;
  const ring = project(points, meanLatOf(points));
  const list = edges(ring);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 2; j < list.length; j++) {
      if (i === 0 && j === list.length - 1) continue;
      if (segmentsCross(list[i]![0], list[i]![1], list[j]![0], list[j]![1])) return true;
    }
  }
  return false;
}

/** Vrai si les deux contours se recouvrent : côtés qui se croisent ou un contour dans l'autre. */
export function ringsOverlap(a: readonly LngLat[], b: readonly LngLat[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const lat = meanLatOf(a, b);
  const ra = project(a, lat);
  const rb = project(b, lat);
  for (const [p, q] of edges(ra)) {
    for (const [r, s] of edges(rb)) {
      if (segmentsCross(p, q, r, s)) return true;
    }
  }
  return contains(rb, ra[0]!) || contains(ra, rb[0]!);
}
