import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Parcelles dont les contours se recouvrent (doublon, erreur de relevé ou conflit foncier). Calcul
// PostGIS sur l'index GiST de parcel.geom. Un simple contact de bordure ou le bruit du GPS ne
// comptent pas : il faut au moins MIN_OVERLAP_M2 de recouvrement et MIN_OVERLAP_SHARE de la plus
// petite des deux parcelles.

export const MIN_OVERLAP_M2 = 100;
export const MIN_OVERLAP_SHARE = 0.05;

const num = z.coerce.number();

const pairSchema = z.object({
  parcel_id: z.string(),
  parcel_code: z.string(),
  farm_id: z.string(),
  farm_code: z.string(),
  registered_by_id: z.string().nullable(),
  other_parcel_id: z.string(),
  other_parcel_code: z.string(),
  other_farm_id: z.string(),
  other_farm_code: z.string(),
  other_registered_by_id: z.string().nullable(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_name: z.string(),
  overlap_m2: num,
  overlap_share: num,
});
export type ParcelOverlapRow = z.infer<typeof pairSchema>;

const PAIRS = (condition: Prisma.Sql) => Prisma.sql`
  SELECT a."id" AS parcel_id, a."code" AS parcel_code, fa."id" AS farm_id, fa."code" AS farm_code,
         fa."registered_by_id",
         b."id" AS other_parcel_id, b."code" AS other_parcel_code, fb."id" AS other_farm_id,
         fb."code" AS other_farm_code, fb."registered_by_id" AS other_registered_by_id,
         c."code" AS commune_code, c."name" AS commune_name, d."name" AS departement_name,
         o.overlap_m2, o.overlap_m2 / NULLIF(LEAST(ST_Area(a."geom"), ST_Area(b."geom")), 0)
           AS overlap_share
  FROM "parcel" a
  JOIN "parcel" b ON b."id" <> a."id" AND ST_Intersects(a."geom", b."geom")
  JOIN "farm" fa ON fa."id" = a."farm_id" AND fa."archived_at" IS NULL
  JOIN "farm" fb ON fb."id" = b."farm_id" AND fb."archived_at" IS NULL
  JOIN "commune" c ON c."id" = fa."commune_id"
  JOIN "departement" d ON d."id" = c."departement_id"
  CROSS JOIN LATERAL (
    SELECT ST_Area(ST_Intersection(a."geom"::geometry, b."geom"::geometry)::geography) AS overlap_m2
  ) o
  WHERE a."archived_at" IS NULL AND b."archived_at" IS NULL
    AND a."geom" IS NOT NULL AND b."geom" IS NOT NULL
    AND o.overlap_m2 >= ${MIN_OVERLAP_M2}
    AND o.overlap_m2 >= ${MIN_OVERLAP_SHARE} * LEAST(ST_Area(a."geom"), ST_Area(b."geom"))
    ${condition}`;

/** Paires distinctes (chacune une fois), les plus grands recouvrements d'abord. */
export async function readParcelOverlaps(filters: {
  departementCode?: string;
  limit: number;
}): Promise<{ rows: ParcelOverlapRow[]; total: number }> {
  const territory = filters.departementCode
    ? Prisma.sql`AND d."code" = ${filters.departementCode}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH pairs AS (${PAIRS(Prisma.sql`AND a."id" < b."id" ${territory}`)})
    SELECT pairs.*, count(*) OVER () AS total FROM pairs
    ORDER BY overlap_m2 DESC, parcel_code
    LIMIT ${filters.limit}`;
  const parsed = rows.map((row) => pairSchema.extend({ total: num }).parse(row));
  return { rows: parsed, total: parsed[0]?.total ?? 0 };
}

/** Recouvrements touchant les parcelles d'une exploitation, vus depuis chacune de ses parcelles. */
export async function readFarmParcelOverlaps(farmId: string): Promise<ParcelOverlapRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    ${PAIRS(Prisma.sql`AND a."farm_id" = ${farmId}::uuid`)}
    ORDER BY a."code", overlap_m2 DESC`;
  return rows.map((row) => pairSchema.parse(row));
}
