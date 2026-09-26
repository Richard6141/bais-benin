import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/database/client";

export const FTW_SOURCE_ID = "FTW_GLOBAL";
const BATCH = 500;

export interface ReferenceFieldInput {
  ref: string;
  year: number;
  confidence: number | null;
  areaHa: number;
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

/** Insère par lots ; un champ déjà présent (même source, année, référence) est laissé tel quel. */
export async function insertReferenceFields(rows: readonly ReferenceFieldInput[]): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += BATCH) {
    const values = rows.slice(index, index + BATCH).map(
      (row) =>
        Prisma.sql`(${FTW_SOURCE_ID}, ${row.ref}, ${row.year}, ${row.confidence}, ${row.areaHa},
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geometry)}), 4326)::geography)`,
    );
    inserted += await prisma.$executeRaw`
      INSERT INTO "reference_field" ("source_id", "source_ref", "year", "confidence", "area_ha", "geom")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("source_id", "year", "source_ref") DO NOTHING`;
  }
  return inserted;
}

/** Rattache à sa commune chaque champ qui n'en a pas encore, par son point intérieur. */
export async function assignReferenceFieldCommunes(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "reference_field" f SET "commune_id" = c."id"
    FROM "commune" c
    WHERE f."commune_id" IS NULL AND c."geom" IS NOT NULL
      AND ST_Intersects(c."geom", ST_PointOnSurface(f."geom"::geometry)::geography)`;
}
