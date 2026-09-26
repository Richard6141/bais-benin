import { readCampaigns, type CampaignRow } from "@/database/sql/dashboard.sql";
import {
  readSownAreas,
  readVegetationSignal,
  readYieldHistory,
  type SownAreaRow,
  type YieldHistoryRow,
} from "@/database/sql/forecast.sql";
import type { Actor } from "@/modules/authorization";
import { toCampaignRef } from "./aggregate";
import { AnalyticsError, type CampaignRef } from "./dashboard-types";
import { analyticsScope, requireNational } from "./scope";

// Prévision des récoltes (ADR-0020). Pour chaque culture et chaque commune de la campagne en
// cours : surface semée × rendement de référence. Le rendement de référence est celui des deux
// dernières campagnes closes, pris au niveau le plus fin qui compte assez de récoltes (commune,
// sinon département, sinon pays, sinon rendement type de la culture). La fourchette va du premier
// au troisième quartile des rendements par parcelle au même niveau. La campagne précédente est
// estimée de la même façon avec ses propres rendements, pour une comparaison à méthode égale.
// Ministère seulement pour cette première version.

export const MIN_HARVESTS_FOR_LEVEL = 5;
export const DEFICIT_THRESHOLD_PCT = -15;

export type YieldBasis = "commune" | "departement" | "national" | "typical";

interface YieldReference {
  basis: YieldBasis;
  meanTPerHa: number;
  p25TPerHa: number;
  p75TPerHa: number;
}

export interface YieldIndex {
  commune: Map<string, YieldHistoryRow>;
  departement: Map<string, YieldHistoryRow>;
  national: Map<string, YieldHistoryRow>;
}

export function indexYields(rows: readonly YieldHistoryRow[]): YieldIndex {
  const index: YieldIndex = { commune: new Map(), departement: new Map(), national: new Map() };
  for (const row of rows) {
    if (row.level === "commune") index.commune.set(`${row.crop_code}|${row.commune_id}`, row);
    else if (row.level === "departement")
      index.departement.set(`${row.crop_code}|${row.departement_code}`, row);
    else index.national.set(row.crop_code, row);
  }
  return index;
}

/** Rendement de référence (t/ha) au niveau le plus fin qui a assez de récoltes. */
export function yieldReference(
  index: YieldIndex,
  area: Pick<
    SownAreaRow,
    "crop_code" | "commune_id" | "departement_code" | "typical_yield_t_per_ha"
  >,
): YieldReference {
  const candidates: Array<[YieldBasis, YieldHistoryRow | undefined]> = [
    ["commune", index.commune.get(`${area.crop_code}|${area.commune_id}`)],
    ["departement", index.departement.get(`${area.crop_code}|${area.departement_code}`)],
    ["national", index.national.get(area.crop_code)],
  ];
  for (const [basis, row] of candidates) {
    if (row && row.harvests >= MIN_HARVESTS_FOR_LEVEL && row.area_ha > 0) {
      const mean = row.kg / row.area_ha / 1000;
      return {
        basis,
        meanTPerHa: mean,
        p25TPerHa: (row.p25 ?? row.kg / row.area_ha) / 1000,
        p75TPerHa: (row.p75 ?? row.kg / row.area_ha) / 1000,
      };
    }
  }
  const typical = area.typical_yield_t_per_ha ?? 0;
  return {
    basis: "typical",
    meanTPerHa: typical,
    p25TPerHa: typical * 0.75,
    p75TPerHa: typical * 1.25,
  };
}

export interface Estimate {
  areaHa: number;
  productionT: number;
  lowT: number;
  highT: number;
  /** Surface dont le rendement vient de l'historique de sa propre commune. */
  communeBasisAreaHa: number;
}

