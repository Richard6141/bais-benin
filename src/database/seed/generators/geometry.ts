/**
 * Géométrie minimale pour le générateur, sans dépendance : appartenance à un polygone, tirage d'un
 * point dans une commune, construction d'un contour de parcelle.
 *
 * Les coordonnées sont en WGS 84 (EPSG:4326), ordre GeoJSON [longitude, latitude]. Les calculs
 * métriques utilisent une projection équirectangulaire locale : à ces latitudes (6° à 12° N) et à
 * l'échelle d'une parcelle, l'erreur est négligeable devant le bruit voulu sur les superficies.
 */

import type { Random } from "./random";

export type Position = readonly [longitude: number, latitude: number];
export type Ring = readonly Position[];

export interface Polygon {
  type: "Polygon";
  coordinates: readonly Ring[];
}

export interface MultiPolygon {
  type: "MultiPolygon";
  coordinates: readonly (readonly Ring[])[];
}

export type Bbox = readonly [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** Longueur d'un degré de latitude en mètres ; un hectare fait donc environ 0,0009° de côté. */
const METERS_PER_DEGREE = 111_320;

export function bboxOf(ring: Ring): Bbox {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Test du rayon (pair-impair) sur un anneau, frontière exclue. */
export function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Appartenance à un polygone : dans l'anneau extérieur et hors de chaque trou. */
export function pointInPolygon(point: Position, polygon: Polygon | MultiPolygon): boolean {
  const polygons = polygon.type === "Polygon" ? [polygon.coordinates] : polygon.coordinates;
  return polygons.some((rings) => {
    const [outer, ...holes] = rings;
    if (outer === undefined || !pointInRing(point, outer)) return false;
    return !holes.some((hole) => pointInRing(point, hole));
  });
}

/**
 * Tirage par rejet dans la boîte englobante. Pour un MultiPolygon, la partie est choisie au prorata
 * de la surface de sa boîte, pour ne pas surpeupler les îlots. Au-delà de `maxAttempts` échecs
 * (polygone très allongé ou troué), on renvoie le centre de la boîte plutôt que d'échouer.
 */
export function randomPointInPolygon(
  random: Random,
  polygon: Polygon | MultiPolygon,
  maxAttempts = 200,
): Position {
  const parts = polygon.type === "Polygon" ? [polygon.coordinates] : polygon.coordinates;
  const candidates = parts.flatMap((rings) => {
    const outer = rings[0];
    if (outer === undefined) return [];
    const bbox = bboxOf(outer);
    const weight = Math.max((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]), Number.EPSILON);
    return [{ value: { rings, bbox }, weight }];
  });
  if (candidates.length === 0) {
    throw new RangeError("Polygone sans anneau extérieur");
  }
  const part = random.weightedPick(candidates);
  const [minLng, minLat, maxLng, maxLat] = part.bbox;
  const target: Polygon = { type: "Polygon", coordinates: part.rings };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const point: Position = [
      minLng + random.next() * (maxLng - minLng),
      minLat + random.next() * (maxLat - minLat),
    ];
    if (pointInPolygon(point, target)) return point;
  }
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Contour de parcelle autour d'un centre : un carré de la surface demandée, tourné d'un angle
 * quelconque, dont les sommets sont légèrement déplacés et auquel on ajoute parfois un ou deux
 * sommets sur les côtés. Les parcelles réelles ne sont jamais des carrés parfaits, et un contour
 * irrégulier permet de tester les calculs de surface et d'affichage.
 */
export function squareParcelAround(center: Position, areaHa: number, random: Random): Ring {
  const [lng, lat] = center;
  const sideMeters = Math.sqrt(Math.max(areaHa, 0.01) * 10_000);
  const halfLat = sideMeters / 2 / METERS_PER_DEGREE;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const halfLng = halfLat / cosLat;
  const rotation = random.next() * Math.PI * 2;

  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const extraVertices = random.weightedPick([
    { value: 0, weight: 5 },
    { value: 1, weight: 3 },
    { value: 2, weight: 2 },
  ]);
  const sidesWithExtra = new Set(random.shuffle([0, 1, 2, 3]).slice(0, extraVertices));

  const local: [number, number][] = [];
  corners.forEach((corner, index) => {
    const jitter = () => 1 + (random.next() - 0.5) * 0.2;
    local.push([corner[0] * jitter(), corner[1] * jitter()]);
    if (sidesWithExtra.has(index)) {
      const nextCorner = corners[(index + 1) % 4];
      if (nextCorner !== undefined) {
        // Point au milieu du côté, poussé vers l'extérieur ou l'intérieur.
        const bulge = 1 + (random.next() - 0.5) * 0.3;
        local.push([
          ((corner[0] + nextCorner[0]) / 2) * bulge,
          ((corner[1] + nextCorner[1]) / 2) * bulge,
        ]);
      }
    }
  });

  const ring: Position[] = local.map(([x, y]) => {
    const rx = x * Math.cos(rotation) - y * Math.sin(rotation);
    const ry = x * Math.sin(rotation) + y * Math.cos(rotation);
    return [round(lng + rx * halfLng), round(lat + ry * halfLat)];
  });
  const first = ring[0];
  if (first !== undefined) ring.push(first);
  return ring;
}

/** Surface d'un anneau en hectares (formule du lacet en projection locale). */
export function ringAreaHa(ring: Ring): number {
  if (ring.length < 4) return 0;
  const first = ring[0];
  if (first === undefined) return 0;
  const cosLat = Math.cos((first[1] * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    if (a === undefined || b === undefined) continue;
    const ax = (a[0] - first[0]) * cosLat * METERS_PER_DEGREE;
    const ay = (a[1] - first[1]) * METERS_PER_DEGREE;
    const bx = (b[0] - first[0]) * cosLat * METERS_PER_DEGREE;
    const by = (b[1] - first[1]) * METERS_PER_DEGREE;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2 / 10_000;
}

/** Centre de gravité des sommets (le dernier, égal au premier, est ignoré). */
export function centroidOf(ring: Ring): Position {
  const vertices = ring.length > 1 ? ring.slice(0, -1) : ring;
  const sum = vertices.reduce<[number, number]>(
    (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
    [0, 0],
  );
  return [round(sum[0] / vertices.length), round(sum[1] / vertices.length)];
}

/** Six décimales, soit une dizaine de centimètres : la précision d'un bon relevé GPS. */
export function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
