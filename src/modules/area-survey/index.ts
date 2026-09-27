// Enquête aréolaire (ADR-0033, ADR-0037) : points tirés sur le territoire en deux phases,
// constats des agents, surfaces par culture estimées par strate de la carte des pixels (ou par
// régression sur la carte pour un tirage à égale probabilité).

export {
  MAX_POINT_DISTANCE_M,
  POINTS_PER_COMMUNE,
  classifyFramePoints,
  drawAreaFrame,
  gridOrigin,
  gridSpacing,
  pointCode,
  pointMapClass,
  pointSquare,
  selectSecondPhase,
  type FrameDrawResult,
  type PointClassRunResult,
  type SecondPhaseResult,
} from "./frame";
export {
  ANNUAL_STRATUM_CLASSES,
  FIRST_PHASE_FACTOR,
  FRAME_STRATA,
  MIN_POINTS_PER_STRATUM,
  stratumOf,
  type FrameStratum,
} from "./strata";
export {
  CV_CITE,
  CV_INDICATIVE,
  MAX_NON_RESPONSE,
  MIN_POINTS_TO_CITE,
  MIN_POSITIVES_TO_CITE,
  STAPLE_GROUPS,
  SURVEY_TARGETS,
  citationStatus,
  estimateSurvey,
  getSurveyEstimates,
  type CitationStatus,
  type CommuneSurvey,
  type SurveyEstimates,
  type SurveyTarget,
  type TargetEstimate,
} from "./estimates";
export { listSurveyPoints, type SurveyPointView } from "./points";
