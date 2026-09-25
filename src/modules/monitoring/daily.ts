import { prisma } from "@/database/client";
import type { WeatherProvider } from "@/services/ports/weather-provider";
import {
  dispatchPendingDeliveries,
  planAlertRecipients,
  type DeliveryChannels,
  type DispatchSummary,
} from "./delivery";
import { evaluateCommunes, type EvaluationSummary } from "./evaluation";
import { runWeatherIngestion, type IngestionResult } from "./ingestion";
import { withMonitoringLock } from "./lock";

// Orchestration des tâches planifiées du monitoring (§2.E) :
// - quotidienne (5 h) : ingestion météo, évaluation, destinataires des nouvelles alertes, envoi ;
// - fréquente (toutes les 10 minutes) : envoi des messages en attente (relances, fin du silence
//   nocturne, repli après échec).

export const planRecipientsFor = async (alertId: string): Promise<void> => {
  await planAlertRecipients(prisma, alertId);
};

export interface DailyRunResult {
  ingestion: IngestionResult;
  evaluation: EvaluationSummary;
  dispatch: DispatchSummary;
}

export async function runDailyMonitoring(deps: {
  primary: WeatherProvider;
  fallback?: WeatherProvider;
  messaging: DeliveryChannels;
  now?: Date;
}): Promise<DailyRunResult> {
  // Deux exécutions simultanées (cron et relance manuelle) lèveraient deux fois les mêmes alertes :
  // la seconde reçoit MonitoringBusyError.
  return withMonitoringLock("daily", async () => {
    const ingestion = await runWeatherIngestion({ primary: deps.primary, fallback: deps.fallback });
    const evaluation = await evaluateCommunes({}, { planRecipients: planRecipientsFor });
    const dispatch = await runDispatch(deps.messaging, deps.now);
    return { ingestion, evaluation, dispatch };
  });
}

/** Envoi des messages en attente, jamais deux à la fois (un même message partirait deux fois). */
export function runDispatch(messaging: DeliveryChannels, now?: Date): Promise<DispatchSummary> {
  return withMonitoringLock("dispatch", () => dispatchPendingDeliveries({ messaging, now }));
}

/** Destinataires des alertes actives qui n'en ont pas encore (reprise, démonstration). */
export async function planMissingRecipients(): Promise<number> {
  const alerts = await prisma.alert.findMany({
    where: { status: "ACTIVE", recipients: { none: {} } },
    select: { id: true },
  });
  for (const alert of alerts) await planRecipientsFor(alert.id);
  return alerts.length;
}
