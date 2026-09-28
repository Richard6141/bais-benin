import type { Db } from "./types";

// Écriture des contours de parcelles par PostGIS : validation, centroïde et surface mesurée
// (géodésique, en hectares) calculés côté base, jamais côté client.

export interface Polygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeometryMeasure {
  valid: boolean;
  reason: string | null;
  areaHa: number;
}

export async function measurePolygon(db: Db, polygon: Polygon): Promise<GeometryMeasure> {
  const geojson = JSON.stringify(polygon);
  const rows = await db.$queryRaw<{ valid: boolean; reason: string | null; area_ha: number }[]>`
    SELECT
      ST_IsValid(g) AS valid,
      NULLIF(ST_IsValidReason(g), 'Valid Geometry') AS reason,
      ST_Area(g::geography) / 10000 AS area_ha
    FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326) AS g) AS s`;
  const row = rows[0];
  if (!row) return { valid: false, reason: "Géométrie illisible", areaHa: 0 };
  return { valid: row.valid, reason: row.reason, areaHa: Number(row.area_ha) };
}

/**
 * Motif de refus lisible par l'agent, à la place du texte anglais de PostGIS
 * (ST_IsValidReason), qui suit entre crochets le point en cause.
 */
export function invalidContourMessage(reason: string | null): string {
  if (reason && /too few points/i.test(reason)) {
    return "Contour invalide : les coins relevés sont au même endroit. Il faut au moins trois coins distincts, pris en marchant d'un angle à l'autre.";
  }
  if (reason && /self-intersection/i.test(reason)) {
    return "Contour invalide : deux côtés du contour se croisent. Reprenez les coins dans l'ordre du tour.";
  }
  return "Contour invalide : la forme relevée ne ferme pas une parcelle. Reprenez le relevé.";
}

/** Enregistre le contour, le centroïde et la surface mesurée d'une parcelle. */
export async function writeParcelGeometry(
  db: Db,
  parcelId: string,
  polygon: Polygon,
): Promise<void> {
  const geojson = JSON.stringify(polygon);
  await db.$executeRaw`
    UPDATE "parcel"
    SET "geom" = ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geography,
        "centroid" = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326))::geography,
        "computed_area_ha" = ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geography) / 10000)::numeric, 3)
    WHERE "id" = ${parcelId}::uuid`;
}

export async function writeParcelCentroid(
  db: Db,
  parcelId: string,
  point: readonly [number, number],
): Promise<void> {
  const [lon, lat] = point;
  await db.$executeRaw`
    UPDATE "parcel"
    SET "centroid" = ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography
    WHERE "id" = ${parcelId}::uuid`;
}

export async function writeVerificationPoint(
  db: Db,
  verificationId: string,
  point: readonly [number, number],
): Promise<void> {
  const [lon, lat] = point;
  await db.$executeRaw`
    UPDATE "farm_verification"
    SET "gps_point" = ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography
    WHERE "id" = ${verificationId}::uuid`;
}

/** Écart relatif entre surface déclarée et mesurée, en pourcentage entier ; null sans mesure. */
export function areaGapPercent(declaredHa: number, measuredHa: number | null): number | null {
  if (measuredHa === null || declaredHa <= 0) return null;
  return Math.round((Math.abs(measuredHa - declaredHa) / declaredHa) * 100);
}

export const AREA_GAP_WARNING_PERCENT = 20;

export function areaGapWarning(declaredHa: number, measuredHa: number | null): string | null {
  const gap = areaGapPercent(declaredHa, measuredHa);
  if (gap === null || gap <= AREA_GAP_WARNING_PERCENT) return null;
  return `Écart de ${gap} % entre la surface déclarée (${declaredHa} ha) et la surface mesurée (${(measuredHa as number).toFixed(3)} ha)`;
}
