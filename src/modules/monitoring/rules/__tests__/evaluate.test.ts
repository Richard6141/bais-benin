import { describe, expect, it } from "vitest";

import {
  evaluateRule,
  explainTrace,
  parseRuleDefinition,
  type IndicatorValues,
  type RuleNode,
} from "..";

const base: IndicatorValues = {
  temp_max_avg_3d: 36.4,
  temp_max_max_3d: 38,
  temp_min_avg_3d: 22,
  rain_sum_3d: 0,
  rain_sum_7d: 1.5,
  rain_sum_10d: 2,
  rain_sum_30d: 40,
  rain_max_1d: 0,
  dry_days_consecutive: 11,
  et0_sum_7d: 35,
  water_balance_10d: -48,
  forecast_rain_sum_3d: null,
  forecast_temp_max_max_3d: null,
  month: 6,
  observed_days_missing_30d: 0,
  zae_in: "ZAE_5",
  crop_in: ["MAIZE", "YAM"],
  crop_stage_in: ["GROWING", "SOWN"],
  report_cluster: null,
  fire_near_parcels: null,
};

const cond = (indicator: string, op: string | undefined, value: unknown) =>
  parseRuleDefinition(op ? { indicator, op, value } : { indicator, value });

describe("opérateurs", () => {
  it.each([
    ["rain_sum_10d", "<", 5, true],
    ["rain_sum_10d", "<", 2, false],
    ["rain_sum_10d", "<=", 2, true],
    ["temp_max_max_3d", ">", 38, false],
    ["temp_max_max_3d", ">=", 38, true],
    ["month", "==", 6, true],
    ["zae_in", "==", "ZAE_5", true],
    ["zae_in", "in", ["ZAE_1", "ZAE_2"], false],
    ["zae_in", "in", ["ZAE_5", "ZAE_6"], true],
    ["crop_in", "in", ["MAIZE"], true],
    ["crop_in", "in", ["COTTON", "RICE"], false],
    ["crop_in", "==", "YAM", true],
    ["month", "in", [5, 6, 7], true],
  ] as const)("%s %s %j → %s", (indicator, op, value, expected) => {
    expect(evaluateRule(cond(indicator, op, value), base).matched).toBe(expected);
  });

  it("déduit « in » pour une liste et « == » pour une valeur unique", () => {
    expect(evaluateRule(cond("crop_stage_in", undefined, ["SOWN"]), base).matched).toBe(true);
    expect(evaluateRule(cond("zae_in", undefined, "ZAE_5"), base).matched).toBe(true);
  });
});

describe("arbres all / any / not", () => {
  const dry = { indicator: "rain_sum_10d", op: "<", value: 5 } as const;
  const hot = { indicator: "temp_max_avg_3d", op: ">=", value: 40 } as const;
  it.each([
    [{ all: [dry, dry] }, true],
    [{ all: [dry, hot] }, false],
    [{ any: [dry, hot] }, true],
    [{ any: [hot, hot] }, false],
    [{ not: hot }, true],
    [{ not: dry }, false],
    [{ all: [dry, { not: hot }, { any: [hot, dry] }] }, true],
  ] as const)("%j → %s", (tree, expected) => {
    const result = evaluateRule(parseRuleDefinition(tree), base);
    expect(result.matched).toBe(expected);
  });

  it("évalue toutes les conditions sans court-circuit, avec leur chemin", () => {
    const tree = parseRuleDefinition({ all: [hot, dry, { not: hot }] });
    const { trace } = evaluateRule(tree, base);
    expect(trace.map((t) => t.path)).toEqual(["all.0", "all.1", "all.2.not"]);
    expect(trace.map((t) => t.result)).toEqual([false, true, false]);
  });
});

describe("indicateur manquant", () => {
  it("rend la condition fausse, la signale et ne lève jamais d'exception", () => {
    const tree: RuleNode = parseRuleDefinition({
      any: [{ indicator: "forecast_rain_sum_3d", op: ">=", value: 80 }],
    });
    const result = evaluateRule(tree, base);
    expect(result.matched).toBe(false);
    expect(result.missing).toEqual(["forecast_rain_sum_3d"]);
    expect(result.trace[0]).toMatchObject({ missing: true, result: false, actual: null });
    // Sous une négation, la condition manquante reste fausse : « not » la rend vraie.
    const negated = evaluateRule(parseRuleDefinition({ not: tree }), base);
    expect(negated.matched).toBe(true);
    expect(negated.missing).toEqual(["forecast_rain_sum_3d"]);
  });
});

describe("validation des définitions", () => {
  it.each<[unknown, string]>([
    [{ indicator: "rain_sum_10d", op: "<", value: "cinq" }, "nombre attendu"],
    [{ indicator: "rain_sum_10d", op: "in", value: 5 }, "liste attendue"],
    [{ indicator: "zae_in", op: ">", value: 3 }, "indicateur non numérique"],
    [{ indicator: "pluie", op: "<", value: 5 }, "indicateur inconnu"],
    [{ all: [] }, "liste vide"],
    [{ indicator: "rain_sum_10d", op: "<", value: 5, extra: true }, "clé inattendue"],
  ])("refuse %j (%s)", (definition) => {
    expect(() => parseRuleDefinition(definition)).toThrow();
  });
});

describe("explication en français", () => {
  it("écrit une phrase par condition avec unités et seuil", () => {
    const tree = parseRuleDefinition({
      all: [
        { indicator: "rain_sum_10d", op: "<", value: 5 },
        { indicator: "crop_stage_in", value: ["SOWN", "GROWING"] },
        { indicator: "forecast_rain_sum_3d", op: ">=", value: 80 },
      ],
    });
    const sentences = explainTrace(evaluateRule(tree, base).trace);
    expect(sentences).toEqual([
      "Cumul de pluie sur 10 jours : 2 mm, seuil < 5 mm (remplie).",
      "Stades des cultures : en croissance, semée ; attendu : semée ou en croissance (remplie).",
      "Pluie prévue sur les 3 prochains jours : donnée manquante, seuil ≥ 80 mm (non évaluable).",
    ]);
  });
});
