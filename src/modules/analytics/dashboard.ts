import { readRefreshTimes } from "@/database/sql/analytics-refresh.sql";
import {
  countFarmers,
  readCampaigns,
  readCropStats,
  readFarmStats,
  registryIsSynthetic,
  type DashboardSqlFilters,
} from "@/database/sql/dashboard.sql";
import type { Actor } from "@/modules/authorization";
import {
  buildCropRows,
  buildFigures,
  changePct,
  groupRows,
  provenanceOf,
  resolveCampaign,
  sumCropRows,
  sumFarmRows,
  toCampaignRef,
  tonnes,
} from "./aggregate";
import {
  AnalyticsError,
  dashboardFiltersSchema,
  type CampaignComparison,
  type CampaignPoint,
  type CropProduction,
  type DashboardFilters,
  type DashboardOverview,
  type PreviousCampaignFigures,
} from "./dashboard-types";
import { isSmallCell } from "./k-anonymity";
import { analyticsScope, assertFiltersAllowed, type AnalyticsScope } from "./scope";

// Services du tableau de bord national (pilotage-parcours-ux §2.A) : tuiles, production par
// culture, comparaison entre campagnes. Lecture des vues matérialisées, périmètre de l'acteur,
// masquage k = 5, provenance datée par le dernier rafraîchissement des agrégats.

export function parseDashboardFilters(input: unknown): DashboardFilters {
  const parsed = dashboardFiltersSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new AnalyticsError("INVALID", parsed.error.issues.map((i) => i.message).join(" ; "));
  }
  return parsed.data;
}

export function sqlFilters(filters: DashboardFilters, scope: AnalyticsScope): DashboardSqlFilters {
  assertFiltersAllowed(filters, scope);
  return {
    cropCode: filters.cropCode,
    departementCode: filters.departementCode,
    communeCode: filters.communeCode,
    verificationStatus: filters.verificationStatus,
    communeIds: scope.communeIds,
  };
}

/** Date des agrégats : le plus ancien des derniers rafraîchissements des deux vues. */
export async function aggregatesRefreshedAt(): Promise<Date | null> {
  const times = [...(await readRefreshTimes()).values()];
  if (times.length < 2) return null;
  return times.reduce((a, b) => (a < b ? a : b));
}

export async function getDashboardOverview(
  actor: Actor,
  input: unknown = {},
  now = new Date(),
): Promise<DashboardOverview> {
  const filters = parseDashboardFilters(input);
  const scope = await analyticsScope(actor);
  const { current, previous } = resolveCampaign(await readCampaigns(), filters.campaignCode);
  const where = sqlFilters(filters, scope);
  const [cropRows, farmRows, farmers, synthetic, refreshedAt] = await Promise.all([
    readCropStats(previous ? [current.id, previous.id] : [current.id], where),
    filters.cropCode ? Promise.resolve(null) : readFarmStats(where),
    countFarmers("total", { ...where, campaignId: current.id }),
    registryIsSynthetic(),
    aggregatesRefreshedAt(),
  ]);
  const figures = buildFigures({
    farm: farmRows ? sumFarmRows(farmRows) : null,
    crop: sumCropRows(cropRows.filter((r) => r.campaign_id === current.id)),
    farmerCount: farmers.get("total") ?? 0,
  });

  let previousFigures: PreviousCampaignFigures | null = null;
  if (previous) {
    const t = sumCropRows(cropRows.filter((r) => r.campaign_id === previous.id));
    const masked = filters.cropCode ? isSmallCell(t.farmCount) : figures.masked;
    previousFigures = {
      campaign: toCampaignRef(previous),
      masked,
      farmCount: masked || !filters.cropCode ? null : t.farmCount,
      cropAreaHa: masked ? null : t.areaHa,
      productionT: masked ? null : tonnes(t.productionKg, t.declaredHarvestCount),
    };
  }

  return {
    filters: { ...filters, campaignCode: current.code },
    campaign: toCampaignRef(current),
    figures,
    previous: previousFigures,
    provenance: provenanceOf({
      verifiedShare: figures.verifiedShare,
      farmCount: figures.farmCount,
      refreshedAt,
      synthetic,
      now,
    }),
  };
}

