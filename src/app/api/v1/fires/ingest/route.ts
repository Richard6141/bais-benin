import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { queueBurnAssessmentsForActiveFireAlerts, runFireIngestion } from "@/modules/fires";
import { evaluateNewFires } from "@/modules/monitoring";
import { getFireProvider } from "@/services/fires";
import { isCronRequest } from "../../monitoring/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tâche planifiée toutes les 30 minutes (ADR-0022) : feux actifs NASA FIRMS des dernières 24 h,
// dédoublonnés et rattachés aux communes, puis alertes « feu de brousse » pour les communes dont
// des parcelles sont à moins de 1 km des feux nouveaux. L'envoi des messages suit par la tâche
// d'envoi (toutes les 10 minutes).
export async function POST(request: NextRequest) {
  if (!isCronRequest(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const ingestion = await runFireIngestion({ provider: getFireProvider() });
  let alerts: { raised: number; extended: number } | null = null;
  try {
    const summary = await evaluateNewFires(ingestion.changedIds);
    alerts = summary ? { raised: summary.raised.length, extended: summary.extended } : null;
  } catch (error) {
    logger.error({ err: error }, "Évaluation des alertes de feu impossible");
  }
  // Surface brûlée (ADR-0038 §2) : les parcelles exposées aux feux des alertes actives sont mises
  // en file, pour une mesure 15 à 30 jours après le feu.
  let burnQueued: number | null = null;
  try {
    burnQueued = await queueBurnAssessmentsForActiveFireAlerts();
  } catch (error) {
    logger.error({ err: error }, "Mise en file des surfaces brûlées impossible");
  }
  const { runId, status, fetched, created, merged, failedFiles } = ingestion;
  return NextResponse.json(
    { runId, status, fetched, created, merged, failedFiles, alerts, burnQueued },
    { status: status === "FAILED" ? 502 : 200 },
  );
}

// Vercel Cron appelle en GET avec le même en-tête Authorization : même traitement.
export const GET = POST;
