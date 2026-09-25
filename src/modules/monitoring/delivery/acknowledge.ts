import { z } from "zod";
import { prisma } from "@/database/client";
import { recordAudit } from "@/modules/audit";
import { authorize, type Actor } from "@/modules/authorization";
import type { Db } from "./plan";

// Accusé de lecture et relais oral d'une alerte (docs/modules/monitoring-parcours-ux.md §2.A, §2.B).

export class AlertAccessError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "NOT_RECIPIENT",
    message: string,
  ) {
    super(message);
    this.name = "AlertAccessError";
  }
}

export interface AcknowledgeResult {
  alertId: string;
  acknowledged: number;
  acknowledgedAt: Date;
}

/**
 * Lecture d'une alerte par l'un de ses destinataires : toutes ses lignes (application, WhatsApp,
 * SMS, et celles des exploitations dont il est le producteur) passent à READ. Un message encore en
 * attente d'envoi ne partira donc plus : le destinataire a déjà l'information.
 */
export async function acknowledgeAlert(
  actor: Actor,
  alertId: string,
  now = new Date(),
  db: Db = prisma,
): Promise<AcknowledgeResult> {
  const alert = await db.alert.findUnique({
    where: { id: alertId },
    select: { id: true, communeId: true, commune: { select: { departementId: true } } },
  });
  if (!alert) throw new AlertAccessError("NOT_FOUND", "Alerte introuvable");

  const mine = {
    alertId,
    OR: [{ userId: actor.userId }, { farm: { farmer: { userId: actor.userId } } }],
  };
  const rows = await db.alertRecipient.count({ where: mine });
  if (rows === 0)
    throw new AlertAccessError("NOT_RECIPIENT", "Vous n'êtes pas destinataire de cette alerte");

  const decision = authorize(actor, "alert.acknowledge", {
    communeId: alert.communeId,
    departementId: alert.commune.departementId,
    ownerUserId: actor.userId,
  });
  if (!decision.allowed) throw new AlertAccessError("FORBIDDEN", decision.reason);

  const updated = await db.alertRecipient.updateMany({
    where: { ...mine, status: { notIn: ["FAILED", "SKIPPED", "RELAYED"] }, acknowledgedAt: null },
    data: { status: "READ", acknowledgedAt: now },
  });
  await recordAudit({
    action: "alert.acknowledged",
    actorId: actor.userId,
    resourceType: "alert",
    resourceId: alertId,
    details: { rows: updated.count },
  });
  return { alertId, acknowledged: updated.count, acknowledgedAt: now };
}

export const RELAY_MODES = ["CALL", "VISIT", "GROUP_MEETING"] as const;
export type RelayMode = (typeof RELAY_MODES)[number];

export const relayInputSchema = z.object({
  alertId: z.uuid(),
  farmId: z.uuid(),
  mode: z.enum(RELAY_MODES),
  note: z.string().trim().max(500).optional(),
});
export type RelayInput = z.infer<typeof relayInputSchema>;

export interface RelayTarget {
  alertId: string;
  farmId: string;
  communeId: string;
  departementId: string;
}

/** Vérifie que l'exploitation relève bien de la commune de l'alerte ; null sinon. */
export async function resolveRelayTarget(
  db: Db,
  alertId: string,
  farmId: string,
): Promise<RelayTarget | null> {
  const [alert, farm] = await Promise.all([
    db.alert.findUnique({ where: { id: alertId }, select: { communeId: true } }),
    db.farm.findFirst({
      where: { id: farmId, archivedAt: null },
      select: { communeId: true, commune: { select: { departementId: true } } },
    }),
  ]);
  if (!alert || !farm || farm.communeId !== alert.communeId) return null;
  return { alertId, farmId, communeId: farm.communeId, departementId: farm.commune.departementId };
}

/**
 * Écrit le relais sur la ligne RELAY de l'exploitation (créée si besoin). Renvoie l'identifiant
 * de la ligne et `created: false` si le relais était déjà enregistré. La note éventuelle n'est pas
 * stockée sur la ligne : l'appelant (relayAlert ou la commande de synchronisation) la journalise.
 */
export async function recordRelay(
  db: Db,
  actorId: string,
  input: RelayInput,
  now: Date,
): Promise<{ recipientId: string; created: boolean }> {
  const existing = await db.alertRecipient.findFirst({
    where: { alertId: input.alertId, farmId: input.farmId, userId: null, channel: "RELAY" },
    select: { id: true, status: true },
  });
  if (existing?.status === "RELAYED") return { recipientId: existing.id, created: false };
  const data = {
    status: "RELAYED" as const,
    relayedById: actorId,
    relayMode: input.mode,
    acknowledgedAt: now,
  };
  const row = existing
    ? await db.alertRecipient.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.alertRecipient.create({
        data: {
          alertId: input.alertId,
          farmId: input.farmId,
          userId: null,
          channel: "RELAY",
          ...data,
        },
        select: { id: true },
      });
  return { recipientId: row.id, created: true };
}

export async function relayAlert(
  actor: Actor,
  input: RelayInput,
  now = new Date(),
  db: Db = prisma,
) {
  const parsed = relayInputSchema.parse(input);
  const target = await resolveRelayTarget(db, parsed.alertId, parsed.farmId);
  if (!target)
    throw new AlertAccessError(
      "NOT_FOUND",
      "Alerte ou exploitation introuvable dans cette commune",
    );
  const decision = authorize(actor, "alert.relay", {
    communeId: target.communeId,
    departementId: target.departementId,
  });
  if (!decision.allowed) throw new AlertAccessError("FORBIDDEN", decision.reason);

  const result = await recordRelay(db, actor.userId, parsed, now);
  if (result.created) {
    await recordAudit({
      action: "alert.relayed",
      actorId: actor.userId,
      resourceType: "alert",
      resourceId: parsed.alertId,
      details: { farmId: parsed.farmId, mode: parsed.mode, note: parsed.note ?? null },
    });
  }
  return result;
}
