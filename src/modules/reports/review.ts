import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import { reportResource } from "./queries";

// Suite donnée à un signalement après une visite : l'agent (ou le ministère) le confirme ou
// l'écarte, avec une note. Seul un signalement confirmé compte pour la détection des foyers
// quand la règle l'exige (ADR-0015). Une décision n'est prise qu'une fois ; une erreur se
// corrige par un nouveau signalement, pas en réécrivant l'historique.

export type ReviewDecision = "CONFIRMED" | "DISMISSED";

export type ReviewResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "ALREADY_REVIEWED" | "NOTE_REQUIRED" };

export async function reviewReport(
  actor: Actor,
  reportId: string,
  decision: ReviewDecision,
  note: string,
  now = new Date(),
): Promise<ReviewResult> {
  const found = await reportResource(reportId);
  if (!found || !authorize(actor, "report.read", found.resource).allowed) {
    return { ok: false, code: "NOT_FOUND" };
  }
  if (!authorize(actor, "report.review", found.resource).allowed) {
    return { ok: false, code: "FORBIDDEN" };
  }
  const trimmed = note.trim();
  // Écarter un signalement doit être motivé : le producteur verra pourquoi.
  if (decision === "DISMISSED" && trimmed.length < 5) return { ok: false, code: "NOTE_REQUIRED" };

  const updated = await prisma.fieldReport.updateMany({
    where: { id: reportId, status: "SUBMITTED" },
    data: {
      status: decision,
      reviewedById: actor.userId,
      reviewedAt: now,
      reviewNote: trimmed.slice(0, 1000) || null,
    },
  });
  if (updated.count === 0) return { ok: false, code: "ALREADY_REVIEWED" };

  await prisma.farmEvent.create({
    data: {
      farmId: found.farmId,
      kind: "REPORT_REVIEWED",
      payload: { reportId, decision },
      actorId: actor.userId,
      occurredAt: now,
    },
  });
  await recordAudit({
    action: "report.reviewed",
    actorId: actor.userId,
    resourceType: "fieldReport",
    resourceId: reportId,
    details: { decision },
  });
  return { ok: true };
}
