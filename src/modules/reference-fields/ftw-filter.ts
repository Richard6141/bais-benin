// Filtres d'import des contours Fields of The World (ADR-0029). Fonctions pures : la lecture du
// fichier Parquet et l'écriture en base vivent dans scripts/import-ftw-fields.ts.

export type Bbox = readonly [minLng: number, minLat: number, maxLng: number, maxLat: number];

export interface FtwPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface FtwRow {
  id: string;
  geometry: FtwPolygon | { type: string; coordinates: unknown };
  areaM2: number;
  confidence: number | null;
  year: number;
}

export interface FtwFilter {
  bbox: Bbox;
  minConfidence: number;
  minAreaHa: number;
}

export const DEFAULT_MIN_CONFIDENCE = 69;
export const DEFAULT_MIN_AREA_HA = 0.05;

export function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Emprise d'un polygone, ou null s'il n'a pas d'anneau extérieur exploitable. */
export function polygonBbox(polygon: FtwPolygon): Bbox | null {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const point of ring) {
    const lng = point[0];
    const lat = point[1];
    if (lng === undefined || lat === undefined) return null;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function isPolygon(geometry: FtwRow["geometry"]): geometry is FtwPolygon {
  if (geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return false;
  const ring = (geometry.coordinates as number[][][])[0];
  return Array.isArray(ring) && ring.length >= 4;
}

/**
 * Garde les champs assez fiables et assez grands, à l'intérieur de l'emprise. Une confiance nulle
 * (hors de la couche du fournisseur) n'est pas une note basse : elle est gardée si le seuil est 0.
 */
export function keepRow(row: FtwRow, filter: FtwFilter): row is FtwRow & { geometry: FtwPolygon } {
  if (!isPolygon(row.geometry)) return false;
  if (row.areaM2 / 10_000 < filter.minAreaHa) return false;
  if (
    filter.minConfidence > 0 &&
    (row.confidence === null || row.confidence < filter.minConfidence)
  ) {
    return false;
  }
  const box = polygonBbox(row.geometry);
  return box !== null && bboxesIntersect(box, filter.bbox);
}

/** Arrondi à 6 décimales (environ 10 cm) : réduit la taille des extraits sans perte utile. */
export function roundCoordinates(polygon: FtwPolygon): FtwPolygon {
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    type: "Polygon",
    coordinates: polygon.coordinates.map((ring) =>
      ring.map((p) => [round(p[0] ?? 0), round(p[1] ?? 0)]),
    ),
  };
}

/** Année d'un horodatage ISO ou d'une date, 2025 par défaut. */
export function yearOf(value: unknown): number {
  const date = value instanceof Date ? value : new Date(String(value));
  const year = date.getUTCFullYear();
  return Number.isFinite(year) ? year : 2025;
}
