import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";
import { isValidTile, simplifyToleranceMeters } from "@/lib/geo/tile-math";

// Tuiles vectorielles (Mapbox Vector Tiles) produites par PostGIS. Chaque fonction renvoie
// le contenu binaire d'une tuile XYZ, ou null quand rien ne tombe dans son emprise.
//
// Choix :
// - le filtre `geom && ST_Transform(ST_TileEnvelope(z, x, y), 4326)::geography` s'appuie sur
//   l'index spatial des colonnes geography, avant toute transformation coûteuse ;
// - les contours sont simplifiés en mètres (EPSG:3857) à environ deux pixels près pour le zoom
//   demandé, en préservant la topologie, puis découpés par ST_AsMVTGeom avec une marge de 64
//   unités sur une grille de 4 096 ;
// - les paramètres sont castés explicitement : le pilote pg ne distingue pas entier et flottant.

const EXTENT = 4096;
const BUFFER = 64;

const tileRowSchema = z.object({
  tile: z.instanceof(Uint8Array).nullable(),
});

export type TileLayer = "communes" | "departements" | "farms";

function assertTile(z: number, x: number, y: number): void {
  if (!isValidTile(z, x, y)) {
    throw new RangeError(`Tuile invalide : z=${z} x=${x} y=${y}`);
  }
}

function toBuffer(rows: unknown[]): Buffer | null {
  const first = rows[0];
  if (!first) return null;
  const { tile } = tileRowSchema.parse(first);
  if (!tile || tile.byteLength === 0) return null;
  return Buffer.from(tile);
}

/** Tuile des communes : attributs code, name, departement_code, area_km2. */
export async function communeTile(z: number, x: number, y: number): Promise<Buffer | null> {
  assertTile(z, x, y);
  const tolerance = simplifyToleranceMeters(z);
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env
    ),
    q AS (
      SELECT
        c."code",
        c."name",
        d."code" AS departement_code,
        c."area_km2"::float8 AS area_km2,
        ST_AsMVTGeom(
          ST_SimplifyPreserveTopology(ST_Transform(c."geom"::geometry, 3857), ${tolerance}::float8),
          bounds.env, ${EXTENT}::int, ${BUFFER}::int, true
        ) AS geom
      FROM "commune" c
      JOIN "departement" d ON d."id" = c."departement_id"
      CROSS JOIN bounds
      WHERE c."archived_at" IS NULL
        AND c."geom" IS NOT NULL
        AND c."geom" && ST_Transform(bounds.env, 4326)::geography
    )
    SELECT ST_AsMVT(q, 'communes', ${EXTENT}::int, 'geom') AS tile
    FROM q
    WHERE q.geom IS NOT NULL`;
  return toBuffer(rows);
}

/** Tuile des départements : attributs code, name, area_km2. */
export async function departementTile(z: number, x: number, y: number): Promise<Buffer | null> {
  assertTile(z, x, y);
  const tolerance = simplifyToleranceMeters(z);
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env
    ),
    q AS (
      SELECT
        d."code",
        d."name",
        d."area_km2"::float8 AS area_km2,
        ST_AsMVTGeom(
          ST_SimplifyPreserveTopology(ST_Transform(d."geom"::geometry, 3857), ${tolerance}::float8),
          bounds.env, ${EXTENT}::int, ${BUFFER}::int, true
        ) AS geom
      FROM "departement" d
      CROSS JOIN bounds
      WHERE d."archived_at" IS NULL
        AND d."geom" IS NOT NULL
        AND d."geom" && ST_Transform(bounds.env, 4326)::geography
    )
    SELECT ST_AsMVT(q, 'departements', ${EXTENT}::int, 'geom') AS tile
    FROM q
    WHERE q.geom IS NOT NULL`;
  return toBuffer(rows);
}

/**
 * Tuile des exploitations (points) : attributs code, verification_status, commune_id.
 * Prévue pour l'étape 5 ; tant que la table est vide, elle renvoie null.
 */
// Périmètre des exploitations servies dans une tuile : `null` = sans restriction (ministère,
// usage interne) ; une liste d'identifiants de communes (vide = rien) ; `registeredBy` = celles
// que l'agent a enregistrées (ADR-0014) ; `ownerUserId` = celles du producteur connecté.
export type FarmTileScope = string[] | null | { registeredBy: string } | { ownerUserId: string };

