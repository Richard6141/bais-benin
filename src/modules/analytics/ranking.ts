import {
  countFarmers,
  readCampaigns,
  readCropStats,
  readFarmStats,
  registryIsSynthetic,
  type CropStatsRow,
  type FarmStatsRow,
} from "@/database/sql/dashboard.sql";
import type { Actor } from "@/modules/authorization";
import {
  groupRows,
  provenanceOf,
  ratio,
  resolveCampaign,
  sumCropRows,
  sumFarmRows,
  toCampaignRef,
  tonnes,
} from "./aggregate";
import { aggregatesRefreshedAt, parseDashboardFilters, sqlFilters } from "./dashboard";
import type { RankingSortKey, TerritoryRanking, TerritoryRankingRow } from "./dashboard-types";
import { maskSingle, maskSmallCells } from "./k-anonymity";
import { analyticsScope, requireNational } from "./scope";
import { reliabilityFromShare } from "./territory-stats";

// Classement des territoires (pilotage-parcours-ux §2.B) : les 12 départements avec une ligne
// « Bénin » en pied, ou les communes d'un département avec le département en pied. Ministère
// seulement. Avec une culture filtrée, effectifs et superficies sont ceux de la culture dans la
// campagne ; sinon ceux du registre, et la production couvre toutes les cultures.

const SORT_KEYS: readonly RankingSortKey[] = [
  "farmCount",
  "declaredAreaHa",
  "measuredAreaHa",
  "verifiedShare",
  "productionT",
];

const MASKED_FIELDS = [
  "farmCount",
  "farmerCount",
  "declaredAreaHa",
  "measuredAreaHa",
  "measuredParcelShare",
  "verifiedShare",
  "productionT",
  "reliability",
] as const;

type RawRow = Omit<TerritoryRankingRow, "masked" | "rank">;

function rowFrom(
  identity: Pick<RawRow, "code" | "name" | "departementCode" | "zoneCode">,
  farms: FarmStatsRow[] | null,
  crops: CropStatsRow[],
  farmerCount: number,
): RawRow {
  const c = sumCropRows(crops);
  const f = farms ? sumFarmRows(farms) : null;
  const farmCount = f ? f.farmCount : c.farmCount;
  const verifiedShare = ratio(f ? f.verifiedFarmCount : c.verifiedFarmCount, farmCount);
  return {
    ...identity,
    farmCount,
    farmerCount,
    declaredAreaHa: f ? f.declaredAreaHa : c.areaHa,
    measuredAreaHa: f ? f.measuredAreaHa : c.measuredAreaHa,
    measuredParcelShare: f
      ? ratio(f.measuredParcelCount, f.parcelCount)
      : ratio(c.measuredParcelCount, c.parcelCount),
    verifiedShare,
    productionT: tonnes(c.productionKg, c.declaredHarvestCount),
    reliability: verifiedShare === null ? null : reliabilityFromShare(verifiedShare),
  };
}

export async function getTerritoryRanking(
  actor: Actor,
  input: { level?: "departement" | "commune"; sortBy?: RankingSortKey } & Record<string, unknown>,
  now = new Date(),
): Promise<TerritoryRanking> {
  const { level = "departement", sortBy = "farmCount", ...rest } = input;
  const filters = parseDashboardFilters(rest);
  const key = SORT_KEYS.includes(sortBy) ? sortBy : "farmCount";
  const scope = await analyticsScope(actor);
  requireNational(scope);
  const { current } = resolveCampaign(await readCampaigns(), filters.campaignCode);
  // Communes : celles du département demandé ; départements : tout le pays.
  const where = sqlFilters(
    level === "commune"
      ? { ...filters, communeCode: undefined }
      : { ...filters, departementCode: undefined, communeCode: undefined },
    scope,
  );
  const grouping = level === "commune" ? "commune" : "departement";
  const [farmRows, cropRows, farmers, totalFarmers, synthetic, refreshedAt] = await Promise.all([
    readFarmStats(where),
    readCropStats([current.id], where),
    countFarmers(grouping, { ...where, campaignId: current.id }),
    countFarmers("total", { ...where, campaignId: current.id }),
    registryIsSynthetic(),
    aggregatesRefreshedAt(),
  ]);
  const useFarms = !filters.cropCode;
  const groupKey = (r: { commune_code: string; departement_code: string }) =>
    level === "commune" ? r.commune_code : r.departement_code;
  const farmsBy = groupRows(farmRows, groupKey);
  const cropsBy = groupRows(cropRows, groupKey);

  const raw: RawRow[] = [...farmsBy.entries()].map(([code, group]) => {
    const first = group[0]!;
    return rowFrom(
      {
        code,
        name: level === "commune" ? first.commune_name : first.departement_name,
        departementCode: first.departement_code,
        zoneCode: level === "commune" ? first.zone_code : null,
      },
      useFarms ? group : null,
      cropsBy.get(code) ?? [],
      farmers.get(code) ?? 0,
    );
  });

  const masked = maskSmallCells(raw, {
    count: (r) => r.farmCount ?? 0,
    fields: MASKED_FIELDS,
    groupTotal: true,
  });
  const ranked = masked
    .filter((r) => !r.masked && (r.farmCount ?? 0) > 0 && r[key] !== null)
    .sort((a, b) => (b[key] as number) - (a[key] as number));
  const rankOf = new Map(ranked.map((r, index) => [r.code, index + 1]));
  const rows: TerritoryRankingRow[] = masked
    .map((r) => ({ ...r, rank: rankOf.get(r.code) ?? null }))
    .sort(
      (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name, "fr"),
    );

  const first = farmRows[0];
  const totalIdentity =
    level === "commune" && first
      ? {
          code: first.departement_code,
          name: first.departement_name,
          departementCode: first.departement_code,
          zoneCode: null,
        }
      : { code: "BJ", name: "Bénin", departementCode: "BJ", zoneCode: null };
  const totalRaw = rowFrom(
    totalIdentity,
    useFarms ? farmRows : null,
    cropRows,
    totalFarmers.get("total") ?? 0,
  );
  const total = {
    ...maskSingle(totalRaw, { count: (r) => r.farmCount ?? 0, fields: MASKED_FIELDS }),
    rank: null,
  };

  return {
    level,
    filters: { ...filters, campaignCode: current.code },
    campaign: toCampaignRef(current),
    sortBy: key,
    rows,
    total,
    provenance: provenanceOf({
      verifiedShare: total.verifiedShare,
      farmCount: total.farmCount,
      refreshedAt,
      synthetic,
      now,
    }),
  };
}
