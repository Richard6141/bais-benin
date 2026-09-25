export interface LngLat {
  lng: number;
  lat: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

// Estimation locale de la surface d'un polygone GPS, pour un retour immédiat pendant le relevé
// hors ligne. Projection équirectangulaire centrée sur le contour (valable à l'échelle d'une
// parcelle) puis formule du lacet. La mesure qui fait foi reste celle du serveur (PostGIS,
// src/modules/sync/handlers/geometry.ts), calculée à la synchronisation.
export function estimatePolygonAreaHa(points: readonly LngLat[]): number {
  if (points.length < 3) return 0;
  const meanLatRad = (points.reduce((sum, p) => sum + p.lat, 0) / points.length) * (Math.PI / 180);
  const cosLat = Math.cos(meanLatRad);
  const projected = points.map((p) => ({
    x: p.lng * (Math.PI / 180) * EARTH_RADIUS_M * cosLat,
    y: p.lat * (Math.PI / 180) * EARTH_RADIUS_M,
  }));
  let sum = 0;
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i]!;
    const b = projected[(i + 1) % projected.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  const areaM2 = Math.abs(sum) / 2;
  return areaM2 / 10_000;
}

/** Ferme l'anneau (premier point répété en fin) attendu par le format GeoJSON Polygon. */
export function closeRing(points: readonly LngLat[]): LngLat[] {
  if (points.length === 0) return [];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.lng === last.lng && first.lat === last.lat) return [...points];
  return [...points, first];
}
