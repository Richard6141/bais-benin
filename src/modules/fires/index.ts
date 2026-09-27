export {
  BENIN_FIRE_BBOX,
  FIRE_RETENTION_MS,
  runFireIngestion,
  type FireIngestionSummary,
} from "./ingest";
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
export {
  getFirePreventionStatus,
  preventionReference,
  queueFirePrevention,
  type FirePreventionResult,
  type FirePreventionStatus,
  type PreventionReference,
} from "./prevention";
export {
  FIRE_PREVENTION_TEXT,
  FIRE_SEASON_MONTHS,
  isFireSeason,
  mostAffectedCommunes,
  preventionSubjectId,
  rankAffectedCommunes,
  seasonLabel,
  weekKey,
} from "./prevention-rules";
export { importFireArchive, type FireArchiveResult } from "./archive";
export {
  ARCHIVE_SOURCES,
  apiChunks,
  archiveSeasonWindow,
  lastCompleteSeason,
  parseAvailability,
  pickApiSource,
} from "./archive-sources";
export {
  burnProvider,
  measureBurnAssessments,
  queueBurnAssessmentsForActiveFireAlerts,
  queueBurnAssessmentsForAlert,
  queueBurnAssessmentsForFarm,
  type BurnRunResult,
} from "./burned-area";
export {
  EXPOSURE_M,
  MIN_PARCEL_HA,
  burnFigures,
  burnWindows,
  type BurnFigures,
} from "./burned-area-rules";
export {
  DamageError,
  countProposedDamages,
  exportDamageCsv,
  getDamageDeclaration,
  listDamageDeclarations,
  requestBurnAssessment,
  type DamageFilters,
  type DamageRow,
} from "./damage";
