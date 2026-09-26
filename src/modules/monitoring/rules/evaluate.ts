import { clusterLabel } from "./clusters";
import { labelForCode } from "./code-labels";
import {
  resolveOperator,
  type IndicatorCode,
  type IndicatorValue,
  type IndicatorValues,
  type Operator,
  type ReportClusterParams,
  type RuleCondition,
  type RuleNode,
} from "./definition";

// Évaluation d'une règle sur un jeu d'indicateurs. Toutes les conditions sont évaluées, sans
// court-circuit, pour que la trace soit complète : elle est conservée telle quelle dans
// RuleEvaluation.indicators_snapshot et sert à expliquer l'alerte en français. Un indicateur
// absent (null) rend sa condition fausse et figure dans `missing` ; jamais d'exception.

export interface TraceEntry {
  /** Position de la condition dans l'arbre, par exemple « all.2 » ou « any.0.not ». */
  path: string;
  indicator: IndicatorCode;
  op: Operator;
  expected: RuleCondition["value"];
  actual: IndicatorValue;
  result: boolean;
  missing: boolean;
  /** Paramètres d'un indicateur paramétré (regroupement de signalements, ADR-0015). */
  params?: ReportClusterParams;
}

/**
 * Valeur d'un indicateur paramétré pour sa condition ; indéfini quand elle n'est pas connue
 * (la condition est alors non évaluable, comme un indicateur manquant).
 */
export type ConditionResolver = (condition: RuleCondition) => IndicatorValue | undefined;

export interface Evaluation {
  matched: boolean;
  trace: TraceEntry[];
  missing: IndicatorCode[];
}

