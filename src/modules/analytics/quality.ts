import {
  countProbableDuplicates,
  readAgentActivity,
  readAreaGaps,
  readCommunesWithoutAgent,
  readDeclaredAges,
  readMedianGap,
  readSourceFreshness,
  type QualitySqlFilters,
} from "@/database/sql/quality.sql";
import type { Actor } from "@/modules/authorization";
import { ratio } from "./aggregate";
import { aggregatesRefreshedAt, parseDashboardFilters } from "./dashboard";
import { isSmallCell } from "./k-anonymity";
import type {
  AgeBuckets,
  AnalyticsFreshness,
  CommuneAgeing,
  CommuneGap,
  DataQuality,
  GapBuckets,
} from "./quality-types";
import { analyticsScope } from "./scope";

// Qualité des données (pilotage-parcours-ux §2.D) : écarts déclaré / relevé, ancienneté des
// exploitations non vérifiées, couverture des agents, doublons probables, fraîcheur. Des
// comptes seulement ; les lignes communales de moins de 5 éléments sont masquées. Couverture
// des agents et doublons : ministère seulement.

export const AGGREGATES_STALE_MS = 30 * 60 * 1000;
export const WEATHER_STALE_MS = 48 * 60 * 60 * 1000;
const WORST_COMMUNES = 10;
const DAY_MS = 86_400_000;

export async function getAnalyticsFreshness(now = new Date()): Promise<AnalyticsFreshness> {
  const [sources, refreshedAt] = await Promise.all([
    readSourceFreshness(),
    aggregatesRefreshedAt(),
  ]);
  return {
    lastSyncAt: sources.last_sync_at,
    lastIngestionAt: sources.last_ingestion_at,
    aggregatesRefreshedAt: refreshedAt,
    aggregatesStale: !refreshedAt || now.getTime() - refreshedAt.getTime() > AGGREGATES_STALE_MS,
    weatherStale:
      !sources.last_ingestion_at ||
      now.getTime() - sources.last_ingestion_at.getTime() > WEATHER_STALE_MS,
  };
}

export async function getDataQuality(
  actor: Actor,
  input: unknown = {},
  now = new Date(),
): Promise<DataQuality> {
  const { departementCode, communeCode } = parseDashboardFilters(input);
  const scope = await analyticsScope(actor);
  const where: QualitySqlFilters = { departementCode, communeCode, communeIds: scope.communeIds };
  const [gapRows, medianGap, ageRows, freshness] = await Promise.all([
    readAreaGaps(where),
    readMedianGap(where),
    readDeclaredAges(where, now),
    getAnalyticsFreshness(now),
  ]);

  const buckets: GapBuckets = { under10: 0, from10to20: 0, from20to50: 0, over50: 0 };
  for (const r of gapRows) {
    buckets.under10 += r.under10;
    buckets.from10to20 += r.from10to20;
    buckets.from20to50 += r.from20to50;
    buckets.over50 += r.over50;
  }
  const measuredParcels = gapRows.reduce((total, r) => total + r.parcels, 0);
  const communeGaps: CommuneGap[] = gapRows.map((r) => {
    const masked = isSmallCell(r.parcels);
    return {
      code: r.code,
      name: r.name,
      departementCode: r.departement_code,
      masked,
      measuredParcels: masked ? null : r.parcels,
      medianGap: masked ? null : r.median_gap,
      flaggedShare: masked ? null : ratio(r.from20to50 + r.over50, r.parcels),
    };
  });

  const totals: AgeBuckets = { under30Days: 0, from30to180Days: 0, over180Days: 0 };
  for (const r of ageRows) {
    totals.under30Days += r.under30;
    totals.from30to180Days += r.from30to180;
    totals.over180Days += r.over180;
  }
  const communes: CommuneAgeing[] = ageRows
    .map((r) => {
      const masked = isSmallCell(r.declared_farms);
      return masked
        ? {
            code: r.code,
            name: r.name,
            departementCode: r.departement_code,
            masked,
            declaredFarms: null,
          }
        : {
            code: r.code,
            name: r.name,
            departementCode: r.departement_code,
            masked,
            declaredFarms: r.declared_farms,
            under30Days: r.under30,
            from30to180Days: r.from30to180,
            over180Days: r.over180,
          };
    })
    .sort(
      (a, b) => (b.over180Days ?? -1) - (a.over180Days ?? -1) || a.name.localeCompare(b.name, "fr"),
    );

  let coverage: DataQuality["coverage"] = null;
  let duplicates: DataQuality["duplicates"] = null;
  if (scope.national) {
    const [withoutAgent, agents, pairs] = await Promise.all([
      readCommunesWithoutAgent(where),
      readAgentActivity(where, new Date(now.getTime() - 30 * DAY_MS)),
      countProbableDuplicates(where),
    ]);
    const syncLimit = now.getTime() - 14 * DAY_MS;
    coverage = {
      communesWithoutAgent: withoutAgent.map((c) => ({
        code: c.code,
        name: c.name,
        departementCode: c.departement_code,
      })),
      activeAgents: agents.length,
      agentsWithoutSync14d: agents.filter(
        (a) => !a.last_sync_at || a.last_sync_at.getTime() < syncLimit,
      ).length,
      visits30d: {
        none: agents.filter((a) => a.visits === 0).length,
        from1to5: agents.filter((a) => a.visits >= 1 && a.visits <= 5).length,
        from6to20: agents.filter((a) => a.visits >= 6 && a.visits <= 20).length,
        over20: agents.filter((a) => a.visits > 20).length,
      },
    };
    duplicates = { probablePairs: pairs };
  }

  return {
    filters: { departementCode, communeCode },
    gaps: {
      measuredParcels,
      buckets,
      medianGap,
      flaggedShare: ratio(buckets.from20to50 + buckets.over50, measuredParcels),
      worstCommunes: communeGaps
        .filter((c) => !c.masked)
        .sort((a, b) => (b.medianGap ?? 0) - (a.medianGap ?? 0))
        .slice(0, WORST_COMMUNES),
    },
    ageing: { totals, communes },
    coverage,
    duplicates,
    freshness,
    generatedAt: now,
  };
}
