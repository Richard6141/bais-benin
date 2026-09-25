import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { readCommuneLocations, readCropPresence } from "@/database/sql/weather.sql";
import {
  ZONE_CODES,
  applyDrySpell,
  applyFloodEpisode,
  applyHeatWave,
  generateDailyWeather,
  type DailyWeather,
  type ZoneCode,
} from "@/services/weather/fixture";
import { addDays, beninToday } from "./dates";
import { raiseOrExtend, type CommuneContext } from "./evaluation";
import { computeIndicators, evaluateRule, parseRuleDefinition } from "./rules";

// Épisodes de démonstration : la météo réelle de fin septembre ne déclenche pas forcément
// d'alerte le jour d'une présentation. Hors production, quelques épisodes plausibles sont
// rejoués sur des séries synthétiques et évalués par le vrai moteur de règles. Les alertes
// produites portent la source « Données de démonstration » et la fiabilité SYNTHETIC : elles
// restent dans l'application et ne partent jamais par message.

interface Episode {
  communeCode: string;
  ruleCode: string;
  scenario: (series: DailyWeather[], ref: string) => DailyWeather[];
}

export const DEMO_EPISODES: readonly Episode[] = [
  {
    communeCode: "BJ-DON-003", // Djougou : poche sèche de 12 jours après semis.
    ruleCode: "WATER_STRESS_EARLY",
    scenario: (s, ref) => applyDrySpell(s, addDays(ref, -11), 12),
  },
  {
    communeCode: "BJ-OUE-002", // Adjohoun : 180 mm en 3 jours dans la vallée de l'Ouémé.
    ruleCode: "FLOOD_RISK",
    scenario: (s, ref) => applyFloodEpisode(s, addDays(ref, -2), 3, 180),
  },
  {
    communeCode: "BJ-ALI-005", // Malanville : vague de chaleur sur maïs.
    ruleCode: "HEAT_MAIZE_FLOWERING",
    scenario: (s, ref) => applyHeatWave(s, addDays(ref, -2), 3, 38),
  },
  {
    communeCode: "BJ-COL-005", // Savalou : fortes pluies annoncées.
    ruleCode: "HEAVY_RAIN_FORECAST",
    scenario: (s, ref) => applyFloodEpisode(s, addDays(ref, 1), 3, 120),
  },
  {
    communeCode: "BJ-ZOU-003", // Bohicon : reprise des pluies après sécheresse, maïs exposé.
    ruleCode: "PEST_FALL_ARMYWORM",
    scenario: (s, ref) =>
      applyFloodEpisode(applyDrySpell(s, addDays(ref, -29), 26), addDays(ref, -3), 4, 40),
  },
];

export interface DemoEpisodeResult {
  communeCode: string;
  ruleCode: string;
  outcome: "raised" | "extended" | "skipped" | "not-matched" | "missing";
  missing?: string[];
}

function isZone(code: string | null): code is ZoneCode {
  return code !== null && (ZONE_CODES as readonly string[]).includes(code);
}

export async function seedDemoEpisodes(
  options: {
    referenceDate?: string;
    planRecipients?: (alertId: string) => Promise<void>;
  } = {},
): Promise<DemoEpisodeResult[]> {
  const ref = options.referenceDate ?? beninToday();
  const now = new Date();
  const communes = await readCommuneLocations();
  const results: DemoEpisodeResult[] = [];

  for (const episode of DEMO_EPISODES) {
    const commune = communes.find((c) => c.code === episode.communeCode);
    const rule = await prisma.rule.findFirst({
      where: { code: episode.ruleCode, enabled: true },
      orderBy: { version: "desc" },
    });
    if (!commune || !rule || !isZone(commune.zone_code)) {
      results.push({
        communeCode: episode.communeCode,
        ruleCode: episode.ruleCode,
        outcome: "missing",
      });
      continue;
    }
    const normal = generateDailyWeather({
      zoneCode: commune.zone_code,
      latitude: commune.lat,
      longitude: commune.lng,
      from: addDays(ref, -34),
      to: addDays(ref, 3),
      seed: 2026,
      forecastFrom: addDays(ref, 1),
    });
    const series = episode.scenario(normal, ref);
    const crops = (await readCropPresence([commune.id])).map((p) => ({
      cropCode: p.crop_code,
      stage: p.stage,
    }));
    const indicators = computeIndicators({
      observed: series.filter((d) => d.date <= ref),
      forecast: series.filter((d) => d.date > ref),
      referenceDate: ref,
      zoneCode: commune.zone_code,
      crops,
    });
    const result = evaluateRule(parseRuleDefinition(rule.definition), indicators);
    const evaluation = await prisma.ruleEvaluation.create({
      data: {
        ruleId: rule.id,
        communeId: commune.id,
        referenceDate: new Date(`${ref}T00:00:00Z`),
        matched: result.matched,
        indicatorsSnapshot: indicators as Prisma.InputJsonValue,
        trace: result.trace as unknown as Prisma.InputJsonValue,
        missing: result.missing,
      },
    });
    if (!result.matched) {
      results.push({
        communeCode: episode.communeCode,
        ruleCode: episode.ruleCode,
        outcome: "not-matched",
        missing: result.missing,
      });
      continue;
    }
    const context: CommuneContext = {
      commune,
      indicators,
      stale: false,
      sourceId: "BAIS_SEED",
      reliability: "SYNTHETIC",
      sourceDate: now,
    };
    const outcome = await raiseOrExtend(rule, context, evaluation.id, result.trace, now);
    if (outcome.kind === "raised" && options.planRecipients)
      await options.planRecipients(outcome.alertId);
    results.push({
      communeCode: episode.communeCode,
      ruleCode: episode.ruleCode,
      outcome: outcome.kind,
    });
  }
  return results;
}
