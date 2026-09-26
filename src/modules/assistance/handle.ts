import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import { assistanceResource } from "./queries";

// Suivi d'une demande par un agent de la commune : prise en charge (reçue → en cours), puis
// résolution avec une réponse que le producteur lira. Une demande peut être résolue directement,
// sans étape « en cours » (question simple réglée au téléphone). Chaque passage est journalisé.

export type HandleResult =
  { ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "NOTE_REQUIRED" };

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
  const updated = await prisma.assistanceRequest.updateMany({
    where: { id, status: "RECEIVED" },
    data: { status: "IN_PROGRESS", handledById: actor.userId, takenAt: now },
  });
  if (updated.count === 0) return { ok: false, code: "INVALID_STATE" };
  await recordAudit({
    action: "assistance.taken",
    actorId: actor.userId,
    resourceType: "assistanceRequest",
    resourceId: id,
  });
  return { ok: true };
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

  const current = await prisma.assistanceRequest.findUniqueOrThrow({
    where: { id },
    select: { status: true, handledById: true, takenAt: true },
  });
  if (current.status === "RESOLVED") return { ok: false, code: "INVALID_STATE" };
  // Condition sur le statut lu : une résolution concurrente ne s'applique qu'une fois.
  const updated = await prisma.assistanceRequest.updateMany({
    where: { id, status: current.status },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
      resolutionNote: trimmed.slice(0, 1000),
      handledById: current.handledById ?? actor.userId,
      takenAt: current.takenAt ?? now,
    },
  });
  if (updated.count === 0) return { ok: false, code: "INVALID_STATE" };
  await recordAudit({
    action: "assistance.resolved",
    actorId: actor.userId,
    resourceType: "assistanceRequest",
    resourceId: id,
  });
  return { ok: true };
}