export function estimate(rows: readonly SownAreaRow[], index: YieldIndex): Estimate {
  const total: Estimate = { areaHa: 0, productionT: 0, lowT: 0, highT: 0, communeBasisAreaHa: 0 };
  for (const row of rows) {
    const ref = yieldReference(index, row);
    total.areaHa += row.area_ha;
    total.productionT += row.area_ha * ref.meanTPerHa;
    total.lowT += row.area_ha * ref.p25TPerHa;
    total.highT += row.area_ha * ref.p75TPerHa;
    if (ref.basis === "commune") total.communeBasisAreaHa += row.area_ha;
  }
  return total;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export function confidenceOf(e: Estimate): Confidence {
  const share = e.areaHa > 0 ? e.communeBasisAreaHa / e.areaHa : 0;
  if (share >= 0.7) return "HIGH";
  if (share >= 0.3) return "MEDIUM";
  return "LOW";
}

export function changePct(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface ForecastRow {
  code: string;
  name: string;
  areaHa: number;
  productionT: number;
  lowT: number;
  highT: number;
  previousT: number | null;
  changePct: number | null;
  deficit: boolean;
  confidence: Confidence;
  /** Part des parcelles contrôlées par satellite dont la végétation déçoit (null sans contrôle). */
  satelliteFlagShare: number | null;
}

export interface HarvestForecast {
  campaign: CampaignRef;
  previousCampaign: CampaignRef | null;
  historyCampaigns: string[];
  cropCode: string | null;
  cropName: string | null;
  /** Par culture (national), ou par département pour la culture choisie. */
  rows: ForecastRow[];
  deficits: number;
}

function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

export function buildForecastRows(input: {
  current: readonly SownAreaRow[];
  previous: readonly SownAreaRow[];
  historyIndex: YieldIndex;
  previousIndex: YieldIndex | null;
  satellite: ReadonlyMap<string, { checked: number; toVerify: number }>;
  groupBy: "crop" | "departement";
}): ForecastRow[] {
  const key = (r: SownAreaRow) => (input.groupBy === "crop" ? r.crop_code : r.departement_code);
  const label = (r: SownAreaRow) => (input.groupBy === "crop" ? r.crop_name : r.departement_name);
  const currentBy = group(input.current, key);
  const previousBy = group(input.previous, key);
  const rows: ForecastRow[] = [];
  for (const [code, group] of currentBy) {
    const e = estimate(group, input.historyIndex);
    const prevRows = previousBy.get(code);
    const previousT =
      prevRows && input.previousIndex ? estimate(prevRows, input.previousIndex).productionT : null;
    const change = changePct(e.productionT, previousT);
    const sat = input.groupBy === "crop" ? input.satellite.get(code) : undefined;
    rows.push({
      code,
      name: label(group[0]!),
      areaHa: e.areaHa,
      productionT: e.productionT,
      lowT: e.lowT,
      highT: e.highT,
      previousT,
      changePct: change,
      deficit: change !== null && change <= DEFICIT_THRESHOLD_PCT,
      confidence: confidenceOf(e),
      satelliteFlagShare: sat && sat.checked > 0 ? sat.toVerify / sat.checked : null,
    });
  }
  return rows.sort((a, b) => b.productionT - a.productionT || a.name.localeCompare(b.name, "fr"));
}

function pickCampaigns(campaigns: readonly CampaignRow[], code?: string) {
  const sorted = [...campaigns].sort((a, b) => a.start_year - b.start_year);
  const current = code
    ? sorted.find((c) => c.code === code)
    : (sorted.find((c) => c.status === "OPEN") ??
      sorted.filter((c) => c.status !== "PLANNED").at(-1));
  if (!current) throw new AnalyticsError("NOT_FOUND", "Aucune campagne à prévoir");
  const closedBefore = sorted.filter(
    (c) => c.status === "CLOSED" && c.start_year < current.start_year,
  );
  return {
    current,
    previous: closedBefore.at(-1) ?? null,
    history: closedBefore.slice(-2),
  };
}

export async function getHarvestForecast(
  actor: Actor,
  input: { campaignCode?: string; cropCode?: string } = {},
): Promise<HarvestForecast> {
  const scope = await analyticsScope(actor);
  requireNational(scope);
  const cropCode =
    input.cropCode && /^[A-Z][A-Z0-9_]{1,31}$/.test(input.cropCode) ? input.cropCode : null;
  const { current, previous, history } = pickCampaigns(await readCampaigns(), input.campaignCode);
  const [areas, historyYields, previousYields, satellite] = await Promise.all([
    readSownAreas([current.id, ...(previous ? [previous.id] : [])]),
    readYieldHistory(history.map((c) => c.id)),
    previous ? readYieldHistory([previous.id]) : Promise.resolve([]),
    readVegetationSignal(current.id),
  ]);
  const scoped = (rows: readonly SownAreaRow[]) =>
    cropCode ? rows.filter((r) => r.crop_code === cropCode) : rows;
  const rows = buildForecastRows({
    current: scoped(areas.filter((a) => a.campaign_code === current.code)),
    previous: scoped(previous ? areas.filter((a) => a.campaign_code === previous.code) : []),
    historyIndex: indexYields(historyYields),
    previousIndex: previous ? indexYields(previousYields) : null,
    satellite: new Map(
      satellite.map((s) => [s.crop_code, { checked: s.checked, toVerify: s.to_verify }]),
    ),
    groupBy: cropCode ? "departement" : "crop",
  });
  return {
    campaign: toCampaignRef(current),
    previousCampaign: previous ? toCampaignRef(previous) : null,
    historyCampaigns: history.map((c) => c.code),
    cropCode,
    cropName: cropCode ? (areas.find((a) => a.crop_code === cropCode)?.crop_name ?? null) : null,
    rows,
    deficits: rows.filter((r) => r.deficit).length,
  };
}
