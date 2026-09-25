import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";

export type ResolveResult =
  { ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "NOT_ACTIVE" | "REASON_REQUIRED" };

// Levée manuelle d'une alerte par le ministère (monitoring §2.C2) : un motif est obligatoire,
// l'alerte reste consultable et l'action est journalisée.
export async function resolveAlert(
  actor: Actor,
  alertId: string,
  reason: string,
): Promise<ResolveResult> {
  const trimmed = reason.trim();
  if (trimmed.length < 5) return { ok: false, code: "REASON_REQUIRED" };
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { id: true, status: true, communeId: true },
  });
  if (!alert) return { ok: false, code: "NOT_FOUND" };
  if (!authorize(actor, "alert.resolve", { communeId: alert.communeId }).allowed) {
    return { ok: false, code: "FORBIDDEN" };
  }
  if (alert.status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE" };
  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: "RESOLVED",
      resolvedReason: trimmed.slice(0, 500),
      resolvedById: actor.userId,
      endsAt: new Date(),
    },
  });
  await recordAudit({
    action: "alert.resolved",
    actorId: actor.userId,
    resourceType: "alert",
    resourceId: alertId,
    details: { reason: trimmed.slice(0, 500) },
  });
  return { ok: true };
}
