// Import des contours de champs de référence Fields of The World (ADR-0029).
//
//   pnpm tsx scripts/import-ftw-fields.ts --commune BJ-DON-003        (charge en base)
//   pnpm tsx scripts/import-ftw-fields.ts --bbox 1.63,9.68,1.71,9.74  (emprise libre)
//   pnpm tsx scripts/import-ftw-fields.ts --departement BJ-DO --dry-run
//   pnpm tsx scripts/import-ftw-fields.ts --bbox ... --out extrait.json (extrait versionnable)
//   pnpm tsx scripts/import-ftw-fields.ts --estimate                    (échantillon national)
//
// Le fichier du Bénin fait 2 Go (19,4 millions de polygones) : il n'est jamais téléchargé en
// entier. Le pied du fichier donne les statistiques d'emprise de chaque groupe de lignes
// (65 536 lignes, triées dans l'espace) ; seuls les groupes qui croisent l'emprise demandée sont
// lus, par requêtes d'octets. Aucun secret, aucun compte : jeu ouvert CC BY 4.0.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetMetadataAsync,
  parquetReadObjects,
  type AsyncBuffer,
  type FileMetaData,
} from "hyparquet";
import { compressors } from "hyparquet-compressors";
import {
  DEFAULT_MIN_AREA_HA,
  DEFAULT_MIN_CONFIDENCE,
  bboxesIntersect,
  keepRow,
  roundCoordinates,
  yearOf,
  type Bbox,
  type FtwRow,
} from "../src/modules/reference-fields/ftw-filter";

const DEFAULT_URL =
  "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/results-by-admin-conf/admin:country_code=BJ/Benin.parquet";
// Mesure réelle sur la zone pilote de Djougou : 1,4 Mo pour 1 139 champs, index compris.
const BYTES_PER_FIELD = 1300;
const COLUMNS = [
  "id",
  "geometry",
  "metrics:area",
  "confidence",
  "determination:datetime",
  "admin:subdivision_code",
];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function parseBbox(text: string): Bbox {
  const parts = text.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("--bbox attend minLng,minLat,maxLng,maxLat");
  }
  return parts as unknown as Bbox;
}

interface GroupRange {
  index: number;
  start: number;
  end: number;
  bbox: Bbox;
}

function statOf(
  group: FileMetaData["row_groups"][number],
  column: "xmin" | "ymin" | "xmax" | "ymax",
): number {
  const chunk = group.columns.find((c) => c.meta_data?.path_in_schema.join(".").endsWith(column));
  const statistics = chunk?.meta_data?.statistics;
  // Emprise du groupe : plus petit xmin et ymin, plus grand xmax et ymax.
  const value = column.endsWith("min") ? statistics?.min_value : statistics?.max_value;
  return Number(value);
}

function groupRanges(metadata: FileMetaData): GroupRange[] {
  const ranges: GroupRange[] = [];
  let start = 0;
  metadata.row_groups.forEach((group, index) => {
    const end = start + Number(group.num_rows);
    ranges.push({
      index,
      start,
      end,
      bbox: [
        statOf(group, "xmin"),
        statOf(group, "ymin"),
        statOf(group, "xmax"),
        statOf(group, "ymax"),
      ],
    });
    start = end;
  });
  return ranges;
}

async function readGroup(file: AsyncBuffer, range: GroupRange): Promise<FtwRow[]> {
  const rows = (await parquetReadObjects({
    file,
    compressors,
    rowStart: range.start,
    rowEnd: range.end,
    columns: COLUMNS,
  })) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    geometry: row.geometry as FtwRow["geometry"],
    areaM2: Number(row["metrics:area"]),
    confidence:
      row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    year: yearOf(row["determination:datetime"]),
  }));
}

async function resolveBbox(): Promise<Bbox> {
  const explicit = argument("bbox");
  if (explicit) return parseBbox(explicit);
  const { prisma } = await import("../src/database/client");
  const commune = argument("commune");
  const departement = argument("departement");
  if (!commune && !departement) throw new Error("Indiquez --bbox, --commune ou --departement");
  const rows = commune
    ? await prisma.$queryRaw<{ box: string | null }[]>`
        SELECT ST_XMin(g)||','||ST_YMin(g)||','||ST_XMax(g)||','||ST_YMax(g) AS box
        FROM (SELECT geom::geometry AS g FROM commune WHERE code = ${commune}) t`
    : await prisma.$queryRaw<{ box: string | null }[]>`
        SELECT ST_XMin(g)||','||ST_YMin(g)||','||ST_XMax(g)||','||ST_YMax(g) AS box
        FROM (SELECT ST_Collect(c.geom::geometry) AS g FROM commune c
              JOIN departement d ON d.id = c.departement_id WHERE d.code = ${departement}) t`;
  const box = rows[0]?.box;
  if (!box) throw new Error("Territoire introuvable ou sans géométrie");
  return parseBbox(box);
}

