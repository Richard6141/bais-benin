import type { CampaignRow, CropStatsRow, FarmStatsRow } from "@/database/sql/dashboard.sql";
import {
  AnalyticsError,
  type AnalyticsProvenance,
  type CampaignRef,
  type CropProductionRow,
  type RegistryFigures,
} from "./dashboard-types";
import { maskSingle, maskSmallCells } from "./k-anonymity";
import { reliabilityFromShare } from "./territory-stats";

// Calculs purs du tableau de bord : sommes des lignes communales, ratios, provenance, campagne
// par défaut. Aucune lecture en base ici, pour pouvoir tout tester sans base.

export interface CropTotals {
  farmCount: number;
  verifiedFarmCount: number;
  parcelCount: number;
  measuredParcelCount: number;
  areaHa: number;
  measuredAreaHa: number;
  harvestedAreaHa: number;
  productionKg: number;
  declaredHarvestCount: number;
  refreshedAt: Date | null;
}

export interface FarmTotals {
  farmCount: number;
  verifiedFarmCount: number;
  declaredAreaHa: number;
  parcelCount: number;
  measuredParcelCount: number;
  measuredAreaHa: number;
  refreshedAt: Date | null;
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export function sumCropRows(rows: readonly CropStatsRow[]): CropTotals {
  return rows.reduce<CropTotals>(
    (t, r) => ({
      farmCount: t.farmCount + r.farm_count,
      verifiedFarmCount: t.verifiedFarmCount + r.verified_farm_count,
      parcelCount: t.parcelCount + r.parcel_count,
      measuredParcelCount: t.measuredParcelCount + r.measured_parcel_count,
      areaHa: t.areaHa + r.area_ha,
      measuredAreaHa: t.measuredAreaHa + r.measured_area_ha,
      harvestedAreaHa: t.harvestedAreaHa + r.harvested_area_ha,
      productionKg: t.productionKg + r.production_kg,
      declaredHarvestCount: t.declaredHarvestCount + r.declared_harvest_count,
      refreshedAt: earliest(t.refreshedAt, r.refreshed_at),
    }),
    {
      farmCount: 0,
      verifiedFarmCount: 0,
      parcelCount: 0,
      measuredParcelCount: 0,
      areaHa: 0,
      measuredAreaHa: 0,
      harvestedAreaHa: 0,
      productionKg: 0,
      declaredHarvestCount: 0,
      refreshedAt: null,
    },
  );
}

export function sumFarmRows(rows: readonly FarmStatsRow[]): FarmTotals {
  return rows.reduce<FarmTotals>(
    (t, r) => ({
      farmCount: t.farmCount + r.farm_count,
      verifiedFarmCount: t.verifiedFarmCount + r.verified_farm_count,
      declaredAreaHa: t.declaredAreaHa + r.declared_area_ha,
      parcelCount: t.parcelCount + r.parcel_count,
      measuredParcelCount: t.measuredParcelCount + r.measured_parcel_count,
      measuredAreaHa: t.measuredAreaHa + r.measured_area_ha,
      refreshedAt: earliest(t.refreshedAt, r.refreshed_at),
    }),
    {
      farmCount: 0,
      verifiedFarmCount: 0,
      declaredAreaHa: 0,
      parcelCount: 0,
      measuredParcelCount: 0,
      measuredAreaHa: 0,
      refreshedAt: null,
    },
  );
}

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Tonnes déclarées, ou null quand aucune récolte n'est déclarée (« non déclarée », pas 0). */
export function tonnes(productionKg: number, declarations: number): number | null {
  return declarations > 0 ? productionKg / 1000 : null;
}

export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function groupRows<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

const FIGURE_FIELDS = [
  "farmCount",
  "farmerCount",
  "declaredAreaHa",
  "measuredAreaHa",
  "measuredParcelShare",
  "verifiedShare",
  "reliability",
  "cropAreaHa",
  "productionT",
  "declaredHarvestCount",
] as const;

/**
 * Tuiles d'un périmètre. Sans culture filtrée, l'effectif et les superficies viennent du
 * registre (`farm`) et la production de toutes les cultures ; avec une culture, tout vient des
 * lignes de cette culture (`crop`).
 */
export function buildFigures(input: {
  farm: FarmTotals | null;
  crop: CropTotals;
  farmerCount: number;
}): RegistryFigures {
  const { farm, crop } = input;
  const farmCount = farm ? farm.farmCount : crop.farmCount;
  const verified = farm ? farm.verifiedFarmCount : crop.verifiedFarmCount;
  const verifiedShare = ratio(verified, farmCount);
  const raw = {
    farmCount,
    farmerCount: input.farmerCount,
    declaredAreaHa: farm ? farm.declaredAreaHa : crop.areaHa,
    measuredAreaHa: farm ? farm.measuredAreaHa : crop.measuredAreaHa,
    measuredParcelShare: farm
      ? ratio(farm.measuredParcelCount, farm.parcelCount)
      : ratio(crop.measuredParcelCount, crop.parcelCount),
    verifiedShare,
    reliability: verifiedShare === null ? null : reliabilityFromShare(verifiedShare),
    cropAreaHa: crop.areaHa,
    productionT: tonnes(crop.productionKg, crop.declaredHarvestCount),
    declaredHarvestCount: crop.declaredHarvestCount,
  };
  return maskSingle(raw, { count: (r) => r.farmCount ?? 0, fields: FIGURE_FIELDS });
}

/** Lignes « production par culture » d'un ensemble de lignes communales, masquées, triées. */
export function buildCropRows(rows: readonly CropStatsRow[]): CropProductionRow[] {
  const raw = [...groupRows(rows, (r) => r.crop_code).values()].map((group) => {
    const first = group[0]!;
    const t = sumCropRows(group);
    const productionT = tonnes(t.productionKg, t.declaredHarvestCount);
    const yieldTPerHa =
      productionT !== null && t.harvestedAreaHa > 0 ? productionT / t.harvestedAreaHa : null;
    const typical = first.typical_yield_t_per_ha;
    const verifiedShare = ratio(t.verifiedFarmCount, t.farmCount);
    return {
      cropCode: first.crop_code,
      cropName: first.crop_name,
      colorHex: first.color_hex,
      farmCount: t.farmCount,
      areaHa: t.areaHa,
      measuredAreaHa: t.measuredAreaHa,
      harvestedAreaHa: t.harvestedAreaHa,
      productionT,
      declaredHarvestCount: t.declaredHarvestCount,
      yieldTPerHa,
      typicalYieldTPerHa: typical,
      yieldGapPct: yieldTPerHa !== null && typical ? changePct(yieldTPerHa, typical) : null,
      verifiedShare,
      reliability: verifiedShare === null ? null : reliabilityFromShare(verifiedShare),
    };
  });
  raw.sort(
    (a, b) =>
      (b.productionT ?? -1) - (a.productionT ?? -1) ||
      b.areaHa - a.areaHa ||
      a.cropName.localeCompare(b.cropName, "fr"),
  );
  return maskSmallCells(raw, {
    count: (r) => r.farmCount,
    groupTotal: true,
    fields: [
      "farmCount",
      "areaHa",
      "measuredAreaHa",
      "harvestedAreaHa",
      "productionT",
      "declaredHarvestCount",
      "yieldTPerHa",
      "yieldGapPct",
      "verifiedShare",
      "reliability",
    ],
  }) as CropProductionRow[];
}

export function toCampaignRef(row: CampaignRow): CampaignRef {
  return { code: row.code, status: row.status, startsOn: row.starts_on, endsOn: row.ends_on };
}

/** Campagne demandée, sinon l'ouverte, sinon la dernière close ; et la précédente. */
export function resolveCampaign(
  campaigns: readonly CampaignRow[],
  code?: string,
): { current: CampaignRow; previous: CampaignRow | null } {
  const usable = campaigns.filter((c) => c.status !== "PLANNED");
  let current: CampaignRow | undefined;
  if (code) {
    current = campaigns.find((c) => c.code === code);
    if (!current) throw new AnalyticsError("NOT_FOUND", `Campagne inconnue : ${code}`);
  } else {
    current = usable.find((c) => c.status === "OPEN") ?? usable.at(-1) ?? campaigns.at(-1);
  }
  if (!current) throw new AnalyticsError("NOT_FOUND", "Aucune campagne agricole enregistrée");
  const previous =
    usable
      .filter((c) => c.start_year < current.start_year)
      .sort((a, b) => b.start_year - a.start_year)[0] ?? null;
  return { current, previous };
}

export function provenanceOf(input: {
  verifiedShare: number | null;
  farmCount: number | null;
  refreshedAt: Date | null;
  synthetic: boolean;
  now: Date;
}): AnalyticsProvenance {
  return {
    source: "registre BAIS",
    refreshedAt: input.refreshedAt,
    generatedAt: input.now,
    reliability: reliabilityFromShare(input.verifiedShare ?? 0),
    verifiedShare: input.verifiedShare,
    farmCount: input.farmCount,
    synthetic: input.synthetic,
  };
}
