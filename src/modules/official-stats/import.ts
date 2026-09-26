import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import { MAX_BYTES, normalize, parseOfficialCsv, type CsvLookups, type OfficialLevel } from "./csv";

// Import d'un fichier de statistiques officielles par le ministère (ADR-0034) : tout ou rien, une
// ligne existante (même source, campagne, territoire, culture, indicateur) est remplacée.

export type ImportResult =
  | { ok: true; imported: number; sources: string[]; campaigns: string[] }
  | { ok: false; errors: { line: number; message: string }[] };

/** Cultures par code et par nom français, territoires par code. */
async function loadLookups(): Promise<{ lookups: CsvLookups; cropIds: Map<string, string> }> {
  const [crops, departements, communes] = await Promise.all([
    prisma.crop.findMany({ select: { id: true, code: true, nameFr: true } }),
    prisma.departement.findMany({ select: { code: true } }),
    prisma.commune.findMany({ where: { archivedAt: null }, select: { code: true } }),
  ]);
  const cropNames = new Map<string, string>();
  for (const crop of crops) {
    cropNames.set(normalize(crop.code).replace(/ /g, "_"), crop.code);
    cropNames.set(normalize(crop.nameFr), crop.code);
  }
  const territories = new Map<string, OfficialLevel>([["BJ", "NATIONAL"]]);
  for (const departement of departements) territories.set(departement.code, "DEPARTEMENT");
  for (const commune of communes) territories.set(commune.code, "COMMUNE");
  return {
    lookups: { crops: cropNames, territories },
    cropIds: new Map(crops.map((crop) => [crop.code, crop.id])),
  };
}

export async function importOfficialStatistics(
  actor: Actor,
  file: { name: string; text: string },
): Promise<ImportResult> {
  if (!authorize(actor, "stats.import").allowed) {
    return { ok: false, errors: [{ line: 0, message: "Import réservé au ministère" }] };
  }
  if (new TextEncoder().encode(file.text).length > MAX_BYTES) {
    return { ok: false, errors: [{ line: 0, message: "Fichier de plus de 2 Mo : coupez-le" }] };
  }
  const { lookups, cropIds } = await loadLookups();
  const parsed = parseOfficialCsv(file.text, lookups);
  if (!parsed.ok) return { ok: false, errors: parsed.errors.slice(0, 50) };
  const fileName = file.name.slice(0, 200);
  const rows = parsed.rows;
  await prisma.$executeRaw`
    INSERT INTO "official_crop_statistic" (
      "id", "source_id", "campaign_code", "level", "territory_code", "crop_id", "metric", "value",
      "reference", "file_name", "imported_by_id")
    SELECT gen_random_uuid(), t.source_id, t.campaign_code, t.level::"OfficialStatLevel",
           t.territory_code, t.crop_id, t.metric::"OfficialStatMetric", t.value, t.reference,
           ${fileName}, ${actor.userId}::uuid
      FROM unnest(${rows.map((row) => row.sourceId)}::text[],
                  ${rows.map((row) => row.campaignCode)}::text[],
                  ${rows.map((row) => row.level)}::text[],
                  ${rows.map((row) => row.territoryCode)}::text[],
                  ${rows.map((row) => cropIds.get(row.cropCode)!)}::uuid[],
                  ${rows.map((row) => row.metric)}::text[],
                  ${rows.map((row) => row.value)}::numeric[],
                  ${rows.map((row) => row.reference)}::text[])
        AS t(source_id, campaign_code, level, territory_code, crop_id, metric, value, reference)
    ON CONFLICT ("source_id", "campaign_code", "territory_code", "crop_id", "metric")
    DO UPDATE SET "value" = EXCLUDED."value", "reference" = EXCLUDED."reference",
                  "level" = EXCLUDED."level", "file_name" = EXCLUDED."file_name",
                  "imported_by_id" = EXCLUDED."imported_by_id", "imported_at" = now()`;
  const sources = [...new Set(rows.map((row) => row.sourceId))];
  const campaigns = [...new Set(rows.map((row) => row.campaignCode))].sort();
  await recordAudit({
    action: "stats.official.imported",
    actorId: actor.userId,
    resourceType: "official_crop_statistic",
    details: { fileName, rows: rows.length, sources, campaigns },
  });
  return { ok: true, imported: rows.length, sources, campaigns };
}
