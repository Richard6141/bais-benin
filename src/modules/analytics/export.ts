import {
  readCampaigns,
  readCropStats,
  readFarmStats,
  type CropStatsRow,
} from "@/database/sql/dashboard.sql";
import { recordAudit } from "@/modules/audit";
import type { Actor } from "@/modules/authorization";
import { groupRows, ratio, resolveCampaign, sumCropRows, tonnes } from "./aggregate";
import { formatCsv, type CsvCell } from "./csv";
import { getCropProduction, parseDashboardFilters, sqlFilters } from "./dashboard";
import { AnalyticsError } from "./dashboard-types";
import { maskSmallCells } from "./k-anonymity";
import type { CsvExport, ExportKind } from "./quality-types";
import { analyticsScope } from "./scope";
import { reliabilityFromShare } from "./territory-stats";

// Exports CSV du tableau de bord (pilotage-parcours-ux §2.E). Lignes déjà masquées (k = 5,
// masquage secondaire par groupe dont le total est exporté), colonne masque_k, provenance sur
// chaque ligne. Chaque export est journalisé (analytics.export : type, filtres, nombre de lignes).

const SOURCE = "registre BAIS";

const INDICATOR_HEADERS = [
  "niveau",
  "code",
  "territoire",
  "campagne",
  "culture_code",
  "culture",
  "exploitations",
  "superficie_declaree_ha",
  "superficie_mesuree_ha",
  "production_t",
  "rendement_t_ha",
  "part_verifiee",
  "fiabilite",
  "masque_k",
  "source",
  "genere_le",
];

interface IndicatorLine {
  level: "pays" | "departement" | "commune";
  code: string;
  name: string;
  cropCode: string;
  cropName: string;
  totals: ReturnType<typeof sumCropRows>;
}

const MASKED = ["totals"] as const;

/** Lignes territoire × culture : pays et départements (ministère), puis communes. */
function indicatorLines(
  rows: readonly CropStatsRow[],
  departementNames: Map<string, string>,
  national: boolean,
): Array<IndicatorLine & { masked: boolean }> {
  const lines: Array<IndicatorLine & { masked: boolean }> = [];
  const mask = (group: IndicatorLine[], groupTotal: boolean) =>
    maskSmallCells(group, { count: (l) => l.totals.farmCount, fields: MASKED, groupTotal }).map(
      (l, i) => ({ ...group[i]!, masked: l.masked }),
    );
  for (const [cropCode, cropRows] of groupRows(rows, (r) => r.crop_code)) {
    const cropName = cropRows[0]!.crop_name;
    const byDepartement = groupRows(cropRows, (r) => r.departement_code);
    if (national) {
      lines.push(
        ...mask(
          [
            {
              level: "pays",
              code: "BJ",
              name: "Bénin",
              cropCode,
              cropName,
              totals: sumCropRows(cropRows),
            },
          ],
          false,
        ),
      );
      lines.push(
        ...mask(
          [...byDepartement.entries()].map(([code, group]) => ({
            level: "departement" as const,
            code,
            name: departementNames.get(code) ?? code,
            cropCode,
            cropName,
            totals: sumCropRows(group),
          })),
          true,
        ),
      );
    }
    for (const group of byDepartement.values()) {
      const communes = [...groupRows(group, (r) => r.commune_code).values()].map((g) => ({
        level: "commune" as const,
        code: g[0]!.commune_code,
        name: g[0]!.commune_name,
        cropCode,
        cropName,
        totals: sumCropRows(g),
      }));
      // Le total du département n'est exporté qu'au ministère : masquage secondaire alors.
      lines.push(...mask(communes, national));
    }
  }
  return lines;
}

async function exportIndicators(actor: Actor, input: unknown, now: Date) {
  const filters = parseDashboardFilters(input);
  const scope = await analyticsScope(actor);
  const { current } = resolveCampaign(await readCampaigns(), filters.campaignCode);
  const where = sqlFilters(filters, scope);
  const [rows, farmRows] = await Promise.all([
    readCropStats([current.id], where),
    readFarmStats(where),
  ]);
  const names = new Map(farmRows.map((r) => [r.departement_code, r.departement_name]));
  const generatedAt = now.toISOString();
  const cells: CsvCell[][] = indicatorLines(rows, names, scope.national).map((l) => {
    const t = l.totals;
    const share = ratio(t.verifiedFarmCount, t.farmCount);
    const production = tonnes(t.productionKg, t.declaredHarvestCount);
    const visible = !l.masked;
    return [
      l.level,
      l.code,
      l.name,
      current.code,
      l.cropCode,
      l.cropName,
      visible ? t.farmCount : null,
      visible ? round(t.areaHa, 2) : null,
      visible ? round(t.measuredAreaHa, 2) : null,
      visible ? round(production, 3) : null,
      visible && production !== null && t.harvestedAreaHa > 0
        ? round(production / t.harvestedAreaHa, 3)
        : null,
      visible ? round(share, 4) : null,
      visible && share !== null ? reliabilityFromShare(share) : null,
      l.masked,
      SOURCE,
      generatedAt,
    ];
  });
  return { filters: { ...filters, campaignCode: current.code }, cells, headers: INDICATOR_HEADERS };
}

const PRODUCTION_HEADERS = [
  "campagne",
  "culture_code",
  "culture",
  "exploitations",
  "superficie_declaree_ha",
  "superficie_mesuree_ha",
  "superficie_recoltee_ha",
  "production_t",
  "rendement_t_ha",
  "rendement_reference_t_ha",
  "ecart_reference_pct",
  "part_verifiee",
  "fiabilite",
  "masque_k",
  "source",
  "genere_le",
];

async function exportProduction(actor: Actor, input: unknown, now: Date) {
  const production = await getCropProduction(actor, input, now);
  const generatedAt = now.toISOString();
  const cells: CsvCell[][] = production.rows.map((r) => [
    production.campaign.code,
    r.cropCode,
    r.cropName,
    r.farmCount,
    round(r.areaHa, 2),
    round(r.measuredAreaHa, 2),
    round(r.harvestedAreaHa, 2),
    round(r.productionT, 3),
    round(r.yieldTPerHa, 3),
    r.typicalYieldTPerHa,
    r.yieldGapPct,
    round(r.verifiedShare, 4),
    r.reliability,
    r.masked,
    SOURCE,
    generatedAt,
  ]);
  return { filters: production.filters, cells, headers: PRODUCTION_HEADERS };
}

function round(value: number | null, digits: number): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function exportAnalyticsCsv(
  actor: Actor,
  kind: ExportKind,
  input: unknown = {},
  now = new Date(),
): Promise<CsvExport> {
  if (kind !== "indicators" && kind !== "production") {
    throw new AnalyticsError("INVALID", `Type d'export inconnu : ${String(kind)}`);
  }
  const built =
    kind === "indicators"
      ? await exportIndicators(actor, input, now)
      : await exportProduction(actor, input, now);
  const prefix = kind === "indicators" ? "indicateurs" : "production-par-culture";
  await recordAudit({
    action: "analytics.export",
    actorId: actor.userId,
    resourceType: "analytics_export",
    resourceId: kind,
    details: { kind, filters: built.filters, rows: built.cells.length },
  });
  return {
    kind,
    filename: `bais-${prefix}-${built.filters.campaignCode}.csv`,
    content: formatCsv(built.headers, built.cells),
    rows: built.cells.length,
  };
}
