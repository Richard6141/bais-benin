import { prisma } from "@/database/client";
import type { FarmerNotificationKind, Prisma, PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { MessagingChannel } from "@/services/ports/messaging-channel";
import { processNotification } from "./policy";

// File des messages de suivi du producteur. Le message est écrit dans la transaction qui change
// le statut de la demande ou du signalement (jamais de message pour un changement annulé), puis
// envoyé juste après l'action et, en reprise, par la tâche planifiée d'envoi (toutes les
// 10 minutes). Chaque ligne est réservée avant l'envoi : deux exécutions simultanées ne
// l'envoient jamais deux fois ; la clé d'idempotence couvre en plus un arrêt en plein envoi.

type Db = Prisma.TransactionClient | PrismaClient;

const CLAIM_MS = 2 * 60 * 1000;

export interface QueuedNotification {
  kind: FarmerNotificationKind;
  subjectId: string;
  /** Compte du producteur concerné ; sans fiche producteur reliée, rien n'est mis en file. */
  farmerUserId?: string | null;
  farmerId?: string | null;
  text: string;
}

/** Met un message en file ; renvoie son identifiant, ou null s'il n'y a personne à prévenir. */
export async function queueFarmerNotification(
  db: Db,
  input: QueuedNotification,
  now = new Date(),
): Promise<string | null> {
  const farmerId =
    input.farmerId ??
    (input.farmerUserId
      ? (
          await db.farmer.findUnique({
            where: { userId: input.farmerUserId },
            select: { id: true },
          })
        )?.id
      : undefined);
  if (!farmerId) return null;
  const existing = await db.farmerNotification.findUnique({
    where: { kind_subjectId: { kind: input.kind, subjectId: input.subjectId } },
    select: { id: true },
  });
  if (existing) return null;
  const created = await db.farmerNotification.create({
    data: {
      farmerId,
      kind: input.kind,
      subjectId: input.subjectId,
      text: input.text,
      nextAttemptAt: now,
    },
    select: { id: true },
  });
  return created.id;
}

export interface SendOptions {
  messaging: MessagingChannel;
  now?: Date;
  /** Envois au plus par exécution (défaut 20 : les alertes passent d'abord sur le quota). */
  limit?: number;
  /** Seulement ces messages (envoi juste après l'action). */
  ids?: readonly string[];
}

export interface SendSummary {
  considered: number;
  sent: number;
  deferred: number;
  failed: number;
  skipped: number;
  quotaReached: boolean;
}

export async function sendFarmerNotifications(options: SendOptions): Promise<SendSummary> {
  const now = options.now ?? new Date();
  const summary: SendSummary = {
    considered: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    skipped: 0,
    quotaReached: false,
  };
  if (options.ids && options.ids.length === 0) return summary;
  const due = await prisma.farmerNotification.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      ...(options.ids ? { id: { in: [...options.ids] } } : {}),
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, options.limit ?? 20),
    select: {
      id: true,
      attempts: true,
      text: true,
      farmer: {
        select: {
          reliability: true,
          phoneE164: true,
          user: { select: { phoneNumber: true } },
          channelConsents: {
            where: { channel: "WHATSAPP", granted: true, revokedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  for (const row of due) {
    const claimed = await prisma.farmerNotification.updateMany({
      where: { id: row.id, status: "PENDING", attempts: row.attempts, nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(now.getTime() + CLAIM_MS) },
    });
    if (claimed.count === 0) continue;
    summary.considered += 1;
    const outcome = await processNotification(
      {
        id: row.id,
        attempts: row.attempts,
        text: row.text,
        recipient: {
          reliability: row.farmer.reliability,
          phoneE164: row.farmer.user?.phoneNumber ?? row.farmer.phoneE164,
          whatsappConsentId: row.farmer.channelConsents[0]?.id ?? null,
        },
      },
      options.messaging,
      now,
    );
    await prisma.farmerNotification.update({ where: { id: row.id }, data: outcome.update });
    const status = outcome.update.status;
    if (status === "SENT") summary.sent += 1;
    else if (status === "FAILED") summary.failed += 1;
    else if (status === "SKIPPED") summary.skipped += 1;
    else summary.deferred += 1;
    if (outcome.quotaReached) {
      summary.quotaReached = true;
      logger.warn(
        { notificationId: row.id },
        "Quota du fournisseur de messagerie atteint : envoi des messages de suivi interrompu",
      );
      break;
    }
  }
  return summary;
}

/**
 * Envoi juste après une action, sans jamais faire échouer l'action elle-même : un canal mal
 * configuré ou un fournisseur indisponible laisse le message en file pour la tâche planifiée.
 */
export async function sendFarmerNotificationsQuietly(
  getChannel: () => MessagingChannel,
  ids: readonly (string | null)[],
): Promise<void> {
  const pending = ids.filter((id): id is string => Boolean(id));
  if (pending.length === 0) return;
  try {
    await sendFarmerNotifications({ messaging: getChannel(), ids: pending });
  } catch (error) {
    logger.warn(
      { err: error },
      "Envoi immédiat du message de suivi : reporté à la tâche planifiée",
    );
  }
}
