import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { MonitoringBusyError, runDailyMonitoring } from "@/modules/monitoring";
import { getMessagingChannel } from "@/services/messaging";
import { createWeatherProviders } from "@/services/weather";
import { isCronRequest } from "../cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tâche planifiée quotidienne (monitoring §2.E, 5 h à Porto-Novo) : ingestion météo des
// 77 communes, évaluation des règles, destinataires des nouvelles alertes et premier envoi.
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const env = getServerEnv();
  const providers = createWeatherProviders({
    provider: env.WEATHER_PROVIDER,
    openMeteoBaseUrl: env.OPEN_METEO_BASE_URL,
  });
  let result: Awaited<ReturnType<typeof runDailyMonitoring>>;
  try {
    result = await runDailyMonitoring({
      ...providers,
      // Pas encore d'adaptateur SMS : les producteurs sans WhatsApp sont relayés par l'agent.
      messaging: { WHATSAPP: getMessagingChannel(), SMS: null },
    });
  } catch (error) {
    if (error instanceof MonitoringBusyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({
    ingestion: result.ingestion,
    evaluation: {
      referenceDate: result.evaluation.referenceDate,
      evaluations: result.evaluation.evaluations,
      matched: result.evaluation.matched,
      raised: result.evaluation.raised.length,
      extended: result.evaluation.extended,
      expired: result.evaluation.expired,
      staleCommunes: result.evaluation.staleCommunes,
    },
    dispatch: result.dispatch,
  });
}

// Vercel Cron appelle les tâches planifiées en GET, avec le même en-tête
// `Authorization: Bearer <CRON_SECRET>` : même traitement, même contrôle (ADR-0006).
export const GET = POST;
