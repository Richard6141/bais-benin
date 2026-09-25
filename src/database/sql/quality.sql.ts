import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Qualité des données et couverture terrain (pilotage-parcours-ux §2.C3, §2.D), requêtes
// directes (pas de vue : moins de 0,5 s estimée à 50 000 exploitations, voir le plan d'étape).
// Aucune colonne nominative ne sort d'ici, sauf le nom d'agent de la fiche commune, que le
// module ne rend qu'au ministère.

export interface QualitySqlFilters {
  departementCode?: string;
  communeCode?: string;
  /** Périmètre de l'acteur : null = tout le territoire. */
  communeIds: readonly string[] | null;
}

const num = z.coerce.number();
const AGENT_ROLE = Prisma.sql`'AGENT_AGRICULTURE'::"Role"`;

/** Instant JavaScript lu comme horodatage UTC sans fuseau (convention des colonnes Prisma). */
function utc(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

function territory(filters: QualitySqlFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.departementCode) parts.push(Prisma.sql`AND d."code" = ${filters.departementCode}`);
  if (filters.communeCode) parts.push(Prisma.sql`AND c."code" = ${filters.communeCode}`);
  if (filters.communeIds) {
    parts.push(Prisma.sql`AND c."id" = ANY(${filters.communeIds as string[]}::uuid[])`);
  }
  return parts.length > 0 ? Prisma.join(parts, " ") : Prisma.empty;
}

const gapSchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  parcels: num,
  under10: num,
  from10to20: num,
  from20to50: num,
  over50: num,
  median_gap: num.nullable(),
});
export type CommuneGapRow = z.infer<typeof gapSchema>;

// D1 : écart relatif |relevé − déclaré| ÷ déclaré des parcelles relevées, par commune.
export async function readAreaGaps(filters: QualitySqlFilters): Promise<CommuneGapRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH gaps AS (
      SELECT f."commune_id",
             abs(p."computed_area_ha" - p."declared_area_ha") / p."declared_area_ha" AS gap
      FROM "parcel" p
      JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
      WHERE p."archived_at" IS NULL AND p."computed_area_ha" IS NOT NULL
        AND p."declared_area_ha" > 0
    )
    SELECT c."code", c."name", d."code" AS departement_code, count(*)::int AS parcels,
           count(*) FILTER (WHERE g.gap < 0.1)::int AS under10,
           count(*) FILTER (WHERE g.gap >= 0.1 AND g.gap < 0.2)::int AS from10to20,
           count(*) FILTER (WHERE g.gap >= 0.2 AND g.gap < 0.5)::int AS from20to50,
           count(*) FILTER (WHERE g.gap >= 0.5)::int AS over50,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY g.gap) AS median_gap
    FROM gaps g
    JOIN "commune" c ON c."id" = g."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE true ${territory(filters)}
    GROUP BY c."code", c."name", d."code"`;
  return rows.map((row) => gapSchema.parse(row));
}

const medianSchema = z.object({ median_gap: num.nullable() });

/** Écart médian sur tout le périmètre (la médiane ne s'agrège pas depuis les communes). */
export async function readMedianGap(filters: QualitySqlFilters): Promise<number | null> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY abs(p."computed_area_ha" - p."declared_area_ha") / p."declared_area_ha"
           ) AS median_gap
    FROM "parcel" p
    JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
    JOIN "commune" c ON c."id" = f."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE p."archived_at" IS NULL AND p."computed_area_ha" IS NOT NULL
      AND p."declared_area_ha" > 0 ${territory(filters)}`;
  return medianSchema.parse(rows[0] ?? { median_gap: null }).median_gap;
}

const ageSchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  declared_farms: num,
  under30: num,
  from30to180: num,
  over180: num,
});
export type CommuneAgeRow = z.infer<typeof ageSchema>;

