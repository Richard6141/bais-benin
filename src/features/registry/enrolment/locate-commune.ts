import type { ReferentielBundle } from "@/modules/registry/referentiel";

// Rattachement d'une position GPS à une commune, sans réseau, sur les géométries simplifiées du
// référentiel embarqué. Le test du rayon suffit : les contours sont fermés et non croisés.

type Position = readonly [lng: number, lat: number];
type Ring = readonly Position[];

interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: Ring[];
}

interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: Ring[][];
}

export type CommuneRef = ReferentielBundle["communes"][number];

function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const crosses =
      a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function isPolygon(value: unknown): value is GeoJsonPolygon | GeoJsonMultiPolygon {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    (type === "Polygon" || type === "MultiPolygon") &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

export function pointInGeometry(point: Position, geometry: unknown): boolean {
  if (!isPolygon(geometry)) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => {
    if (!outer || !pointInRing(point, outer)) return false;
    return !holes.some((hole) => pointInRing(point, hole));
  });
}

/** Distance approximative en kilomètres à ces latitudes (projection locale). */
export function distanceKm(a: Position, b: Position): number {
  const cosLat = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (a[0] - b[0]) * cosLat * 111.32;
  const dy = (a[1] - b[1]) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface LocatedCommune {
  commune: CommuneRef;
  /** POLYGON : point dans le contour ; NEAREST : contour absent ou point en bordure, centroïde le plus proche. */
  method: "POLYGON" | "NEAREST";
  distanceKm: number;
}

/**
 * Commune contenant le point, sinon la commune au centroïde le plus proche si elle est à moins
 * de `maxNearestKm` (position juste en bordure, géométrie manquante). Au-delà, null : l'agent
 * choisit dans la liste.
 */
export function locateCommune(
  communes: readonly CommuneRef[],
  point: Position,
  maxNearestKm = 15,
): LocatedCommune | null {
  const containing = communes.find((commune) => pointInGeometry(point, commune.geometry));
  if (containing) {
    return {
      commune: containing,
      method: "POLYGON",
      distanceKm: distanceKm(point, containing.centroid),
    };
  }
  let best: LocatedCommune | null = null;
  for (const commune of communes) {
    const distance = distanceKm(point, commune.centroid);
    if (distance <= maxNearestKm && (!best || distance < best.distanceKm)) {
      best = { commune, method: "NEAREST", distanceKm: distance };
    }
  }
  return best;
}
