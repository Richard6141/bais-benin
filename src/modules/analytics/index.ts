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
