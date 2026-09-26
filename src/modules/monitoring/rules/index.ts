export {
  CATEGORIES,
  INDICATOR_CODES,
  NUMERIC_INDICATORS,
  OPERATORS,
  PARAMETERIZED_INDICATORS,
  REPORT_CLUSTER_TYPES,
  SEVERITIES,
  conditionSchema,
  parseRuleDefinition,
  resolveOperator,
  ruleNodeSchema,
  ruleSchema,
  type IndicatorCode,
  type IndicatorValue,
  type IndicatorValues,
  type NumericIndicator,
  type Operator,
  type ReportClusterParams,
  type Rule,
  type RuleCategory,
  type RuleCondition,
  type RuleNode,
  type RuleSpec,
  type Severity,
} from "./definition";
export {
  DRY_DAY_THRESHOLD_MM,
  computeIndicators,
  type CropPresence,
  type IndicatorInput,
  type WeatherDay,
} from "./indicators";
export {
  clusterKey,
  clusterLabel,
  clusterParamsOf,
  usesFires,
  usesReports,
  usesWeather,
} from "./clusters";
export {
  evaluateRule,
  explainTrace,
  formatIndicatorValue,
  indicatorLabel,
  type ConditionResolver,
  type Evaluation,
  type TraceEntry,
} from "./evaluate";
export { SHORT_MESSAGE_MAX, renderMessage, type MessageContext } from "./render";
export { DEFAULT_RULES, findDefaultRule } from "./default-rules";
