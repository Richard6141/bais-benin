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
