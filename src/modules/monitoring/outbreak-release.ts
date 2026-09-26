import { prisma } from "@/database/client";
import { confirmedReportInFoyer } from "@/database/sql/report-clusters.sql";
import type { FieldReportType } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/modules/audit";
import { planAlertRecipients } from "./delivery";
import { clusterParamsOf, parseRuleDefinition } from "./rules";

// Diffusion d'un foyer après confirmation (ADR-0015, revue de sécurité R1). Un foyer compté sur
// des signalements non vérifiés reste dans l'application : agents et ministère le voient, les
// producteurs ne reçoivent rien. Dès qu'un agent confirme un signalement qui en fait partie, ou si
// un signalement du foyer était déjà confirmé à la levée, l'alerte est libérée : ses destinataires
// producteurs sont planifiés et la diffusion suit au prochain passage (10 minutes au plus).

const CATEGORY_OF_TYPE: Partial<
  Record<FieldReportType, "PEST" | "CROP_DISEASE" | "ANIMAL_DISEASE">
> = { PEST: "PEST", CROP_DISEASE: "CROP_DISEASE", ANIMAL_DISEASE: "ANIMAL_DISEASE" };

/**
 * Libère une alerte retenue si un signalement confirmé appartient à son foyer (avec `reportId`,
 * seulement ce signalement). Renvoie vrai si l'alerte vient d'être libérée.
 */
export async function releaseIfConfirmed(
  alertId: string,
  now: Date = new Date(),
  reportId?: string,
): Promise<boolean> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      communeId: true,
      status: true,
      awaitingConfirmation: true,
      rule: { select: { definition: true } },
    },
  });
  if (!alert || !alert.awaitingConfirmation || alert.status !== "ACTIVE") return false;
  const params = clusterParamsOf([parseRuleDefinition(alert.rule.definition)])[0];
  if (!params) return false;
  // Fenêtre qui se termine demain à minuit : les signalements du jour comptent.
  const until = new Date(now.getTime() + 86_400_000);
  const found = await confirmedReportInFoyer({
    communeId: alert.communeId,
    type: params.type,
    radiusKm: params.radiusKm,
    days: params.days,
    until,
    reportId,
  });
  if (!found) return false;
  const updated = await prisma.alert.updateMany({
    where: { id: alertId, awaitingConfirmation: true, status: "ACTIVE" },
    data: { awaitingConfirmation: false, releasedAt: now },
  });
  if (updated.count === 0) return false;
  await planAlertRecipients(prisma, alertId, now);
  await recordAudit({
    action: "alert.released",
    resourceType: "alert",
    resourceId: alertId,
    details: reportId ? { confirmedReportId: reportId } : { atRaise: true },
  });
  return true;
}

/** Après la confirmation d'un signalement : libère les foyers retenus dont il fait partie. */
export async function releaseOutbreakAlertsForReport(
  reportId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const report = await prisma.fieldReport.findUnique({
    where: { id: reportId },
    select: { type: true, status: true },
  });
  const category = report ? CATEGORY_OF_TYPE[report.type] : undefined;
  if (!report || report.status !== "CONFIRMED" || !category) return [];
  const held = await prisma.alert.findMany({
    where: { status: "ACTIVE", awaitingConfirmation: true, category },
    select: { id: true },
  });
  const released: string[] = [];
  for (const alert of held) {
    try {
      if (await releaseIfConfirmed(alert.id, now, reportId)) released.push(alert.id);
    } catch (error) {
      logger.error({ err: error, alertId: alert.id, reportId }, "Libération du foyer impossible");
    }
  }
  return released;
}