function isEmptyScope(scope: FarmTileScope): boolean {
  return Array.isArray(scope) && scope.length === 0;
}

function farmScopeClause(scope: FarmTileScope): Prisma.Sql {
  if (scope === null) return Prisma.empty;
  if (Array.isArray(scope)) return Prisma.sql`AND f."commune_id" = ANY(${scope}::uuid[])`;
  if ("registeredBy" in scope)
    return Prisma.sql`AND f."registered_by_id" = ${scope.registeredBy}::uuid`;
  return Prisma.sql`AND EXISTS (SELECT 1 FROM "farmer" fo WHERE fo."id" = f."farmer_id" AND fo."user_id" = ${scope.ownerUserId}::uuid)`;
}

export async function farmPointsTile(
  z: number,
  x: number,
  y: number,
  scope: FarmTileScope = null,
): Promise<Buffer | null> {
  assertTile(z, x, y);
  if (isEmptyScope(scope)) return null;
  const scopeClause = farmScopeClause(scope);
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env
    ),
    q AS (
      SELECT
        f."code",
        f."verification_status"::text AS verification_status,
        f."commune_id"::text AS commune_id,
        ST_AsMVTGeom(
          ST_Transform(f."location"::geometry, 3857),
          bounds.env, ${EXTENT}::int, ${BUFFER}::int, true
        ) AS geom
      FROM "farm" f
      CROSS JOIN bounds
      WHERE f."archived_at" IS NULL
        AND f."location" IS NOT NULL
        AND f."location" && ST_Transform(bounds.env, 4326)::geography
        ${scopeClause}
    )
    SELECT ST_AsMVT(q, 'farms', ${EXTENT}::int, 'geom') AS tile
    FROM q
    WHERE q.geom IS NOT NULL`;
  return toBuffer(rows);
}

export const PARCEL_TILE_MIN_ZOOM = 12;

/**
 * Tuile des parcelles (polygones) aux zooms rapprochés, dans le périmètre de l'acteur : id, code,
 * culture principale de la campagne la plus récente où la parcelle est cultivée (code et couleur),
 * dernier verdict satellite (ADR-0016).
 */
export async function parcelPolygonsTile(
  z: number,
  x: number,
  y: number,
  scope: FarmTileScope = null,
): Promise<Buffer | null> {
  assertTile(z, x, y);
  if (z < PARCEL_TILE_MIN_ZOOM || isEmptyScope(scope)) return null;
  const scopeClause = farmScopeClause(scope);
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env
    ),
    q AS (
      SELECT
        p."id"::text AS id,
        p."code",
        crop.code AS crop,
        crop.color AS color,
        check_.status AS vegetation,
        ST_AsMVTGeom(
          ST_Transform(p."geom"::geometry, 3857),
          bounds.env, ${EXTENT}::int, ${BUFFER}::int, true
        ) AS geom
      FROM "parcel" p
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      CROSS JOIN bounds
      LEFT JOIN LATERAL (
        SELECT cr."code" AS code, cr."color_hex" AS color
        FROM "parcel_crop" pc
        JOIN "crop" cr ON cr."id" = pc."crop_id"
        JOIN "agricultural_campaign" ac ON ac."id" = pc."campaign_id"
        WHERE pc."parcel_id" = p."id" AND pc."archived_at" IS NULL AND ac."status" <> 'PLANNED'
        ORDER BY ac."start_year" DESC, pc."area_ha" DESC
        LIMIT 1
      ) crop ON true
      LEFT JOIN LATERAL (
        SELECT v."status"::text AS status
        FROM "parcel_vegetation_check" v
        WHERE v."parcel_id" = p."id"
        ORDER BY v."computed_at" DESC
        LIMIT 1
      ) check_ ON true
      WHERE p."archived_at" IS NULL
        AND p."geom" IS NOT NULL
        AND p."geom" && ST_Transform(bounds.env, 4326)::geography
        ${scopeClause}
    )
    SELECT ST_AsMVT(q, 'parcels', ${EXTENT}::int, 'geom') AS tile
    FROM q
    WHERE q.geom IS NOT NULL`;
  return toBuffer(rows);
}
