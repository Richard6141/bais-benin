import { prisma } from "@/database/client";
import {
  FIRE_ALERT_WINDOW_MS,
  nearestFiresForFarms,
  type FarmFireExposure,
} from "@/database/sql/fires.sql";
import { logger } from "@/lib/logger";
import { fireMessageSms, fireMessageWhatsApp, fireSeverity } from "../fire-message";
import type { Db } from "./plan";
import {
  processDelivery,
  reminderChannel,
  REMINDER_DELAY_MS,
  type DeliveryAlert,
  type DeliveryChannels,
  type DeliveryConsents,
  type OutboundChannel,
  type Severity,
} from "./policy";

// Envoi des messages en attente (WhatsApp, SMS) et relance unique des messages non lus.
// À appeler par une tâche planifiée (quelques minutes) après l'évaluation des règles. Le nombre
// d'envois par exécution est plafonné pour respecter les quotas wapy.pro (60 par heure et
// 500 par jour sur l'offre actuelle) ; un 429 du fournisseur arrête l'exécution.

export interface DispatchOptions {
  now?: Date;
  messaging: DeliveryChannels;
  /** Envois au plus par exécution (défaut 50). */
  limit?: number;
  db?: Db;
}

export interface DispatchSummary {
  considered: number;
  sent: number;
  deferred: number;
  failed: number;
  skipped: number;
  followUps: number;
  reminders: number;
  quotaReached: boolean;
}

async function consentsOf(db: Db, farmId: string | null): Promise<DeliveryConsents> {
  const none: DeliveryConsents = { WHATSAPP: null, SMS: null };
  if (!farmId) return none;
  const farm = await db.farm.findUnique({
    where: { id: farmId },
    select: {
      farmer: {
        select: {
          channelConsents: {
            where: { granted: true, revokedAt: null },
            select: { id: true, channel: true },
          },
        },
      },
    },
  });
  for (const consent of farm?.farmer.channelConsents ?? []) {
    if (consent.channel === "WHATSAPP" || consent.channel === "SMS")
      none[consent.channel] = consent.id;
  }
  return none;
}

/**
 * Alerte « feu de brousse » (ADR-0022) : texte et gravité propres à chaque exploitation, d'après
 * le feu le plus proche de SA parcelle. Sous 500 m, le message passe les heures calmes ; de 500 m
 * à 1 km, il attend le matin. Sans feu retrouvé (détection sortie de la fenêtre de 24 heures),
 * le texte commun de l'alerte part tel quel.
 */
export function deliveryAlertFor(
  alert: DeliveryAlert & { category: string },
  channel: OutboundChannel,
  exposure: FarmFireExposure | undefined,
  now: Date,
): DeliveryAlert {
  const { category, ...common } = alert;
  if (category !== "FIRE" || !exposure) return common;
  return {
    ...common,
    severity: fireSeverity(exposure.distanceM),
    messageShort: channel === "SMS" ? fireMessageSms(exposure) : fireMessageWhatsApp(exposure, now),
  };
}

/** Crée le canal de repli ou de relance s'il n'existe pas encore pour ce destinataire. */
async function ensureRecipient(
  db: Db,
  base: { alertId: string; farmId: string | null; phoneE164: string | null },
  channel: "SMS" | "RELAY",
  now: Date,
): Promise<boolean> {
  const existing = await db.alertRecipient.findFirst({
    where: { alertId: base.alertId, farmId: base.farmId, userId: null, channel },
    select: { id: true },
  });
  if (existing) return false;
  await db.alertRecipient.create({
    data: {
      ...base,
      userId: null,
      channel,
      status: "PENDING",
      nextAttemptAt: channel === "SMS" ? now : null,
    },
  });
  return true;
}

