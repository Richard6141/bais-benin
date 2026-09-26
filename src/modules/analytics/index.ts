export {
  VERIFIED_SHARE_THRESHOLD,
  getCommuneStats,
  getDepartementStats,
  getNationalStats,
  mapCommuneRow,
  mapDepartementRow,
  mapNationalRow,
  reliabilityFromShare,
  statsFiltersSchema,
  weightedVerifiedShare,
  type CommuneStats,
  type DepartementStats,
  type NationalStats,
  type StatsFilters,
  type StatsProvenance,
  type StatsReliability,
  type StatsResponse,
} from "./territory-stats";
export {
  VERIFICATION_STATUSES,
  type VerificationStatusCode,
} from "@/database/sql/territory-stats.sql";
export * from "./dashboard-types";
export type * from "./quality-types";
export { getCampaignComparison, getCropProduction, getDashboardOverview } from "./dashboard";
export { getTerritoryRanking } from "./ranking";
export {
  DEFAULT_RANKING_CROP,
  DEFAULT_RANKING_LIMIT,
  MAX_RANKING_LIMIT,
  MIN_AREA_FOR_YIELD_HA,
  exportProducerRankingCsv,
  getProducerRanking,
  parseProducerRankingFilters,
  rankingCampaign,
  type ProducerRanking,
  type ProducerRankingFilters,
  type ProducerRankingRow,
} from "./producer-ranking";
export { getCommuneProfile } from "./commune-profile";
export {
  DEFICIT_THRESHOLD_PCT,
  MIN_HARVESTS_FOR_LEVEL,
  getHarvestForecast,
  type Confidence,
  type ForecastRow,
  type HarvestForecast,
} from "./forecast";
export {
  AGGREGATES_STALE_MS,
  WEATHER_STALE_MS,
  getAnalyticsFreshness,
  getDataQuality,
} from "./quality";
export { exportAnalyticsCsv } from "./export";
export { K_ANONYMITY, isSmallCell, maskSmallCells, type MaskedRow } from "./k-anonymity";
export {
  REFRESH_MAX_AGE_MS,
  refreshAnalyticsIfStale,
  refreshAnalyticsQuietly,
  type AnalyticsRefreshResult,
  type RefreshReason,
} from "./refresh";
export { analyticsScope, canFilterByStatus, type AnalyticsScope } from "./scope";
export {
  CONDITION_CLASSES,
  buildCropCondition,
  getCropCondition,
  type ConditionBreakdown,
  type ConditionClass,
  type CropCondition,
  type CropConditionCrop,
  type CropConditionDepartement,
} from "./crop-condition";
