import { prisma } from "@/database/client";
import type { Actor } from "@/modules/authorization";
import { getFarmDetail } from "./farms";

export interface ParcelContour {
  code: string;
  ring: Array<{ lng: number; lat: number }>;
}

// Contours déjà relevés des autres parcelles d'une exploitation, pour signaler dès le terrain, hors
// ligne, un relevé qui les recouvre. L'accès suit celui de la fiche de l'exploitation.
export async function listOtherParcelContours(
  actor: Actor,
  farmId: string,
  exceptParcelId: string,
): Promise<ParcelContour[]> {
  if (!(await getFarmDetail(actor, farmId))) return [];
  const rows = await prisma.$queryRaw<{ code: string; geojson: string }[]>`
    SELECT "code", ST_AsGeoJSON("geom"::geometry) AS geojson
    FROM "parcel"
    WHERE "farm_id" = ${farmId}::uuid AND "id" <> ${exceptParcelId}::uuid
      AND "archived_at" IS NULL AND "geom" IS NOT NULL`;
  return rows.flatMap((row) => {
    const geometry = JSON.parse(row.geojson) as { type: string; coordinates: number[][][] };
    const outer = geometry.type === "Polygon" ? geometry.coordinates[0] : undefined;
    if (!outer) return [];
    return [{ code: row.code, ring: outer.map(([lng, lat]) => ({ lng: lng!, lat: lat! })) }];
  });
}
