// Arithmétique des tuiles Web Mercator (schéma XYZ, origine en haut à gauche), sans dépendance.
// Sert au service de tuiles vectorielles (src/database/sql/tiles.sql.ts) et aux tests.
// Références : EPSG:3857, rayon 6 378 137 m, latitude utile ±85,0511°.

/** Circonférence équatoriale du sphéroïde Web Mercator, en mètres. */
export const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
/** Demi-largeur du monde en EPSG:3857, en mètres (origine au centre). */
export const WORLD_HALF_SIZE_M = EARTH_CIRCUMFERENCE_M / 2;
/** Latitude maximale représentable en Web Mercator. */
export const MAX_LATITUDE = 85.0511287798066;
/** Zoom maximal admis par le service de tuiles. */
export const MAX_ZOOM = 22;
/** Côté d'une tuile raster de référence, pour la tolérance de simplification. */
const TILE_PIXELS = 256;

export type BBox = readonly [minLon: number, minLat: number, maxLon: number, maxLat: number];
export type Envelope3857 = readonly [xmin: number, ymin: number, xmax: number, ymax: number];

export function isValidTile(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger)) return false;
  if (z < 0 || z > MAX_ZOOM) return false;
  const n = 2 ** z;
  return x >= 0 && x < n && y >= 0 && y < n;
}

function assertValidTile(z: number, x: number, y: number): void {
  if (!isValidTile(z, x, y)) {
    throw new RangeError(`Tuile invalide : z=${z} x=${x} y=${y}`);
  }
}

/** Latitude (degrés) du bord d'une ligne de tuiles, pour une ordonnée fractionnaire. */
function tileRowToLatitude(row: number, n: number): number {
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n)));
  return (latRad * 180) / Math.PI;
}

/** Emprise d'une tuile en WGS84 : [minLon, minLat, maxLon, maxLat]. */
export function tileToBBox(z: number, x: number, y: number): BBox {
  assertValidTile(z, x, y);
  const n = 2 ** z;
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;
  // La ligne y croît vers le sud : le bord haut (y) est la latitude maximale.
  const maxLat = tileRowToLatitude(y, n);
  const minLat = tileRowToLatitude(y + 1, n);
  return [minLon, minLat, maxLon, maxLat];
}

/** Emprise d'une tuile en EPSG:3857, en mètres : [xmin, ymin, xmax, ymax]. */
export function tileToEnvelope3857(z: number, x: number, y: number): Envelope3857 {
  assertValidTile(z, x, y);
  const n = 2 ** z;
  const size = EARTH_CIRCUMFERENCE_M / n;
  const xmin = -WORLD_HALF_SIZE_M + x * size;
  const ymax = WORLD_HALF_SIZE_M - y * size;
  return [xmin, ymax - size, xmin + size, ymax];
}

/** Indices (x, y) de la tuile contenant un point WGS84 au zoom donné. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  if (!Number.isInteger(z) || z < 0 || z > MAX_ZOOM) {
    throw new RangeError(`Zoom invalide : ${z}`);
  }
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  // Les bords extrêmes (lon = 180, lat = -85,05) retombent sur la dernière tuile.
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Projection d'un point WGS84 en EPSG:3857, en mètres : [x, y]. */
export function lonLatTo3857(lon: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const x = (lon / 180) * WORLD_HALF_SIZE_M;
  const y = (Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) / Math.PI) * WORLD_HALF_SIZE_M;
  return [x, y];
}

/** Emprise WGS84 [minLon, minLat, maxLon, maxLat] projetée en EPSG:3857. */
export function bboxToEnvelope3857(bbox: BBox): Envelope3857 {
  const [xmin, ymin] = lonLatTo3857(bbox[0], bbox[1]);
  const [xmax, ymax] = lonLatTo3857(bbox[2], bbox[3]);
  return [xmin, ymin, xmax, ymax];
}

/** Taille d'un pixel de tuile raster 256 px au zoom donné, en mètres à l'équateur. */
export function metersPerPixel(z: number): number {
  return EARTH_CIRCUMFERENCE_M / TILE_PIXELS / 2 ** z;
}

/**
 * Tolérance de simplification en mètres pour un rendu à `pixels` pixels près (2 par défaut) :
 * en dessous, un sommet supplémentaire ne change rien à l'écran mais alourdit la tuile.
 */
export function simplifyToleranceMeters(z: number, pixels = 2): number {
  return metersPerPixel(z) * pixels;
}
