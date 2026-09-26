import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { scopedCommuneIds } from "@/modules/registry";

// Lecture des champs de référence pour l'agent qui en touche un (ADR-0029). Les champs ne sont pas
// nominatifs, mais suivent la portée de lecture du registre : tout le pays pour le ministère, les
// communes d'affectation pour l'agent (toute la commune, pas seulement ses propres
// enregistrements), rien pour le producteur.

/** Communes autorisées : null pour tout le pays, tableau vide pour aucune. */
export async function referenceFieldScope(actor: Actor): Promise<string[] | null> {
  const filter = scopeFilter(actor, "farm.read");
  switch (filter.kind) {
    case "all":
      return null;
    case "none":
    case "self":
      return [];
    case "registered":
    case "territory": {
      const ids = await scopedCommuneIds(actor);
      return ids === "all" ? null : ids;
    }
  }
}

export const MAX_MERGED_FIELDS = 20;

/** Jointure de champs voisins : les fragments à moins de 4 m se rejoignent, au-delà non. */
const CLOSING_METERS = 2;

// ST_AsGeoJSON ne rend que longitude et latitude (aucune géométrie ici n'est en 3D) : même forme
// que le contrat des commandes de synchronisation (src/modules/sync/commands.ts, `polygon`).
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

export interface ReferenceFieldDetail {
  id: string;
  areaHa: number;
  confidence: number | null;
  geometry: z.infer<typeof polygonSchema>;
}

export type ReferenceFieldsRead =
  | {
      status: "ok";
      fields: ReferenceFieldDetail[];
      /** Contour unique : le champ lui-même, ou la fusion des champs contigus choisis. */
      contour: { geometry: z.infer<typeof polygonSchema>; areaHa: number };
    }
  | { status: "not_found" }
  | { status: "not_contiguous" };

const rowSchema = z.object({
  id: z.string(),
  area_ha: z.number(),
  confidence: z.number().nullable(),
  geojson: z.string(),
});
const mergedSchema = z.object({
  kind: z.string().nullable(),
  geojson: z.string().nullable(),
  area_ha: z.number().nullable(),
});

/**
 * Détail des champs demandés et contour à proposer à l'agent. Un champ hors périmètre ou inconnu
 * répond `not_found` comme s'il n'existait pas. Plusieurs champs se fusionnent en un seul contour
 * s'ils se touchent ; sinon `not_contiguous`, l'agent n'ayant à attribuer qu'une parcelle.
 */
export async function readReferenceFields(
  actor: Actor,
  ids: readonly string[],
): Promise<ReferenceFieldsRead> {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_MERGED_FIELDS) return { status: "not_found" };
  const scope = await referenceFieldScope(actor);
  if (scope !== null && scope.length === 0) return { status: "not_found" };
  const scopeClause =
    scope === null
      ? Prisma.empty
      : Prisma.sql`AND f."commune_id" IN (${Prisma.join(scope.map((id) => Prisma.sql`${id}::uuid`))})`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT f."id"::text AS id, f."area_ha"::float8 AS area_ha, f."confidence"::float8 AS confidence,
           ST_AsGeoJSON(f."geom"::geometry, 7) AS geojson
    FROM "reference_field" f
    WHERE f."id" = ANY(${unique}::bigint[]) ${scopeClause}`;
  if (rows.length !== unique.length) return { status: "not_found" };
  const fields = rows.map((raw) => {
    const row = rowSchema.parse(raw);
    return {
      id: row.id,
      areaHa: row.area_ha,
      confidence: row.confidence,
      geometry: polygonSchema.parse(JSON.parse(row.geojson)),
    };
  });
  const [only] = fields;
  if (fields.length === 1 && only) {
    return { status: "ok", fields, contour: { geometry: only.geometry, areaHa: only.areaHa } };
  }

  // UTM 31N : fermeture morphologique en mètres, puis anneau extérieur du seul polygone obtenu.
  const merged = await prisma.$queryRaw<unknown[]>`
    WITH u AS (
      SELECT ST_Buffer(ST_Buffer(ST_Union(ST_Transform(f."geom"::geometry, 32631)), ${CLOSING_METERS}::float8), ${-CLOSING_METERS}::float8) AS g
      FROM "reference_field" f WHERE f."id" = ANY(${unique}::bigint[])
    )
    SELECT GeometryType(g) AS kind,
      ST_AsGeoJSON(ST_Transform(ST_MakePolygon(ST_ExteriorRing(g)), 4326), 7) AS geojson,
      ST_Area(ST_Transform(ST_MakePolygon(ST_ExteriorRing(g)), 4326)::geography) / 10000 AS area_ha
    FROM u WHERE GeometryType(g) = 'POLYGON'`;
  const result = merged[0] ? mergedSchema.parse(merged[0]) : null;
  if (!result?.geojson || result.area_ha === null) return { status: "not_contiguous" };
  return {
    status: "ok",
    fields,
    contour: {
      geometry: polygonSchema.parse(JSON.parse(result.geojson)),
      areaHa: Math.round(result.area_ha * 1000) / 1000,
    },
  };
}
