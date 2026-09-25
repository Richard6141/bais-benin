import { z } from "zod";
import { prisma } from "@/database/client";
import type { Actor } from "@/modules/authorization";
import { scopedCommunes } from "./scope";

// Référentiel embarqué par la PWA agent pour travailler sans réseau : communes du périmètre
// avec géométrie simplifiée (rattachement d'un point GPS hors ligne), cultures, campagnes,
// unités locales. Versionné par la date de la donnée la plus récente.

export interface ReferentielBundle {
  version: string;
  generatedAt: string;
  communes: Array<{
    code: string;
    name: string;
    departementCode: string;
    departementName: string;
    zoneCode: string | null;
    rainfallRegime: "BIMODAL" | "UNIMODAL" | null;
    centroid: [number, number];
    geometry: unknown;
  }>;
  crops: Array<{
    code: string;
    nameFr: string;
    category: string;
    cycle: string;
    tradeUnit: string;
    mainZoneCodes: string[];
    calendar: unknown;
    colorHex: string | null;
  }>;
  campaigns: Array<{
    code: string;
    startYear: number;
    status: string;
    startsOn: string;
    endsOn: string;
  }>;
  units: Array<{ code: string; label: string; kgFactor: number | null }>;
}

export const HARVEST_UNITS: ReferentielBundle["units"] = [
  { code: "KG", label: "kilogramme", kgFactor: 1 },
  { code: "T", label: "tonne", kgFactor: 1000 },
  { code: "BAG_100KG", label: "sac de 100 kg", kgFactor: 100 },
  { code: "BAG_50KG", label: "sac de 50 kg", kgFactor: 50 },
  { code: "BUNCH", label: "régime", kgFactor: null },
  { code: "HEAP", label: "tas", kgFactor: null },
  { code: "BASIN", label: "bassine", kgFactor: null },
];

const communeRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  departement_code: z.string(),
  departement_name: z.string(),
  zone_code: z.string().nullable(),
  rainfall_regime: z.enum(["BIMODAL", "UNIMODAL"]).nullable(),
  lng: z.number(),
  lat: z.number(),
  geometry: z.string(),
  updated_at: z.coerce.date(),
});

async function allowedCommuneCodes(actor: Actor): Promise<Set<string> | "all" | "none"> {
  const scope = await scopedCommunes(actor);
  if (scope === "all" || scope === "none") return scope;
  return new Set(scope.map((c) => c.code));
}

export async function buildReferentiel(
  actor: Actor,
  requestedCodes?: string[],
): Promise<ReferentielBundle> {
  const allowed = await allowedCommuneCodes(actor);
  const requested = requestedCodes && requestedCodes.length > 0 ? new Set(requestedCodes) : null;

  const communeRows =
    allowed === "none"
      ? []
      : await prisma.$queryRaw<unknown[]>`
    SELECT c."code", c."name", d."code" AS departement_code, d."name" AS departement_name,
           z."code" AS zone_code, z."rainfall_regime"::text AS rainfall_regime,
           ST_X(c."centroid"::geometry) AS lng, ST_Y(c."centroid"::geometry) AS lat,
           ST_AsGeoJSON(ST_SimplifyPreserveTopology(c."geom"::geometry, 0.0005)) AS geometry,
           c."updated_at"
    FROM "commune" c
    JOIN "departement" d ON d."id" = c."departement_id"
    LEFT JOIN "agro_ecological_zone" z ON z."id" = c."agro_ecological_zone_id"
    WHERE c."archived_at" IS NULL AND c."geom" IS NOT NULL
    ORDER BY c."code"`;
  const selectedCommunes = communeRows
    .map((raw) => communeRowSchema.parse(raw))
    .filter(
      (row) =>
        (allowed === "all" || (allowed !== "none" && allowed.has(row.code))) &&
        (!requested || requested.has(row.code)),
    );

  const [crops, campaigns] = await Promise.all([
    prisma.crop.findMany({
      where: { archivedAt: null },
      orderBy: { nameFr: "asc" },
      select: {
        code: true,
        nameFr: true,
        category: true,
        cycle: true,
        tradeUnit: true,
        mainZoneCodes: true,
        calendar: true,
        colorHex: true,
        updatedAt: true,
      },
    }),
    prisma.agriculturalCampaign.findMany({
      where: { archivedAt: null },
      orderBy: { startYear: "desc" },
      select: {
        code: true,
        startYear: true,
        status: true,
        startsOn: true,
        endsOn: true,
        updatedAt: true,
      },
    }),
  ]);

  const latest = [
    ...selectedCommunes.map((c) => c.updated_at),
    ...crops.map((c) => c.updatedAt),
    ...campaigns.map((c) => c.updatedAt),
  ].reduce((max, d) => (d > max ? d : max), new Date(0));

  return {
    version: latest.toISOString(),
    generatedAt: new Date().toISOString(),
    communes: selectedCommunes.map((row) => ({
      code: row.code,
      name: row.name,
      departementCode: row.departement_code,
      departementName: row.departement_name,
      zoneCode: row.zone_code,
      rainfallRegime: row.rainfall_regime,
      centroid: [row.lng, row.lat],
      geometry: JSON.parse(row.geometry) as unknown,
    })),
    crops: crops.map((crop) => ({
      code: crop.code,
      nameFr: crop.nameFr,
      category: crop.category,
      cycle: crop.cycle,
      tradeUnit: crop.tradeUnit,
      mainZoneCodes: crop.mainZoneCodes,
      calendar: crop.calendar,
      colorHex: crop.colorHex,
    })),
    campaigns: campaigns.map((c) => ({
      code: c.code,
      startYear: c.startYear,
      status: c.status,
      startsOn: c.startsOn.toISOString().slice(0, 10),
      endsOn: c.endsOn.toISOString().slice(0, 10),
    })),
    units: HARVEST_UNITS,
  };
}