function asList(value: IndicatorValue | RuleCondition["value"]): Array<string | number> {
  if (value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function compare(actual: IndicatorValue, op: Operator, expected: RuleCondition["value"]): boolean {
  if (actual === null) return false;
  if (op === "in") {
    // Liste contre liste : au moins un élément commun (cultures, stades présents dans la commune).
    const wanted = new Set(asList(expected).map(String));
    return asList(actual).some((item) => wanted.has(String(item)));
  }
  if (op === "==") {
    if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
    return String(actual) === String(expected);
  }
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  switch (op) {
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
  }
}

function join(path: string, segment: string): string {
  return path ? `${path}.${segment}` : segment;
}

function evaluateNode(
  node: RuleNode,
  indicators: IndicatorValues,
  path: string,
  trace: TraceEntry[],
  resolve?: ConditionResolver,
): boolean {
  if ("all" in node) {
    const results = node.all.map((child, i) =>
      evaluateNode(child, indicators, join(path, `all.${i}`), trace, resolve),
    );
    return results.every(Boolean);
  }
  if ("any" in node) {
    const results = node.any.map((child, i) =>
      evaluateNode(child, indicators, join(path, `any.${i}`), trace, resolve),
    );
    return results.some(Boolean);
  }
  if ("not" in node) {
    return !evaluateNode(node.not, indicators, join(path, "not"), trace, resolve);
  }
  const op = resolveOperator(node);
  const actual = (node.params ? resolve?.(node) : indicators[node.indicator]) ?? null;
  const result = compare(actual, op, node.value);
  trace.push({
    path: path || "racine",
    indicator: node.indicator,
    op,
    expected: node.value,
    actual,
    result,
    missing: actual === null,
    ...(node.params ? { params: node.params } : {}),
  });
  return result;
}

export function evaluateRule(
  definition: RuleNode,
  indicators: IndicatorValues,
  resolve?: ConditionResolver,
): Evaluation {
  const trace: TraceEntry[] = [];
  const matched = evaluateNode(definition, indicators, "", trace, resolve);
  const missing = [...new Set(trace.filter((t) => t.missing).map((t) => t.indicator))];
  return { matched, trace, missing };
}

// --- Explication en français -------------------------------------------------------------

const INDICATOR_LABELS: Record<IndicatorCode, { label: string; unit?: string }> = {
  temp_max_avg_3d: { label: "Température maximale moyenne sur 3 jours", unit: "°C" },
  temp_max_max_3d: { label: "Température maximale la plus haute sur 3 jours", unit: "°C" },
  temp_min_avg_3d: { label: "Température minimale moyenne sur 3 jours", unit: "°C" },
  rain_sum_3d: { label: "Cumul de pluie sur 3 jours", unit: "mm" },
  rain_sum_7d: { label: "Cumul de pluie sur 7 jours", unit: "mm" },
  rain_sum_10d: { label: "Cumul de pluie sur 10 jours", unit: "mm" },
  rain_sum_30d: { label: "Cumul de pluie sur 30 jours", unit: "mm" },
  rain_max_1d: { label: "Plus forte pluie en un jour (3 derniers jours)", unit: "mm" },
  dry_days_consecutive: { label: "Jours secs consécutifs", unit: "jours" },
  et0_sum_7d: { label: "Évapotranspiration sur 7 jours", unit: "mm" },
  water_balance_10d: {
    label: "Bilan hydrique sur 10 jours (pluie moins évapotranspiration)",
    unit: "mm",
  },
  forecast_rain_sum_3d: { label: "Pluie prévue sur les 3 prochains jours", unit: "mm" },
  forecast_temp_max_max_3d: { label: "Température maximale prévue sur 3 jours", unit: "°C" },
  month: { label: "Mois" },
  observed_days_missing_30d: { label: "Jours d'observation manquants sur 30 jours", unit: "jours" },
  zae_in: { label: "Zone agro-écologique" },
  crop_in: { label: "Cultures présentes" },
  crop_stage_in: { label: "Stades des cultures" },
  report_cluster: { label: "Producteurs ayant signalé un même problème", unit: "producteurs" },
  fire_near_parcels: {
    label: "Exploitations à moins de 1 km d'un feu actif (24 heures)",
    unit: "exploitations",
  },
};

const OPERATOR_TEXT: Record<Operator, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  "==": "=",
  in: "parmi",
};

const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatIndicatorValue(
  value: IndicatorValue | RuleCondition["value"],
  unit?: string,
): string {
  if (value === null) return "donnée manquante";
  if (Array.isArray(value)) {
    return value.length === 0 ? "aucune" : value.map((v) => labelForCode(String(v))).join(", ");
  }
  const text = typeof value === "number" ? numberFormatter.format(value) : labelForCode(value);
  return unit ? `${text} ${unit}` : text;
}

export function indicatorLabel(code: IndicatorCode): string {
  return INDICATOR_LABELS[code].label;
}

/** Une phrase par condition : « Cumul de pluie sur 10 jours : 2 mm, seuil < 5 mm (remplie). » */
export function explainTrace(trace: readonly TraceEntry[]): string[] {
  return trace.map((entry) => {
    const { unit } = INDICATOR_LABELS[entry.indicator];
    const label = entry.params
      ? clusterLabel(entry.params)
      : INDICATOR_LABELS[entry.indicator].label;
    const actual = formatIndicatorValue(entry.actual, unit);
    const expected = formatIndicatorValue(entry.expected, unit);
    const status = entry.missing ? "non évaluable" : entry.result ? "remplie" : "non remplie";
    if (entry.op === "in" && Array.isArray(entry.expected)) {
      // Condition de liste : « Stades des cultures : en croissance, récoltée ; attendu : semée ou
      // en croissance (remplie). »
      const options = entry.expected.map((v) => labelForCode(String(v)));
      const wanted =
        options.length > 1
          ? `${options.slice(0, -1).join(", ")} ou ${options[options.length - 1]}`
          : (options[0] ?? "");
      return `${label} : ${actual} ; attendu : ${wanted} (${status}).`;
    }
    return `${label} : ${actual}, seuil ${OPERATOR_TEXT[entry.op]} ${expected} (${status}).`;
  });
}
