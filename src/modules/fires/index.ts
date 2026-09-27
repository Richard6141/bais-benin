export { BENIN_FIRE_BBOX, runFireIngestion, type FireIngestionSummary } from "./ingest";
export {
  SAME_FIRE_DISTANCE_M,
  SAME_PASS_MS,
  mergeDetections,
  normalizeConfidence,
  type FireConfidenceCode,
  type FireRecord,
} from "./merge";
export {
  fireFreshness,
  firesToGeoJson,
  listFires,
  type FireFeature,
  type FireFreshness,
  type FireWindow,
} from "./queries";
export { queueFirePrevention, type FirePreventionResult } from "./prevention";
export {
  FIRE_PREVENTION_TEXT,
  FIRE_SEASON_MONTHS,
  isFireSeason,
  mostAffectedCommunes,
  preventionSubjectId,
  weekKey,
} from "./prevention-rules";