// D2 : exploitations DECLARED par ancienneté depuis la déclaration.
export async function readDeclaredAges(
  filters: QualitySqlFilters,
  now: Date,
): Promise<CommuneAgeRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name", d."code" AS departement_code, count(*)::int AS declared_farms,
           count(*) FILTER (WHERE f."created_at" > ${utc(now)} - interval '30 days')::int
             AS under30,
           count(*) FILTER (WHERE f."created_at" <= ${utc(now)} - interval '30 days'
                              AND f."created_at" > ${utc(now)} - interval '180 days')::int
             AS from30to180,
           count(*) FILTER (WHERE f."created_at" <= ${utc(now)} - interval '180 days')::int
             AS over180
    FROM "farm" f
    JOIN "commune" c ON c."id" = f."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE f."archived_at" IS NULL AND f."verification_status" = 'DECLARED'
      ${territory(filters)}
    GROUP BY c."code", c."name", d."code"`;
  return rows.map((row) => ageSchema.parse(row));
}

const communeSchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
});

// D3 : communes sans agent actif (affectation à la commune ou à son département).
export async function readCommunesWithoutAgent(
  filters: QualitySqlFilters,
): Promise<z.infer<typeof communeSchema>[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name", d."code" AS departement_code
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE c."archived_at" IS NULL ${territory(filters)}
      AND NOT EXISTS (
        SELECT 1 FROM "role_assignment" ra
        WHERE ra."role" = ${AGENT_ROLE} AND ra."revoked_at" IS NULL
          AND ((ra."scope_type" = 'COMMUNE' AND ra."scope_id" = c."id")
            OR (ra."scope_type" = 'DEPARTEMENT' AND ra."scope_id" = c."departement_id")))
    ORDER BY c."name"`;
  return rows.map((row) => communeSchema.parse(row));
}

const agentSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  visits: num,
  last_sync_at: z.coerce.date().nullable(),
});
export type AgentActivityRow = z.infer<typeof agentSchema>;

// Agents actifs affectés au périmètre (commune ou département), avec leurs visites depuis
// `since` dans ce périmètre et leur dernière synchronisation reçue.
export async function readAgentActivity(
  filters: QualitySqlFilters,
  since: Date,
): Promise<AgentActivityRow[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    WITH scope AS (
      SELECT c."id", c."departement_id" FROM "commune" c
      JOIN "departement" d ON d."id" = c."departement_id"
      WHERE c."archived_at" IS NULL ${territory(filters)}
    ),
    agents AS (
      SELECT DISTINCT ra."user_id" FROM "role_assignment" ra
      WHERE ra."role" = ${AGENT_ROLE} AND ra."revoked_at" IS NULL
        AND ((ra."scope_type" = 'COMMUNE' AND ra."scope_id" IN (SELECT "id" FROM scope))
          OR (ra."scope_type" = 'DEPARTEMENT'
              AND ra."scope_id" IN (SELECT "departement_id" FROM scope)))
    )
    SELECT a."user_id", u."display_name" AS name,
           (SELECT count(*)::int FROM "farm_verification" v
             JOIN "farm" f ON f."id" = v."farm_id"
             WHERE v."agent_id" = a."user_id" AND v."visited_at" > ${utc(since)}
               AND f."commune_id" IN (SELECT "id" FROM scope)) AS visits,
           (SELECT max(s."received_at") FROM "sync_command" s WHERE s."user_id" = a."user_id")
             AS last_sync_at
    FROM agents a JOIN "user" u ON u."id" = a."user_id"
    ORDER BY u."display_name"`;
  return rows.map((row) => agentSchema.parse(row));
}

const countSchema = z.object({ n: num });

// D4 : paires de producteurs actifs de même commune, mêmes nom et prénom (sans casse), années
// de naissance à un an près ou inconnues. Compte seulement.
export async function countProbableDuplicates(filters: QualitySqlFilters): Promise<number> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT count(*)::int AS n
    FROM "farmer" a
    JOIN "farmer" b ON b."commune_id" = a."commune_id" AND a."id" < b."id"
      AND lower(b."last_name") = lower(a."last_name")
      AND lower(b."first_name") = lower(a."first_name")
      AND coalesce(abs(a."birth_year" - b."birth_year"), 0) <= 1
    JOIN "commune" c ON c."id" = a."commune_id"
    JOIN "departement" d ON d."id" = c."departement_id"
    WHERE a."archived_at" IS NULL AND b."archived_at" IS NULL ${territory(filters)}`;
  return countSchema.parse(rows[0] ?? { n: 0 }).n;
}

const freshnessSchema = z.object({
  last_sync_at: z.coerce.date().nullable(),
  last_ingestion_at: z.coerce.date().nullable(),
});

// D5 : dernière synchronisation reçue, dernière ingestion météo terminée.
export async function readSourceFreshness(): Promise<z.infer<typeof freshnessSchema>> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT (SELECT max("received_at") FROM "sync_command") AS last_sync_at,
           (SELECT max("finished_at") FROM "ingestion_run"
             WHERE "status" IN ('SUCCEEDED', 'PARTIAL')) AS last_ingestion_at`;
  return freshnessSchema.parse(rows[0]);
}
