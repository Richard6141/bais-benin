import type { LngLat } from "./polygon-area";

/** Emprise entourant des points, avec une marge en mètres de chaque côté (cadrage d'une petite carte). */
export function boundsAround(
  points: readonly LngLat[],
  marginM: number,
): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const dLat = marginM / 111_320;
  const dLng = marginM / (111_320 * Math.cos((midLat * Math.PI) / 180));
  return [
    [minLng - dLng, minLat - dLat],
    [maxLng + dLng, maxLat + dLat],
  ];
}
