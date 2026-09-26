import { describe, expect, it } from "vitest";

import {
  applyDrySpell,
  applyFloodEpisode,
  applyHeatWave,
  generateDailyWeather,
  type DailyWeather,
  type ZoneCode,
} from "@/services/weather/fixture";
import {
  DEFAULT_RULES,
  SHORT_MESSAGE_MAX,
  computeIndicators,
  evaluateRule,
  findDefaultRule,
  renderMessage,
  usesFires,
  usesReports,
  usesWeather,
  type CropPresence,
  type IndicatorValues,
} from "..";

// Chaque règle par défaut est déclenchée par le scénario de fixture correspondant et ne l'est pas
// sur la série normale de la même zone, à la même date. Séries déterministes (graine fixe).

const SEED = 20_260_925;
const LOCATIONS: Record<ZoneCode, { latitude: number; longitude: number }> = {
  ZAE_1: { latitude: 11.87, longitude: 3.38 },
  ZAE_2: { latitude: 11.13, longitude: 2.94 },
  ZAE_3: { latitude: 9.34, longitude: 2.63 },
  ZAE_4: { latitude: 10.3, longitude: 1.38 },
  ZAE_5: { latitude: 7.93, longitude: 1.98 },
  ZAE_6: { latitude: 6.67, longitude: 2.15 },
  ZAE_7: { latitude: 7.0, longitude: 2.1 },
  ZAE_8: { latitude: 6.37, longitude: 2.43 },
};

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Série de 45 jours d'observations jusqu'à `ref` et 3 jours de prévisions après. */
function series(zone: ZoneCode, ref: string): DailyWeather[] {
  return generateDailyWeather({
    zoneCode: zone,
    ...LOCATIONS[zone],
    from: shift(ref, -44),
    to: shift(ref, 3),
    seed: SEED,
    forecastFrom: shift(ref, 1),
  });
}

function indicatorsOf(
  data: DailyWeather[],
  zone: ZoneCode,
  ref: string,
  crops: CropPresence[],
): IndicatorValues {
  return computeIndicators({
    observed: data.filter((d) => d.kind === "OBSERVED"),
    forecast: data.filter((d) => d.kind === "FORECAST"),
    referenceDate: ref,
    zoneCode: zone,
    crops,
  });
}

const MAIZE_GROWING: CropPresence[] = [{ cropCode: "MAIZE", stage: "GROWING" }];

interface Case {
  code: string;
  zone: ZoneCode;
  ref: string;
  crops: CropPresence[];
  scenario: (normal: DailyWeather[], ref: string) => DailyWeather[];
}

const CASES: Case[] = [
  {
    code: "WATER_STRESS_EARLY_V1",
    zone: "ZAE_5",
    ref: "2026-06-30",
    crops: [{ cropCode: "MAIZE", stage: "SOWN" }],
    scenario: (s, ref) => applyDrySpell(s, shift(ref, -11), 12),
  },
  {
    code: "WATER_STRESS_SEVERE_V1",
    zone: "ZAE_2",
    ref: "2026-07-20",
    crops: MAIZE_GROWING,
    scenario: (s, ref) => applyDrySpell(s, shift(ref, -19), 20),
  },
  {
    code: "FLOOD_RISK_V1",
    zone: "ZAE_6",
    ref: "2026-06-15",
    crops: MAIZE_GROWING,
    scenario: (s, ref) => applyFloodEpisode(s, shift(ref, -2), 3, 180),
  },
  {
    code: "HEAT_MAIZE_FLOWERING_V1",
    zone: "ZAE_2",
    ref: "2026-08-15",
    crops: MAIZE_GROWING,
    scenario: (s, ref) => applyHeatWave(s, shift(ref, -2), 3, 38),
  },
  {
    code: "HEAVY_RAIN_FORECAST_V1",
    zone: "ZAE_5",
    ref: "2026-09-10",
    crops: MAIZE_GROWING,
    scenario: (s, ref) => applyFloodEpisode(s, shift(ref, 1), 3, 120),
  },
  {
    code: "PEST_FALL_ARMYWORM_V1",
    zone: "ZAE_5",
    ref: "2026-06-30",
    crops: [{ cropCode: "MAIZE", stage: "SOWN" }],
    // Un mois sec puis 40 mm sur les quatre derniers jours.
    scenario: (s, ref) =>
      applyFloodEpisode(applyDrySpell(s, shift(ref, -29), 26), shift(ref, -3), 4, 40),
  },
];

