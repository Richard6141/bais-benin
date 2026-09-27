import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/modules/authorization";
import { referenceFieldScope } from "./read";

// Écart entre les champs détectés et le registre (ADR-0029) : dans une commune « couverte » (au
// moins une exploitation enregistrée), les champs que le modèle voit et qu'aucune parcelle ne
// recouvre sont autant d'exploitants à trouver. Avec deux campagnes de détection, les champs
// apparus depuis l'année précédente (aucun recouvrement avec elle) se comptent à part : ils
// signalent un défrichement ou une nouvelle mise en culture. Même portée de lecture que la carte.

export const GAP_LIST_LIMIT = 50;

export interface FieldGap {
  communeCode: string;
  communeName: string;
  detected: number;
  /** Champs détectés sans aucune parcelle enregistrée dessus. */
  unregistered: number;
  /** Champs sans équivalent l'année précédente, ou null faute de détection de l'année précédente. */
  appeared: number | null;
}

const rowSchema = z.object({
  code: z.string(),
  name: z.string(),
  detected: z.coerce.number(),
  unregistered: z.coerce.number(),
  appeared: z.coerce.number().nullable(),
});

export async function listFieldGaps(actor: Actor, year: number): Promise<FieldGap[]> {
  const scope = await referenceFieldScope(actor);
  if (scope !== null && scope.length === 0) return [];
  const scopeClause =
    scope === null
      ? Prisma.empty
      : Prisma.sql`AND c."id" IN (${Prisma.join(scope.map((id) => Prisma.sql`${id}::uuid`))})`;
  const previous = year - 1;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name",
      count(*) AS detected,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM "parcel" p
        WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL AND ST_Intersects(p."geom", f."geom")
      )) AS unregistered,
      CASE WHEN EXISTS (
        SELECT 1 FROM "reference_field" o WHERE o."commune_id" = c."id" AND o."year" = ${previous}::int
      ) THEN count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM "reference_field" o
        WHERE o."year" = ${previous}::int AND o."commune_id" = c."id" AND ST_Intersects(o."geom", f."geom")
      )) END AS appeared
    FROM "reference_field" f
    JOIN "commune" c ON c."id" = f."commune_id"
    WHERE f."year" = ${year}::int
      AND EXISTS (SELECT 1 FROM "farm" fm WHERE fm."commune_id" = c."id" AND fm."archived_at" IS NULL)
      ${scopeClause}
    GROUP BY c."id", c."code", c."name"
    HAVING count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM "parcel" p
      WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL AND ST_Intersects(p."geom", f."geom")
    )) > 0
    ORDER BY unregistered DESC, c."name"
    LIMIT ${GAP_LIST_LIMIT}::int`;
  return rows.map((raw) => {
    const row = rowSchema.parse(raw);
    return {
      communeCode: row.code,
      communeName: row.name,
      detected: row.detected,
      unregistered: row.unregistered,
      appeared: row.appeared,
    };
  });
}
