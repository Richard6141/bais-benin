import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import {
  assistanceResolvedText,
  assistanceTakenText,
  queueFarmerNotification,
} from "@/modules/notifications";
import { assistanceResource } from "./queries";

// Suivi d'une demande par un agent de la commune : prise en charge (reçue → en cours), puis
// résolution avec une réponse que le producteur lira. Une demande peut être résolue directement,
// sans étape « en cours » (question simple réglée au téléphone). Chaque passage est journalisé et
// met en file, dans la même transaction, le message WhatsApp qui prévient le producteur.

export type HandleResult =
  | { ok: true; notificationId: string | null }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "NOTE_REQUIRED" };

async function refusal(actor: Actor, id: string): Promise<"NOT_FOUND" | "FORBIDDEN" | null> {
  const found = await assistanceResource(id);
  if (!found || !authorize(actor, "assistance.read", found.resource).allowed) return "NOT_FOUND";
  if (!authorize(actor, "assistance.handle", found.resource).allowed) return "FORBIDDEN";
  return null;
}

export async function takeChargeOfRequest(
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<HandleResult> {
  const refused = await refusal(actor, id);
  if (refused) return { ok: false, code: refused };
  const notificationId = await prisma.$transaction(async (tx) => {
    const updated = await tx.assistanceRequest.updateMany({
      where: { id, status: "RECEIVED" },
      data: { status: "IN_PROGRESS", handledById: actor.userId, takenAt: now },
    });
    if (updated.count === 0) return undefined;
    const request = await tx.assistanceRequest.findUniqueOrThrow({
      where: { id },
      select: { requesterId: true, category: true, createdAt: true },
    });
    return queueFarmerNotification(
      tx,
      {
        kind: "ASSISTANCE_TAKEN",
        subjectId: id,
        farmerUserId: request.requesterId,
        text: assistanceTakenText({ category: request.category, requestedAt: request.createdAt }),
      },
      now,
    );
  });
  if (notificationId === undefined) return { ok: false, code: "INVALID_STATE" };
  await recordAudit({
    action: "assistance.taken",
    actorId: actor.userId,
    resourceType: "assistanceRequest",
    resourceId: id,
  });
  return { ok: true, notificationId };
}

export async function resolveRequest(
  actor: Actor,
  id: string,
  note: string,
  now = new Date(),
): Promise<HandleResult> {
  const refused = await refusal(actor, id);
  if (refused) return { ok: false, code: refused };
  const trimmed = note.trim();
  if (trimmed.length < 5) return { ok: false, code: "NOTE_REQUIRED" };

  const notificationId = await prisma.$transaction(async (tx) => {
    const current = await tx.assistanceRequest.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        handledById: true,
        takenAt: true,
        requesterId: true,
        category: true,
        createdAt: true,
      },
    });
    if (current.status === "RESOLVED") return undefined;
    // Condition sur le statut lu : une résolution concurrente ne s'applique qu'une fois.
    const resolutionNote = trimmed.slice(0, 1000);
    const updated = await tx.assistanceRequest.updateMany({
      where: { id, status: current.status },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolutionNote,
        handledById: current.handledById ?? actor.userId,
        takenAt: current.takenAt ?? now,
      },
    });
    if (updated.count === 0) return undefined;
    return queueFarmerNotification(
      tx,
      {
        kind: "ASSISTANCE_RESOLVED",
        subjectId: id,
        farmerUserId: current.requesterId,
        text: assistanceResolvedText({
          category: current.category,
          requestedAt: current.createdAt,
          note: resolutionNote,
        }),
      },
      now,
    );
  });
  if (notificationId === undefined) return { ok: false, code: "INVALID_STATE" };
  await recordAudit({
    action: "assistance.resolved",
    actorId: actor.userId,
    resourceType: "assistanceRequest",
    resourceId: id,
  });
  return { ok: true, notificationId };
}