describe("règles par défaut", () => {
  it("sont dix, valides, avec des codes uniques : six météo, trois de regroupement, un feu", () => {
    expect(DEFAULT_RULES).toHaveLength(10);
    expect(new Set(DEFAULT_RULES.map((r) => r.code)).size).toBe(10);
    const weather = DEFAULT_RULES.filter(
      (r) => !usesReports(r.definition) && !usesFires(r.definition),
    );
    expect(weather.map((r) => r.code).sort()).toEqual(CASES.map((c) => c.code).sort());
    expect(new Set(DEFAULT_RULES.map((r) => r.category))).toEqual(
      new Set(["WATER_STRESS", "FLOOD", "HEAT", "PEST", "CROP_DISEASE", "ANIMAL_DISEASE", "FIRE"]),
    );
  });

  it("lève l'alerte « feu de brousse » dès une exploitation à moins de 1 km d'un feu", () => {
    const rule = findDefaultRule("FIRE_NEAR_PARCELS_V1");
    expect(rule?.category).toBe("FIRE");
    expect(usesWeather(rule!.definition)).toBe(false);
    const empty = computeIndicators({
      observed: [],
      forecast: [],
      referenceDate: "2026-07-15",
      zoneCode: null,
      crops: [],
    });
    const values = (farms: number | null) => ({ ...empty, fire_near_parcels: farms });
    expect(evaluateRule(rule!.definition, values(1)).matched).toBe(true);
    expect(evaluateRule(rule!.definition, values(0)).matched).toBe(false);
    const short = renderMessage(rule!.messageShort, values(2), { commune: "Djougou" });
    expect(short.length).toBeLessThanOrEqual(SHORT_MESSAGE_MAX);
  });

  describe.each(CASES)("$code", ({ code, zone, ref, crops, scenario }) => {
    const rule = findDefaultRule(code);
    if (!rule) throw new Error(`Règle ${code} absente`);
    const normal = series(zone, ref);
    const stressed = scenario(normal, ref);

    it("se déclenche sur le scénario de fixture", () => {
      const result = evaluateRule(rule.definition, indicatorsOf(stressed, zone, ref, crops));
      expect(result.matched, JSON.stringify(result.trace)).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("ne se déclenche pas sur la série normale de la même zone", () => {
      const result = evaluateRule(rule.definition, indicatorsOf(normal, zone, ref, crops));
      expect(result.matched, JSON.stringify(result.trace)).toBe(false);
    });

    it("rend des messages complets, le court en 160 caractères au plus", () => {
      const indicators = indicatorsOf(stressed, zone, ref, crops);
      // Nom de commune parmi les plus longs, pour éprouver la limite du message court.
      const context = { commune: "Akpro-Missérété" };
      const short = renderMessage(rule.messageShort, indicators, context);
      const long = renderMessage(rule.messageFr, indicators, context);
      expect(short.length).toBeLessThanOrEqual(SHORT_MESSAGE_MAX);
      for (const message of [short, long]) {
        expect(message).toContain("Akpro-Missérété");
        expect(message).not.toMatch(/[{}]|—|NaN|undefined/);
      }
    });
  });
});

describe("renderMessage", () => {
  it("formate les nombres en français et remplace les marqueurs inconnus par un tiret", () => {
    const text = renderMessage(
      "{commune} : {rain_sum_10d} mm, bilan {water_balance_10d} mm, {inconnu}.",
      { rain_sum_10d: 2.46, water_balance_10d: -1234.5 },
      { commune: "Djougou" },
    );
    expect(text).toMatch(/^Djougou : 2,5 mm, bilan −?-?1\s235 mm, —\.$/);
  });
});

// ADR-0015 : les règles de regroupement ne lisent que les signalements, jamais la météo.
describe.each(["PEST_OUTBREAK_V1", "CROP_DISEASE_OUTBREAK_V1", "ANIMAL_DISEASE_OUTBREAK_V1"])(
  "%s",
  (code) => {
    const rule = findDefaultRule(code);
    if (!rule) throw new Error(`Règle ${code} absente`);
    const noWeather = computeIndicators({
      observed: [],
      forecast: [],
      referenceDate: "2026-07-15",
      zoneCode: null,
      crops: [],
    });

    it("se déclenche à partir de 3 producteurs, jamais sur 2", () => {
      expect(evaluateRule(rule.definition, noWeather, () => 3).matched).toBe(true);
      expect(evaluateRule(rule.definition, noWeather, () => 2).matched).toBe(false);
      // Sans valeur de regroupement connue, la condition est non évaluable, jamais vraie.
      expect(evaluateRule(rule.definition, noWeather).matched).toBe(false);
    });

    it("rend des messages complets, le court en 160 caractères au plus", () => {
      const context = { commune: "Akpro-Missérété", report_cluster: 4, radius_km: 5, days: 7 };
      const short = renderMessage(rule.messageShort, noWeather, context);
      const long = renderMessage(rule.messageFr, noWeather, context);
      expect(short.length).toBeLessThanOrEqual(SHORT_MESSAGE_MAX);
      expect(long).toContain("4 producteurs");
      for (const message of [short, long]) {
        expect(message).toContain("Akpro-Missérété");
        expect(message).not.toMatch(/[{}]|—|NaN|undefined/);
      }
    });
  },
);
