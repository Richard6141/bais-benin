import { z } from "zod";
import { prisma } from "@/database/client";

// Requêtes spatiales du territoire. Chaque résultat est validé par Zod : $queryRaw
// ne connaît pas les types des colonnes calculées par PostGIS.

const communeHitSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
});

export type CommuneHit = z.infer<typeof communeHitSchema>;

export async function findCommuneContainingPoint(
  longitude: number,
  latitude: number,
): Promise<CommuneHit | null> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id", c."code", c."name", d."code" AS departement_code, d."name" AS departement_name
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE c."archived_at" IS NULL
      AND ST_Intersects(c."geom", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
    LIMIT 1`;
  const first = rows[0];
  return first ? communeHitSchema.parse(first) : null;
}

const communeGeometrySchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  area_km2: z.coerce.number(),
  geometry: z.string(),
});

export type CommuneGeometry = z.infer<typeof communeGeometrySchema>;

// Géométries simplifiées pour l'affichage. La tolérance est en degrés (≈ 111 km par degré) :
// 0,002° ≈ 220 m, suffisant jusqu'au zoom 10 pour une vue nationale légère.
export async function listCommuneGeometries(toleranceDegrees = 0.002): Promise<CommuneGeometry[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name", d."code" AS departement_code, c."area_km2",
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(c."geom"::geometry, ${toleranceDegrees})) AS geometry
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE c."archived_at" IS NULL AND c."geom" IS NOT NULL
    ORDER BY c."code"`;
  return rows.map((row) => communeGeometrySchema.parse(row));
}

const containmentSchema = z.object({
  commune_code: z.string(),
  inside: z.boolean(),
});

// Contrôle de cohérence : le centroïde de chaque commune doit tomber dans son département.
export async function checkCommuneDepartementContainment(): Promise<
  Array<z.infer<typeof containmentSchema>>
> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code" AS commune_code, ST_Intersects(d."geom", c."centroid") AS inside
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE c."centroid" IS NOT NULL AND d."geom" IS NOT NULL`;
  return rows.map((row) => containmentSchema.parse(row));
}