async function estimate(file: AsyncBuffer, metadata: FileMetaData) {
  const ranges = groupRanges(metadata);
  const sampleCount = Number(argument("groups") ?? 12);
  const step = Math.max(1, Math.floor(ranges.length / sampleCount));
  const picks = ranges.filter((_, index) => index % step === Math.floor(step / 2));
  const world: Bbox = [-180, -90, 180, 90];
  const filter = {
    bbox: world,
    minConfidence: Number(argument("min-confidence") ?? DEFAULT_MIN_CONFIDENCE),
    minAreaHa: Number(argument("min-area-ha") ?? DEFAULT_MIN_AREA_HA),
  };
  const perDepartement = new Map<string, { raw: number; kept: number }>();
  for (const range of picks) {
    // Sans la géométrie : quelques octets par ligne, la mémoire ne bouge pas. La taille en base se
    // déduit de la mesure réelle de Djougou (environ 1,3 Ko par champ, index compris).
    const rows = (await parquetReadObjects({
      file,
      compressors,
      rowStart: range.start,
      rowEnd: range.end,
      columns: ["metrics:area", "confidence", "admin:subdivision_code"],
    })) as Record<string, unknown>[];
    for (const raw of rows) {
      const code = String(raw["admin:subdivision_code"] ?? "?");
      const entry = perDepartement.get(code) ?? { raw: 0, kept: 0 };
      entry.raw += 1;
      const confidence = raw.confidence === null ? null : Number(raw.confidence);
      const areaHa = Number(raw["metrics:area"]) / 10_000;
      const confident =
        filter.minConfidence <= 0 || (confidence !== null && confidence >= filter.minConfidence);
      if (confident && areaHa >= filter.minAreaHa) entry.kept += 1;
      perDepartement.set(code, entry);
    }
    console.log(`groupe ${range.index} lu`);
  }
  const scale = ranges.length / picks.length;
  let totalKept = 0;
  const lines: string[] = [];
  for (const [code, entry] of [...perDepartement].sort((a, b) => b[1].kept - a[1].kept)) {
    const kept = Math.round(entry.kept * scale);
    const bytes = kept * BYTES_PER_FIELD;
    totalKept += kept;
    lines.push(
      `BJ-${code}  brut ~${Math.round(entry.raw * scale).toLocaleString("fr-FR")}  après filtre ~${kept.toLocaleString("fr-FR")}  base ~${(bytes / 1e6).toFixed(0)} Mo`,
    );
  }
  console.log(lines.join("\n"));
  console.log(
    `total après filtre ~${totalKept.toLocaleString("fr-FR")} (échantillon de ${picks.length} groupes sur ${ranges.length})`,
  );
}

async function main() {
  const url = argument("url") ?? DEFAULT_URL;
  // Le pied du fichier est mis en cache ; les groupes de lignes ne le sont pas : chacun est lu,
  // filtré puis libéré, pour que la mémoire reste bornée à un groupe (environ 65 000 polygones).
  const file = await asyncBufferFromUrl({ url });
  const metadata = await parquetMetadataAsync(cachedAsyncBuffer(file));
  if (flag("estimate")) return estimate(file, metadata);

  const bbox = await resolveBbox();
  const filter = {
    bbox,
    minConfidence: Number(argument("min-confidence") ?? DEFAULT_MIN_CONFIDENCE),
    minAreaHa: Number(argument("min-area-ha") ?? DEFAULT_MIN_AREA_HA),
  };
  const ranges = groupRanges(metadata).filter((range) => bboxesIntersect(range.bbox, bbox));
  console.log(
    `emprise ${bbox.join(",")}, ${ranges.length} groupes de lignes à lire sur ${metadata.row_groups.length}`,
  );

  const out = argument("out");
  const dryRun = flag("dry-run");
  const kept: (FtwRow & { geometry: ReturnType<typeof roundCoordinates> })[] = [];
  let seen = 0;
  for (const range of ranges) {
    const rows = await readGroup(file, range);
    seen += rows.length;
    for (const row of rows) {
      if (keepRow(row, filter)) kept.push({ ...row, geometry: roundCoordinates(row.geometry) });
    }
    console.log(`groupe ${range.index}: ${kept.length} champs gardés (${seen} lus)`);
  }

  if (out) {
    const features = kept.map((row) => ({
      type: "Feature",
      properties: {
        ref: row.id,
        year: row.year,
        confidence: row.confidence,
        areaM2: Math.round(row.areaM2),
      },
      geometry: row.geometry,
    }));
    writeFileSync(out, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
    console.log(`${features.length} champs écrits dans ${out}`);
    return;
  }
  if (dryRun) {
    console.log(`simulation : ${kept.length} champs seraient chargés`);
    return;
  }

  const { insertReferenceFields, assignReferenceFieldCommunes } =
    await import("../src/database/reference-fields-store");
  const inserted = await insertReferenceFields(
    kept.map((row) => ({
      ref: row.id,
      year: row.year,
      confidence: row.confidence,
      areaHa: row.areaM2 / 10_000,
      geometry: row.geometry,
    })),
  );
  const assigned = await assignReferenceFieldCommunes();
  console.log(
    `${inserted} champs insérés (${kept.length - inserted} déjà présents), ${assigned} rattachés à une commune`,
  );
  const { prisma } = await import("../src/database/client");
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
