import { prisma } from "@/database/client";
import { communesNearReports } from "@/database/sql/report-clusters.sql";
import { planRecipientsFor } from "./daily";
import { beninToday } from "./dates";
import { evaluateCommunes, type EvaluationSummary } from "./evaluation";
import { clusterParamsOf, parseRuleDefinition } from "./rules";

// Évaluation immédiate des regroupements (ADR-0015) : à l'arrivée de signalements, les règles de
// regroupement sont réévaluées tout de suite pour les communes où un foyer peut les englober
// (celle du signalement et celles des signalements voisins dans le plus grand rayon des règles
// actives), sans attendre l'évaluation quotidienne. Date de référence : aujourd'hui, pour que
// les signalements du jour comptent. Les destinataires sont planifiés comme pour toute alerte ;
// l'envoi suit au prochain passage de la diffusion.

export async function evaluateNewReports(
  reportIds: readonly string[],
  now: Date = new Date(),
): Promise<EvaluationSummary | null> {
  if (reportIds.length === 0) return null;
  const rules = await prisma.rule.findMany({
    where: { enabled: true },
    select: { definition: true },
  });
  const params = clusterParamsOf(rules.map((rule) => parseRuleDefinition(rule.definition)));
  if (params.length === 0) return null;
  const radiusKm = Math.max(...params.map((p) => p.radiusKm));
  const communeIds = await communesNearReports(reportIds, radiusKm);
  if (communeIds.length === 0) return null;
  return evaluateCommunes(
    { communeIds, reportRulesOnly: true, referenceDate: beninToday(now) },
    { planRecipients: planRecipientsFor, now: () => now },
  );
}
