import { getServerEnv } from "@/lib/env";
import {
  evaluateCommunes,
  runWeatherIngestion,
  seedDemoEpisodes,
  type DemoEpisodeResult,
  seedDefaultRules,
  type EvaluationSummary,
  type IngestionResult,
} from "@/modules/monitoring";
import { createWeatherProviders } from "@/services/weather";

export interface MonitoringSeedSummary {
  rulesCreated: number;
  ingestion: Pick<IngestionResult, "provider" | "fallback" | "rows" | "communesFailed"> | null;
  evaluation:
    | (Pick<EvaluationSummary, "evaluations" | "matched" | "staleCommunes"> & {
        raised: number;
      })
    | null;
  demoEpisodes: DemoEpisodeResult[];
}

// Règles par défaut, puis une première ingestion météo (Open-Meteo, ou la fixture si le réseau
// manque) et une évaluation, pour que la démonstration montre des alertes dès l'installation.
// SEED_WEATHER=0 saute l'ingestion (tests, postes sans réseau pressés).
export async function seedMonitoring(
  options: {
    planRecipients?: (alertId: string) => Promise<void>;
  } = {},
): Promise<MonitoringSeedSummary> {
  const rulesCreated = await seedDefaultRules();
  if (process.env.SEED_WEATHER === "0") {
    return { rulesCreated, ingestion: null, evaluation: null, demoEpisodes: [] };
  }
  const env = getServerEnv();
  const providers = createWeatherProviders({
    provider: env.WEATHER_PROVIDER,
    openMeteoBaseUrl: env.OPEN_METEO_BASE_URL,
  });
  const ingestion = await runWeatherIngestion({ ...providers, retryDelayMs: 1000 });
  const evaluation = await evaluateCommunes({}, { planRecipients: options.planRecipients });
  // Épisodes de démonstration : jamais en production.
  const demoEpisodes =
    env.APP_ENV === "production"
      ? []
      : await seedDemoEpisodes({ planRecipients: options.planRecipients });
  return {
    rulesCreated,
    ingestion: {
      provider: ingestion.provider,
      fallback: ingestion.fallback,
      rows: ingestion.rows,
      communesFailed: ingestion.communesFailed,
    },
    evaluation: {
      evaluations: evaluation.evaluations,
      matched: evaluation.matched,
      staleCommunes: evaluation.staleCommunes,
      raised: evaluation.raised.length,
    },
    demoEpisodes,
  };
}