export async function getCropProduction(
  actor: Actor,
  input: unknown = {},
  now = new Date(),
): Promise<CropProduction> {
  const filters = parseDashboardFilters(input);
  const scope = await analyticsScope(actor);
  const { current } = resolveCampaign(await readCampaigns(), filters.campaignCode);
  const [rows, synthetic, refreshedAt] = await Promise.all([
    readCropStats([current.id], sqlFilters(filters, scope)),
    registryIsSynthetic(),
    aggregatesRefreshedAt(),
  ]);
  const totals = sumCropRows(rows);
  return {
    filters: { ...filters, campaignCode: current.code },
    campaign: toCampaignRef(current),
    rows: buildCropRows(rows),
    // D : le total est masqué comme une case quand il résume moins de k exploitations.
    total: isSmallCell(totals.farmCount)
      ? { areaHa: null, productionT: null }
      : {
          areaHa: totals.areaHa,
          productionT: tonnes(totals.productionKg, totals.declaredHarvestCount),
        },
    provenance: provenanceOf({
      verifiedShare: null,
      farmCount: null,
      refreshedAt,
      synthetic,
      now,
    }),
  };
}

const COMPARED_CROPS = 5;
const COMPARED_CAMPAIGNS = 3;

export async function getCampaignComparison(
  actor: Actor,
  input: unknown = {},
  now = new Date(),
): Promise<CampaignComparison> {
  // La comparaison porte sur les dernières campagnes : le filtre de campagne ne s'applique pas.
  const parsed = parseDashboardFilters(input);
  const filters: Omit<DashboardFilters, "campaignCode"> = {
    cropCode: parsed.cropCode,
    departementCode: parsed.departementCode,
    communeCode: parsed.communeCode,
    verificationStatus: parsed.verificationStatus,
  };
  const scope = await analyticsScope(actor);
  const campaigns = (await readCampaigns())
    .filter((c) => c.status !== "PLANNED")
    .slice(-COMPARED_CAMPAIGNS);
  const [rows, synthetic, refreshedAt] = await Promise.all([
    readCropStats(
      campaigns.map((c) => c.id),
      sqlFilters(filters, scope),
    ),
    registryIsSynthetic(),
    aggregatesRefreshedAt(),
  ]);
  const withData = campaigns.filter((c) => rows.some((r) => r.campaign_id === c.id));
  const latest = withData.at(-1);
  const byCrop = groupRows(rows, (r) => r.crop_code);
  const areaInLatest = (code: string) =>
    sumCropRows((byCrop.get(code) ?? []).filter((r) => r.campaign_id === latest?.id)).areaHa;
  const cropCodes = [...byCrop.keys()]
    .sort((a, b) => areaInLatest(b) - areaInLatest(a))
    .slice(0, COMPARED_CROPS);

  const crops = cropCodes.map((code) => {
    const group = byCrop.get(code)!;
    const points: CampaignPoint[] = [];
    for (const campaign of withData) {
      const t = sumCropRows(group.filter((r) => r.campaign_id === campaign.id));
      const masked = isSmallCell(t.farmCount);
      const previous = points.at(-1);
      const areaHa = masked ? null : t.areaHa;
      const productionT = masked ? null : tonnes(t.productionKg, t.declaredHarvestCount);
      points.push({
        campaignCode: campaign.code,
        masked,
        farmCount: masked ? null : t.farmCount,
        areaHa,
        productionT,
        areaChangePct: changePct(areaHa, previous?.areaHa ?? null),
        productionChangePct: changePct(productionT, previous?.productionT ?? null),
      });
    }
    return {
      cropCode: code,
      cropName: group[0]!.crop_name,
      colorHex: group[0]!.color_hex,
      points,
    };
  });

  return {
    filters,
    campaigns: withData.map(toCampaignRef),
    crops,
    provenance: provenanceOf({
      verifiedShare: null,
      farmCount: null,
      refreshedAt,
      synthetic,
      now,
    }),
  };
}
