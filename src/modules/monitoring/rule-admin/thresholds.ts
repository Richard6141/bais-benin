import {
  NUMERIC_INDICATORS,
  clusterLabel,
  indicatorLabel,
  resolveOperator,
  type NumericIndicator,
  type Operator,
  type RuleNode,
} from "@/modules/monitoring/rules";

// Seuils éditables d'une règle (monitoring-parcours-ux §2.C5) : l'éditeur du ministère est
// généré depuis l'arbre de conditions. Chaque condition numérique devient un champ repéré par
// son chemin (« all.1 », « any.0.not »), borné par des limites physiques. Fonctions pures.

export interface IndicatorBound {
  min: number;
  max: number;
  unit: string | null;
  step: number;
}

/** Limites physiques plausibles au Bénin ; au-delà, le seuil est une erreur de saisie. */
export const INDICATOR_BOUNDS: Record<NumericIndicator, IndicatorBound> = {
  temp_max_avg_3d: { min: -10, max: 55, unit: "°C", step: 0.5 },
  temp_max_max_3d: { min: -10, max: 55, unit: "°C", step: 0.5 },
  temp_min_avg_3d: { min: -10, max: 55, unit: "°C", step: 0.5 },
  forecast_temp_max_max_3d: { min: -10, max: 55, unit: "°C", step: 0.5 },
  rain_sum_3d: { min: 0, max: 1000, unit: "mm", step: 1 },
  rain_sum_7d: { min: 0, max: 1500, unit: "mm", step: 1 },
  rain_sum_10d: { min: 0, max: 2000, unit: "mm", step: 1 },
  rain_sum_30d: { min: 0, max: 3000, unit: "mm", step: 1 },
  rain_max_1d: { min: 0, max: 500, unit: "mm", step: 1 },
  forecast_rain_sum_3d: { min: 0, max: 1000, unit: "mm", step: 1 },
  dry_days_consecutive: { min: 0, max: 366, unit: "jours", step: 1 },
  et0_sum_7d: { min: 0, max: 100, unit: "mm", step: 1 },
  water_balance_10d: { min: -500, max: 2000, unit: "mm", step: 1 },
  month: { min: 1, max: 12, unit: null, step: 1 },
  observed_days_missing_30d: { min: 0, max: 30, unit: "jours", step: 1 },
  // Au moins deux producteurs : un signalement isolé n'est jamais une alerte (ADR-0015).
  report_cluster: { min: 2, max: 100, unit: "producteurs", step: 1 },
  fire_near_parcels: { min: 1, max: 100, unit: "exploitations", step: 1 },
};

// Paramètres réglables d'un regroupement de signalements, bornés comme les seuils.
const CLUSTER_PARAM_BOUNDS = {
  radiusKm: { label: "Rayon du regroupement", min: 1, max: 50, unit: "km", step: 0.5 },
  days: { label: "Durée observée", min: 1, max: 60, unit: "jours", step: 1 },
} as const;
type ClusterParam = keyof typeof CLUSTER_PARAM_BOUNDS;

export interface ThresholdField {
  path: string;
  indicator: NumericIndicator;
  label: string;
  op: Operator;
  value: number;
  unit: string | null;
  min: number;
  max: number;
  step: number;
  /** Paramètre d'un regroupement de signalements (chemin « all.0#radiusKm »), pas un seuil. */
  param?: ClusterParam;
}

export interface BoundIssue {
  path: string;
  message: string;
}

function join(path: string, segment: string): string {
  return path ? `${path}.${segment}` : segment;
}

function isNumeric(indicator: string): indicator is NumericIndicator {
  return (NUMERIC_INDICATORS as readonly string[]).includes(indicator);
}

function walk(node: RuleNode, path: string, visit: (node: RuleNode, path: string) => void): void {
  if ("all" in node) node.all.forEach((child, i) => walk(child, join(path, `all.${i}`), visit));
  else if ("any" in node)
    node.any.forEach((child, i) => walk(child, join(path, `any.${i}`), visit));
  else if ("not" in node) walk(node.not, join(path, "not"), visit);
  else visit(node, path || "racine");
}

/** Champs numériques de la définition, dans l'ordre de l'arbre. */
export function listThresholds(definition: RuleNode): ThresholdField[] {
  const fields: ThresholdField[] = [];
  walk(definition, "", (node, path) => {
    if ("all" in node || "any" in node || "not" in node) return;
    if (!isNumeric(node.indicator) || typeof node.value !== "number") return;
    const bound = INDICATOR_BOUNDS[node.indicator];
    fields.push({
      path,
      indicator: node.indicator,
      label: node.params ? clusterLabel(node.params) : indicatorLabel(node.indicator),
      op: resolveOperator(node),
      value: node.value,
      ...bound,
    });
    if (!node.params) return;
    for (const param of Object.keys(CLUSTER_PARAM_BOUNDS) as ClusterParam[]) {
      const { label, ...paramBound } = CLUSTER_PARAM_BOUNDS[param];
      fields.push({
        path: `${path}#${param}`,
        indicator: node.indicator,
        label,
        op: "==",
        value: node.params[param],
        param,
        ...paramBound,
      });
    }
  });
  return fields;
}

