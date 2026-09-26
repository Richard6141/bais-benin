import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import {
  queueFarmerNotification,
  reportConfirmedText,
  reportDismissedText,
} from "@/modules/notifications";
import { reportResource } from "./queries";

// Suite donnée à un signalement après une visite : l'agent (ou le ministère) le confirme ou
// l'écarte, avec une note. Seul un signalement confirmé compte pour la détection des foyers
// quand la règle l'exige (ADR-0015). Une décision n'est prise qu'une fois ; une erreur se
// corrige par un nouveau signalement, pas en réécrivant l'historique. La décision met en file,
// dans la même transaction, le message WhatsApp au producteur de l'exploitation.

export type ReviewDecision = "CONFIRMED" | "DISMISSED";

export type ReviewResult =
  | { ok: true; notificationId: string | null }
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
  const reviewNote = trimmed.slice(0, 1000) || null;

  const notificationId = await prisma.$transaction(async (tx) => {
    const updated = await tx.fieldReport.updateMany({
      where: { id: reportId, status: "SUBMITTED" },
      data: { status: decision, reviewedById: actor.userId, reviewedAt: now, reviewNote },
    });
    if (updated.count === 0) return undefined;
    await tx.farmEvent.create({
      data: {
        farmId: found.farmId,
        kind: "REPORT_REVIEWED",
        payload: { reportId, decision },
        actorId: actor.userId,
        occurredAt: now,
      },
    });
    const report = await tx.fieldReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { type: true, observedAt: true, farm: { select: { farmerId: true } } },
    });
    const subject = { type: report.type, observedAt: report.observedAt };
    return queueFarmerNotification(
      tx,
      {
        kind: decision === "CONFIRMED" ? "REPORT_CONFIRMED" : "REPORT_DISMISSED",
        subjectId: reportId,
        farmerId: report.farm.farmerId,
        text:
          decision === "CONFIRMED"
            ? reportConfirmedText(subject)
            : reportDismissedText({ ...subject, note: reviewNote }),
      },
      now,
    );
  });
  if (notificationId === undefined) return { ok: false, code: "ALREADY_REVIEWED" };

  await recordAudit({
    action: "report.reviewed",
    actorId: actor.userId,
    resourceType: "fieldReport",
    resourceId: reportId,
    details: { decision },
  });
  return { ok: true, notificationId };
}