export async function dispatchPendingDeliveries(
  options: DispatchOptions,
): Promise<DispatchSummary> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const limit = Math.max(1, options.limit ?? 50);
  const summary: DispatchSummary = {
    considered: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    skipped: 0,
    followUps: 0,
    reminders: 0,
    quotaReached: false,
  };

  const pending = await db.alertRecipient.findMany({
    where: {
      channel: { in: ["WHATSAPP", "SMS"] },
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      alertId: true,
      farmId: true,
      phoneE164: true,
      channel: true,
      attempts: true,
      alert: {
        select: {
          id: true,
          severity: true,
          reliability: true,
          status: true,
          messageShort: true,
          category: true,
        },
      },
      farm: { select: { reliability: true, farmer: { select: { reliability: true } } } },
    },
  });
  const fireFarmIds = [
    ...new Set(
      pending.flatMap((row) => (row.alert.category === "FIRE" && row.farmId ? [row.farmId] : [])),
    ),
  ];
  const exposures = await nearestFiresForFarms(
    fireFarmIds,
    new Date(now.getTime() - FIRE_ALERT_WINDOW_MS),
  );

  for (const row of pending) {
    summary.considered += 1;
    const consents = await consentsOf(db, row.farmId);
    const synthetic =
      row.farm?.reliability === "SYNTHETIC" || row.farm?.farmer.reliability === "SYNTHETIC";
    const channel = row.channel as OutboundChannel;
    const outcome = await processDelivery(
      { ...row, channel, recipientReliability: synthetic ? "SYNTHETIC" : null },
      deliveryAlertFor(
        { ...row.alert, severity: row.alert.severity as Severity },
        channel,
        row.farmId ? exposures.get(row.farmId) : undefined,
        now,
      ),
      consents,
      options.messaging,
      now,
    );
    await db.alertRecipient.update({ where: { id: row.id }, data: outcome.update });
    const status = outcome.update.status;
    if (status === "SENT") summary.sent += 1;
    else if (status === "FAILED") summary.failed += 1;
    else if (status === "SKIPPED") summary.skipped += 1;
    else summary.deferred += 1;
    if (outcome.followUp) {
      const created = await ensureRecipient(
        db,
        { alertId: row.alertId, farmId: row.farmId, phoneE164: row.phoneE164 },
        outcome.followUp,
        now,
      );
      if (created) summary.followUps += 1;
    }
    if (outcome.quotaReached) {
      summary.quotaReached = true;
      logger.warn(
        { recipientId: row.id },
        "Quota du fournisseur de messagerie atteint : envoi interrompu",
      );
      break;
    }
  }

  summary.reminders = await scheduleReminders(db, now);
  return summary;
}

/** Relance unique des messages envoyés depuis plus de 24 h et non lus (sévérité ≥ WARNING). */
async function scheduleReminders(db: Db, now: Date): Promise<number> {
  const due = await db.alertRecipient.findMany({
    where: {
      channel: { in: ["WHATSAPP", "SMS"] },
      status: { in: ["SENT", "DELIVERED"] },
      acknowledgedAt: null,
      sentAt: { lte: new Date(now.getTime() - REMINDER_DELAY_MS) },
      alert: { status: "ACTIVE", severity: { in: ["WARNING", "CRITICAL"] } },
    },
    select: {
      alertId: true,
      farmId: true,
      phoneE164: true,
      channel: true,
      status: true,
      sentAt: true,
      alert: { select: { severity: true, status: true } },
    },
    take: 500,
  });
  let created = 0;
  for (const row of due) {
    const next = reminderChannel(
      { channel: row.channel as OutboundChannel, status: row.status, sentAt: row.sentAt },
      { severity: row.alert.severity as Severity, status: row.alert.status },
      await consentsOf(db, row.farmId),
      now,
    );
    if (
      next &&
      (await ensureRecipient(
        db,
        { alertId: row.alertId, farmId: row.farmId, phoneE164: row.phoneE164 },
        next,
        now,
      ))
    ) {
      created += 1;
    }
  }
  return created;
}
