import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Fil d'activité en direct : les faits récents du terrain, lus dans les tables où ils sont déjà
// écrits (événements des exploitations, signalements, alertes diffusées, feux, demandes
// d'assistance). Aucune donnée nominative ne sort d'ici : un type, une commune, une position et
// l'identifiant de l'objet pour ouvrir sa fiche quand le lecteur y a droit.

const nullableNum = z.coerce.number().nullable();

const rowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  detail: z.string().nullable(),
  occurred_at: z.coerce.date(),
  commune_code: z.string(),
  commune_name: z.string(),
  departement_name: z.string(),
  farm_id: z.string().nullable(),
  subject_id: z.string().nullable(),
  lng: nullableNum,
  lat: nullableNum,
});
export type LiveActivityRow = z.infer<typeof rowSchema>;

export interface LiveActivityScope {
  /** Exploitations enregistrées par ce compte seulement (agent, ADR-0014) ; null : toutes. */
  registeredBy: string | null;
  /** Communes du périmètre pour les faits communaux (alertes, feux, signalements) ; null : toutes. */
  communeIds: string[] | null;
}

/** Événements d'exploitation repris ; signalements et demandes sont lus dans leur propre table. */
export const FARM_EVENT_KINDS = [
  "CREATED",
  "PARCEL_ADDED",
  "PARCEL_GEOMETRY_SET",
  "CROP_DECLARED",
  "HARVEST_DECLARED",
  "VERIFIED",
];

function communeFilter(column: Prisma.Sql, scope: LiveActivityScope): Prisma.Sql {
  return scope.communeIds === null
    ? Prisma.empty
    : Prisma.sql`AND ${column} = ANY(${scope.communeIds}::uuid[])`;
}

/** Faits postérieurs à `since`, les plus récents d'abord. */
export async function readLiveActivity(
  scope: LiveActivityScope,
  since: Date,
  limit: number,
): Promise<LiveActivityRow[]> {
  const farmScope =
    scope.registeredBy === null
      ? Prisma.empty
      : Prisma.sql`AND f."registered_by_id" = ${scope.registeredBy}::uuid`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT * FROM (
      SELECT e."id"::text AS id, 'farm.' || e."kind" AS kind, NULL::text AS detail,
             e."recorded_at" AS occurred_at, c."code" AS commune_code, c."name" AS commune_name,
             d."name" AS departement_name, f."id"::text AS farm_id,
             e."payload"->>'parcelId' AS subject_id,
             ST_X(COALESCE(pc."centroid", f."location")::geometry) AS lng,
             ST_Y(COALESCE(pc."centroid", f."location")::geometry) AS lat
      FROM "farm_event" e
      JOIN "farm" f ON f."id" = e."farm_id" AND f."archived_at" IS NULL
      JOIN "commune" c ON c."id" = f."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      LEFT JOIN LATERAL (
        SELECT p."centroid" FROM "parcel" p
        WHERE p."farm_id" = f."id" AND p."centroid" IS NOT NULL
          AND p."id"::text = e."payload"->>'parcelId'
        LIMIT 1
      ) pc ON true
      WHERE e."recorded_at" > ${since} AND e."kind" = ANY(${FARM_EVENT_KINDS}::text[])
        ${farmScope}

      UNION ALL
      SELECT r."id"::text, 'report.created', r."type"::text, r."created_at",
             c."code", c."name", d."name", NULL, r."id"::text,
             ST_X(r."location"::geometry), ST_Y(r."location"::geometry)
      FROM "field_report" r
      JOIN "commune" c ON c."id" = r."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE r."created_at" > ${since} ${communeFilter(Prisma.sql`r."commune_id"`, scope)}

      UNION ALL
      SELECT a."id"::text, 'alert.raised', a."severity"::text, a."created_at",
             c."code", c."name", d."name", NULL, a."id"::text,
             ST_X(c."centroid"::geometry), ST_Y(c."centroid"::geometry)
      FROM "alert" a
      JOIN "commune" c ON c."id" = a."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE a."created_at" > ${since} AND a."awaiting_confirmation" = false
        ${communeFilter(Prisma.sql`a."commune_id"`, scope)}

      UNION ALL
      SELECT x."id"::text, 'fire.detected', x."confidence"::text, x."created_at",
             c."code", c."name", d."name", NULL, x."id"::text,
             x."longitude"::float8, x."latitude"::float8
      FROM "fire_detection" x
      JOIN "commune" c ON c."id" = x."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE x."created_at" > ${since} ${communeFilter(Prisma.sql`x."commune_id"`, scope)}

      UNION ALL
      SELECT q."id"::text, 'assistance.requested', q."category"::text, q."created_at",
             c."code", c."name", d."name", NULL, q."id"::text,
             ST_X(c."centroid"::geometry), ST_Y(c."centroid"::geometry)
      FROM "assistance_request" q
      JOIN "commune" c ON c."id" = q."commune_id"
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE q."created_at" > ${since} ${communeFilter(Prisma.sql`q."commune_id"`, scope)}
    ) activity
    ORDER BY occurred_at DESC
    LIMIT ${limit}`;
  return rows.map((row) => rowSchema.parse(row));
}
