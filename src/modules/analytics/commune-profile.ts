import {
  countFarmers,
  readCampaigns,
  readCommuneInfo,
  readCropStats,
  readFarmStats,
  registryIsSynthetic,
} from "@/database/sql/dashboard.sql";
import { readAgentActivity } from "@/database/sql/quality.sql";
import type { Actor } from "@/modules/authorization";
import {
  buildCropRows,
  buildFigures,
  groupRows,
  provenanceOf,
  ratio,
  resolveCampaign,
  sumCropRows,
  sumFarmRows,
  toCampaignRef,
} from "./aggregate";
import { aggregatesRefreshedAt, parseDashboardFilters, sqlFilters } from "./dashboard";
import { AnalyticsError, type CommuneProfile, type FieldCoverage } from "./dashboard-types";
import { analyticsScope } from "./scope";

// Fiche commune (pilotage-parcours-ux §2.C, blocs C1 à C3). La météo et les alertes (C4) sont
// lues par la page dans le module monitoring. Hors périmètre de l'acteur : NOT_FOUND, comme une
// commune inconnue, pour ne rien révéler. Les comparaisons aux moyennes et les noms d'agents
// sont réservés au ministère.

const COVERAGE_DAYS = 90;

export async function getCommuneProfile(
  actor: Actor,
  communeCode: string,
  input: unknown = {},
  now = new Date(),
): Promise<CommuneProfile> {
  const filters = parseDashboardFilters({ ...(input as object), communeCode });
  const scope = await analyticsScope(actor);
  const info = await readCommuneInfo(communeCode);
  if (!info || (scope.communeIds && !scope.communeIds.includes(info.id))) {
    throw new AnalyticsError("NOT_FOUND", `Commune introuvable : ${communeCode}`);
  }
  const { current } = resolveCampaign(await readCampaigns(), filters.campaignCode);
  const where = sqlFilters(filters, scope);
  // Moyennes : toutes les communes du pays, même filtres de culture et de statut.
  const national = sqlFilters(
    { ...filters, communeCode: undefined, departementCode: undefined },
    scope,
  );
  const since = new Date(now.getTime() - COVERAGE_DAYS * 86_400_000);
  const [cropRows, farmRows, allFarmRows, allCropRows, farmers, agents, synthetic, refreshedAt] =
    await Promise.all([
      readCropStats([current.id], where),
      filters.cropCode ? Promise.resolve(null) : readFarmStats(where),
      scope.national ? readFarmStats(national) : Promise.resolve([]),
      scope.national && filters.cropCode
        ? readCropStats([current.id], national)
        : Promise.resolve([]),
      countFarmers("total", { ...where, campaignId: current.id }),
      readAgentActivity({ communeCode, communeIds: scope.communeIds }, since),
      registryIsSynthetic(),
      aggregatesRefreshedAt(),
    ]);

  const figures = buildFigures({
    farm: farmRows ? sumFarmRows(farmRows) : null,
    crop: sumCropRows(cropRows),
    farmerCount: farmers.get("total") ?? 0,
  });

  let comparison: CommuneProfile["comparison"] = null;
  if (scope.national) {
    const countsBy = (level: "commune_code" | "departement_code") => {
      const counts = filters.cropCode
        ? [...groupRows(allCropRows, (r) => r[level]).entries()].map(
            ([code, g]) => [code, sumCropRows(g).farmCount] as const,
          )
        : [...groupRows(allFarmRows, (r) => r[level]).entries()].map(
            ([code, g]) => [code, sumFarmRows(g).farmCount] as const,
          );
      return new Map(counts);
    };
    const byCommune = countsBy("commune_code");
    // Moyennes sur toutes les communes, y compris celles sans exploitation.
    const departementCommunes = new Set(
      allFarmRows
        .filter((r) => r.departement_code === info.departement_code)
        .map((r) => r.commune_code),
    );
    const sum = (codes: Iterable<string>) =>
      [...codes].reduce((total, code) => total + (byCommune.get(code) ?? 0), 0);
    const communeCount = allFarmRows.length;
    const departementAverage = sum(departementCommunes) / Math.max(1, departementCommunes.size);
    const nationalAverage = sum(byCommune.keys()) / Math.max(1, communeCount);
    const own = figures.masked ? null : figures.farmCount;
    comparison = {
      departementAverageFarmCount: Math.round(departementAverage * 10) / 10,
      nationalAverageFarmCount: Math.round(nationalAverage * 10) / 10,
      farmCountVsDepartement: own === null ? null : ratio(own, departementAverage),
      farmCountVsNational: own === null ? null : ratio(own, nationalAverage),
    };
  }

  const fieldCoverage: FieldCoverage = {
    agentCount: agents.length,
    visits90d: agents.reduce((total, a) => total + a.visits, 0),
    agents: agents.map((a, index) => ({
      label: scope.national && a.name ? a.name : `Agent ${index + 1}`,
      visits90d: a.visits,
      lastSyncAt: a.last_sync_at,
    })),
  };

  return {
    commune: {
      code: info.code,
      name: info.name,
      departementCode: info.departement_code,
      departementName: info.departement_name,
      zoneCode: info.zone_code,
      zoneName: info.zone_name,
      ruralPopulation: info.rural_population,
      areaKm2: info.area_km2,
    },
    filters: { ...filters, campaignCode: current.code },
    campaign: toCampaignRef(current),
    figures,
    comparison,
    registeredFarmerShare:
      figures.farmerCount !== null && info.rural_population
        ? ratio(figures.farmerCount, info.rural_population)
        : null,
    crops: buildCropRows(cropRows),
    fieldCoverage,
    provenance: provenanceOf({
      verifiedShare: figures.verifiedShare,
      farmCount: figures.farmCount,
      refreshedAt,
      synthetic,
      now,
    }),
  };
}