/** Copie de la définition avec les seuils remplacés ; un chemin inconnu est une erreur. */
export function applyThresholds(
  definition: RuleNode,
  values: Readonly<Record<string, number>>,
): RuleNode {
  const known = new Set(listThresholds(definition).map((f) => f.path));
  for (const path of Object.keys(values)) {
    if (!known.has(path)) throw new RangeError(`Seuil inconnu : « ${path} »`);
  }
  const clone = structuredClone(definition);
  walk(clone, "", (node, path) => {
    if ("all" in node || "any" in node || "not" in node) return;
    const next = values[path];
    if (next !== undefined) (node as { value: unknown }).value = next;
    if (!node.params) return;
    for (const param of Object.keys(CLUSTER_PARAM_BOUNDS) as ClusterParam[]) {
      const nextParam = values[`${path}#${param}`];
      if (nextParam !== undefined) node.params = { ...node.params, [param]: nextParam };
    }
  });
  return clone;
}

/** Seuils hors limites physiques (pluie négative, température au-delà de 55 °C…). */
export function validateBounds(definition: RuleNode): BoundIssue[] {
  return listThresholds(definition).flatMap((field) => {
    if (!Number.isFinite(field.value))
      return [{ path: field.path, message: `${field.label} : valeur invalide` }];
    if (field.value < field.min || field.value > field.max) {
      const unit = field.unit ? ` ${field.unit}` : "";
      return [
        {
          path: field.path,
          message: `${field.label} : ${field.value}${unit} hors des limites (${field.min} à ${field.max}${unit})`,
        },
      ];
    }
    return [];
  });
}

export interface RuleSnapshot {
  name: string;
  description: string;
  severity: string;
  cooldownHours: number;
  messageFr: string;
  messageShort: string;
  adviceFr: string;
  definition: RuleNode;
}

export interface RuleChange {
  field: string;
  label: string;
  before: string | number;
  after: string | number;
}

const FIELD_LABELS: Record<Exclude<keyof RuleSnapshot, "definition">, string> = {
  name: "Nom",
  description: "Description",
  severity: "Sévérité",
  cooldownHours: "Délai de refroidissement (heures)",
  messageFr: "Message",
  messageShort: "Message court",
  adviceFr: "Conseil",
};

/** Différences lisibles entre deux versions : champs de texte et seuils, repérés par leur chemin. */
export function diffRules(before: RuleSnapshot, after: RuleSnapshot): RuleChange[] {
  const changes: RuleChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>) {
    if (before[field] !== after[field]) {
      changes.push({
        field,
        label: FIELD_LABELS[field],
        before: before[field],
        after: after[field],
      });
    }
  }
  const beforeThresholds = new Map(listThresholds(before.definition).map((f) => [f.path, f]));
  const afterThresholds = listThresholds(after.definition);
  for (const field of afterThresholds) {
    const previous = beforeThresholds.get(field.path);
    if (
      !previous ||
      previous.indicator !== field.indicator ||
      previous.value !== field.value ||
      previous.op !== field.op
    ) {
      changes.push({
        field: `definition.${field.path}`,
        label: field.label,
        before: previous ? `${previous.op} ${previous.value}` : "aucun",
        after: `${field.op} ${field.value}`,
      });
    }
  }
  if (
    JSON.stringify(before.definition) !== JSON.stringify(after.definition) &&
    afterThresholds.length !== beforeThresholds.size
  ) {
    changes.push({
      field: "definition",
      label: "Structure des conditions",
      before: "précédente",
      after: "modifiée",
    });
  }
  return changes;
}

const OPERATOR_WORDS: Record<Operator, string> = {
  ">": "supérieur à",
  ">=": "au moins",
  "<": "inférieur à",
  "<=": "au plus",
  "==": "égal à",
  in: "parmi",
};

const STAGE_WORDS: Record<string, string> = {
  PLANNED: "prévue",
  SOWN: "semée",
  GROWING: "en croissance",
  FLOWERING: "en floraison",
  HARVESTED: "récoltée",
  FAILED: "perdue",
};

const CROP_WORDS: Record<string, string> = {
  MAIZE: "maïs",
  RICE: "riz",
  SORGHUM: "sorgho",
  MILLET: "mil",
  CASSAVA: "manioc",
  YAM: "igname",
  COWPEA: "niébé",
  GROUNDNUT: "arachide",
  SOYBEAN: "soja",
  COTTON: "coton",
  CASHEW: "anacarde",
};

const numberWords = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Une phrase française par condition, avec « au moins une des » et « pas » selon l'arbre. */
export function explainDefinition(definition: RuleNode): string[] {
  const lines: string[] = [];
  function visit(node: RuleNode, prefix: string): void {
    if ("all" in node) return node.all.forEach((child) => visit(child, prefix));
    if ("any" in node) return node.any.forEach((child) => visit(child, `${prefix}(au moins une) `));
    if ("not" in node) return visit(node.not, `${prefix}pas : `);
    const op = resolveOperator(node);
    const values = Array.isArray(node.value) ? node.value : [node.value];
    const words = values.map((value) => {
      if (typeof value === "number") return numberWords.format(value);
      if (node.indicator === "crop_stage_in") return STAGE_WORDS[value] ?? value;
      if (node.indicator === "crop_in") return CROP_WORDS[value] ?? value;
      return value;
    });
    const unit = isNumeric(node.indicator) ? INDICATOR_BOUNDS[node.indicator].unit : null;
    const label = node.params ? clusterLabel(node.params) : indicatorLabel(node.indicator);
    const text = `${label} ${OPERATOR_WORDS[op]} ${words.join(", ")}${unit ? ` ${unit}` : ""}`;
    lines.push(`${prefix}${text}`);
  }
  visit(definition, "");
  return lines;
}
