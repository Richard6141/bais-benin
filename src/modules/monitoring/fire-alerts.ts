import { prisma } from "@/database/client";
import { communesNearFires } from "@/database/sql/fires.sql";
import { planAlertRecipients } from "./delivery";
import { beninToday } from "./dates";
import { evaluateCommunes, type EvaluationSummary } from "./evaluation";

// Alertes « feu de brousse » (ADR-0022) : une règle qui lit fire_near_parcels (exploitations dont
// une parcelle est à moins de 1 km d'un feu détecté dans les dernières 24 heures) est évaluée
// après chaque passage d'ingestion, pour les communes des parcelles proches des feux nouveaux.
// Les destinataires sont les producteurs des exploitations touchées et les agents qui les ont
// enregistrées (plan.ts, ADR-0014) ; le ministère voit toutes les alertes.

/**
 * Après un passage : évalue les règles de feux pour les communes des parcelles proches des
 * détections nouvelles ou complétées, puis complète les destinataires des alertes de feu déjà
 * actives (une exploitation touchée par un feu plus tardif est prévenue aussi).
 */
export async function evaluateNewFires(
  detectionIds: readonly string[],
  now: Date = new Date(),
): Promise<EvaluationSummary | null> {
  const communeIds = await communesNearFires(detectionIds);
  if (communeIds.length === 0) return null;
  const summary = await evaluateCommunes(
    { communeIds, fireRulesOnly: true, referenceDate: beninToday(now) },
    {
      planRecipients: async (alertId) => {
        await planAlertRecipients(prisma, alertId, now);
      },
      now: () => now,
    },
  );
  const active = await prisma.alert.findMany({
    where: { communeId: { in: communeIds }, status: "ACTIVE", category: "FIRE" },
    select: { id: true },
  });
  for (const alert of active) {
    if (!summary.raised.includes(alert.id)) await planAlertRecipients(prisma, alert.id, now);
  }
  return summary;
}
