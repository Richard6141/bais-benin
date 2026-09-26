// Enquête aréolaire (ADR-0033) : points tirés sur le territoire, constats des agents, surfaces
// par culture estimées par régression sur la carte des pixels.

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
  type FrameDrawResult,
  type PointClassRunResult,
} from "./frame";
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
