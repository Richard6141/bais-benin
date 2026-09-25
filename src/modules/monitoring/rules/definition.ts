import { z } from "zod";

// Langage de règles du moteur d'alertes (docs/04 §7, Rule.definition). Une définition est un
// arbre JSON : `all` (toutes vraies), `any` (au moins une), `not` (négation) ou une condition
// feuille `{ indicator, op, value }`. La définition est stockée en jsonb et validée ici, à
// l'écriture comme à la lecture : une règle mal formée n'atteint jamais l'évaluateur.

export const NUMERIC_INDICATORS = [
  "temp_max_avg_3d",
  "temp_max_max_3d",
  "temp_min_avg_3d",
  "rain_sum_3d",
  "rain_sum_7d",
  "rain_sum_10d",
  "rain_sum_30d",
  "rain_max_1d",
  "dry_days_consecutive",
  "et0_sum_7d",
  "water_balance_10d",
  "forecast_rain_sum_3d",
  "forecast_temp_max_max_3d",
  "month",
  "observed_days_missing_30d",
] as const;

export const TEXT_INDICATORS = ["zae_in"] as const;
export const LIST_INDICATORS = ["crop_in", "crop_stage_in"] as const;

export const INDICATOR_CODES = [
  ...NUMERIC_INDICATORS,
  ...TEXT_INDICATORS,
  ...LIST_INDICATORS,
] as const;

export type NumericIndicator = (typeof NUMERIC_INDICATORS)[number];
export type IndicatorCode = (typeof INDICATOR_CODES)[number];
export type IndicatorValue = number | string | string[] | null;
export type IndicatorValues = Record<IndicatorCode, IndicatorValue>;

export const OPERATORS = [">", ">=", "<", "<=", "==", "in"] as const;
export type Operator = (typeof OPERATORS)[number];

const scalar = z.union([z.number(), z.string()]);

export const conditionSchema = z
  .object({
    indicator: z.enum(INDICATOR_CODES),
    // Facultatif : `in` par défaut quand la valeur est une liste, `==` sinon.
    op: z.enum(OPERATORS).optional(),
    value: z.union([scalar, z.array(scalar).min(1)]),
  })
  .strict()
  .superRefine((condition, ctx) => {
    const op = resolveOperator(condition);
    const isList = Array.isArray(condition.value);
    if (op === "in" && !isList) {
      ctx.addIssue({ code: "custom", message: "L'opérateur « in » attend une liste de valeurs" });
    }
    if (op !== "in" && isList) {
      ctx.addIssue({ code: "custom", message: `L'opérateur « ${op} » attend une valeur unique` });
    }
    const ordered = op === ">" || op === ">=" || op === "<" || op === "<=";
    if (ordered && typeof condition.value !== "number") {
      ctx.addIssue({ code: "custom", message: `L'opérateur « ${op} » attend un nombre` });
    }
    if (ordered && !(NUMERIC_INDICATORS as readonly string[]).includes(condition.indicator)) {
      ctx.addIssue({
        code: "custom",
        message: `L'indicateur « ${condition.indicator} » n'est pas numérique`,
      });
    }
  });

export type RuleCondition = z.infer<typeof conditionSchema>;

export type RuleNode =
  { all: RuleNode[] } | { any: RuleNode[] } | { not: RuleNode } | RuleCondition;

export const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ruleNodeSchema).min(1) }).strict(),
    z.object({ any: z.array(ruleNodeSchema).min(1) }).strict(),
    z.object({ not: ruleNodeSchema }).strict(),
    conditionSchema,
  ]),
);

export function resolveOperator(condition: Pick<RuleCondition, "op" | "value">): Operator {
  return condition.op ?? (Array.isArray(condition.value) ? "in" : "==");
}

export function parseRuleDefinition(input: unknown): RuleNode {
  return ruleNodeSchema.parse(input);
}

export const SEVERITIES = ["INFO", "WATCH", "WARNING", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["WATER_STRESS", "FLOOD", "HEAT", "PEST", "MARKET", "ADMIN"] as const;
export type RuleCategory = (typeof CATEGORIES)[number];

export const ruleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*_V\d+$/, "Code versionné attendu (…_V1)"),
  version: z.number().int().min(1),
  name: z.string().min(3),
  description: z.string().min(10),
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  target: z.enum(["COMMUNE", "FARM"]).default("COMMUNE"),
  cooldownHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  definition: ruleNodeSchema,
  messageFr: z.string().min(10),
  messageShort: z.string().min(10),
  adviceFr: z.string().min(10),
});

export type RuleSpec = z.input<typeof ruleSchema>;
export type Rule = z.output<typeof ruleSchema>;
