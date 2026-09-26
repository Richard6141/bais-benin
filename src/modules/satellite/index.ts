export { getImageryCatalog, type ImageryCatalog } from "./catalog";
export { getDetailTile, getOverviewImage, type ImageryOutcome } from "./imagery";
export {
  BENIN_IMAGERY_BBOX,
  CROP_MAP_PERIOD,
  defaultPeriod,
  isOfferedFor,
  isOfferedPeriod,
  isPeriod,
  periodLabel,
  periodRange,
  recentPeriods,
  summarizePeriod,
  type ImageryPeriod,
} from "./periods";
export {
  DETAIL_MAX_ZOOM,
  DETAIL_MIN_ZOOM,
  DETAIL_TILE_SIZE,
  isDetailTileInBenin,
  overviewSize,
} from "./tiles";
export {
  evaluateVegetation,
  expectedProfile,
  seasonWindow,
  type VegetationCheckReason,
  type VegetationCheckStatus,
} from "./crop-profiles";
export {
  getFarmVegetationChecks,
  getVegetationSummary,
  listFlaggedFarms,
  runVegetationChecks,
  type ParcelVegetationCheck,
  type VegetationRunResult,
  type VegetationSummary,
} from "./vegetation";
export {
  PROPOSALS_PER_DAY,
  proposeFieldContours,
  type FieldProposalOutcome,
  type ProposedContour,
} from "./field-proposals";
export { segmentField, type CandidateLevel, type FeatureGrid } from "./field-segmentation";
export {
  measureRadarCost,
  type RadarCalibrationEntry,
  type RadarCalibrationResult,
} from "./radar-calibration";
export { evaluateRadar, expectedRadarProfile } from "./crop-profiles";
export {
  CROP_AREA_RESOLUTION_M,
  CULTIVATED_CLASSES,
  cropMapClassOf,
  getCropAreaComparison,
  runCropAreaEstimates,
  writeDemoCropAreaEstimates,
  type CropAreaComparison,
  type CropAreaFigures,
  type CropAreaRunResult,
  type CultivatedClass,
} from "./crop-areas";
