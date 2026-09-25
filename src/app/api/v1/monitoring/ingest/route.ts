import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { evaluateCommunes, runWeatherIngestion } from "@/modules/monitoring";
import { createWeatherProviders } from "@/services/weather";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Tâche planifiée quotidienne (monitoring §2.E) : ingestion météo des 77 communes puis
// évaluation des règles. Appelée par cron avec `Authorization: Bearer <CRON_SECRET>` ;
// sans secret configuré, la route est fermée.
export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.CRON_SECRET || !secretMatches(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const providers = createWeatherProviders({
    provider: env.WEATHER_PROVIDER,
    openMeteoBaseUrl: env.OPEN_METEO_BASE_URL,
  });
  const ingestion = await runWeatherIngestion(providers);
  const evaluation = await evaluateCommunes();
  return NextResponse.json({
    ingestion,
    evaluation: {
      referenceDate: evaluation.referenceDate,
      evaluations: evaluation.evaluations,
      matched: evaluation.matched,
      raised: evaluation.raised.length,
      extended: evaluation.extended,
      expired: evaluation.expired,
      staleCommunes: evaluation.staleCommunes,
    },
  });
}
