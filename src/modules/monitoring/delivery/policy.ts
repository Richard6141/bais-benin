import { MessagingError, type MessagingChannel } from "@/services/ports/messaging-channel";

// Règles de diffusion d'une alerte (docs/modules/monitoring-parcours-ux.md §2.D), sous forme de
// fonctions pures : l'orchestrateur (dispatch.ts) lit la base, appelle `processDelivery` pour
// chaque destinataire et applique la mise à jour qu'elle renvoie. Tout se teste sans base.

export type OutboundChannel = "WHATSAPP" | "SMS";
export type Severity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";

export interface PendingDelivery {
  id: string;
  alertId: string;
  farmId: string | null;
  phoneE164: string | null;
  channel: OutboundChannel;
  attempts: number;
}

export interface DeliveryAlert {
  id: string;
  severity: Severity;
  reliability: string;
  status: string;
  messageShort: string;
}

export interface DeliveryConsents {
  /** Identifiants des consentements accordés et non révoqués, ou null. */
  WHATSAPP: string | null;
  SMS: string | null;
}

export interface DeliveryChannels {
  WHATSAPP: MessagingChannel | null;
  SMS: MessagingChannel | null;
}

export interface DeliveryUpdate {
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  nextAttemptAt: Date | null;
  sentAt?: Date;
  providerMessageId?: string | null;
  failureReason?: string | null;
}

export interface DeliveryOutcome {
  update: DeliveryUpdate;
  /** Canal de repli à créer pour ce destinataire (SMS après un numéro WhatsApp inconnu, relais). */
  followUp: "SMS" | "RELAY" | null;
  /** Le fournisseur a signalé un quota atteint : l'exécution s'arrête là. */
  quotaReached: boolean;
}

export const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 5 * 60 * 1000;
/** Porto-Novo est à UTC+1 toute l'année (pas d'heure d'été). */
const PORTO_NOVO_OFFSET_HOURS = 1;
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 6;
export const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

function localHour(now: Date): number {
  return (now.getUTCHours() + PORTO_NOVO_OFFSET_HOURS + 24) % 24;
}

/** Vrai entre 21 h et 6 h, heure de Porto-Novo. */
export function isQuietHours(now: Date): boolean {
  const hour = localHour(now);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Prochain 6 h 00 heure de Porto-Novo (5 h 00 UTC) strictement après `now`. */
export function endOfQuietHours(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(QUIET_END_HOUR - PORTO_NOVO_OFFSET_HOURS, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Repli exponentiel : 5 min après le premier échec, 10 min après le deuxième. */
export function backoffDelayMs(attempts: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
}

export function isSyntheticAlert(alert: Pick<DeliveryAlert, "reliability">): boolean {
  return alert.reliability === "SYNTHETIC";
}

/** Canal de repli d'un destinataire WhatsApp : SMS s'il y consent, sinon relais par l'agent. */
export function fallbackChannel(consents: DeliveryConsents): "SMS" | "RELAY" {
  return consents.SMS ? "SMS" : "RELAY";
}

export function idempotencyKey(alertId: string, recipientId: string, channel: OutboundChannel) {
  return `alert-${alertId}-${recipientId}-${channel.toLowerCase()}`;
}

function skipped(
  delivery: PendingDelivery,
  reason: string,
  followUp: DeliveryOutcome["followUp"],
): DeliveryOutcome {
  return {
    update: {
      status: "SKIPPED",
      attempts: delivery.attempts,
      nextAttemptAt: null,
      failureReason: reason,
    },
    followUp,
    quotaReached: false,
  };
}

export async function processDelivery(
  delivery: PendingDelivery,
  alert: DeliveryAlert,
  consents: DeliveryConsents,
  channels: DeliveryChannels,
  now: Date,
): Promise<DeliveryOutcome> {
  if (alert.status !== "ACTIVE") return skipped(delivery, "Alerte levée avant l'envoi", null);
  // Données de démonstration : l'alerte reste visible dans l'application, rien ne part dehors.
  if (isSyntheticAlert(alert)) {
    return skipped(
      delivery,
      "Alerte calculée sur des données de démonstration : aucun envoi hors application",
      null,
    );
  }
  const consentId = consents[delivery.channel];
  if (!consentId)
    return skipped(
      delivery,
      "Consentement absent ou révoqué pour ce canal",
      delivery.channel === "WHATSAPP" ? fallbackChannel(consents) : "RELAY",
    );
  if (!delivery.phoneE164) return skipped(delivery, "Aucun numéro de téléphone", "RELAY");
  const channel = channels[delivery.channel];
  if (!channel) {
    return skipped(
      delivery,
      `Canal ${delivery.channel} non configuré`,
      delivery.channel === "WHATSAPP" ? fallbackChannel(consents) : "RELAY",
    );
  }
  if (alert.severity !== "CRITICAL" && isQuietHours(now)) {
    return {
      update: {
        status: "PENDING",
        attempts: delivery.attempts,
        nextAttemptAt: endOfQuietHours(now),
      },
      followUp: null,
      quotaReached: false,
    };
  }

  const attempts = delivery.attempts + 1;
  try {
    const receipt = await channel.send({
      kind: "TEXT",
      to: delivery.phoneE164,
      text: alert.messageShort,
      consentReference: consentId,
      idempotencyKey: idempotencyKey(alert.id, delivery.id, delivery.channel),
    });
    return {
      update: {
        status: "SENT",
        attempts,
        nextAttemptAt: null,
        sentAt: now,
        providerMessageId: receipt.providerMessageId,
        failureReason: null,
      },
      followUp: null,
      quotaReached: false,
    };
  } catch (error) {
    const code = error instanceof MessagingError ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (code === "RATE_LIMITED") {
      // Le quota n'est pas une tentative ratée : on reprogramme sans décompter.
      const retryMs = ((error as MessagingError).retryAfterSeconds ?? 60) * 1000;
      return {
        update: {
          status: "PENDING",
          attempts: delivery.attempts,
          nextAttemptAt: new Date(now.getTime() + retryMs),
          failureReason: message,
        },
        followUp: null,
        quotaReached: true,
      };
    }
    if (code === "RECIPIENT_UNKNOWN") {
      return {
        update: { status: "FAILED", attempts, nextAttemptAt: null, failureReason: message },
        followUp: delivery.channel === "WHATSAPP" ? fallbackChannel(consents) : "RELAY",
        quotaReached: false,
      };
    }
    if (attempts >= MAX_ATTEMPTS) {
      return {
        update: { status: "FAILED", attempts, nextAttemptAt: null, failureReason: message },
        followUp: "RELAY",
        quotaReached: false,
      };
    }
    return {
      update: {
        status: "PENDING",
        attempts,
        nextAttemptAt: new Date(now.getTime() + backoffDelayMs(attempts)),
        failureReason: message,
      },
      followUp: null,
      quotaReached: false,
    };
  }
}

export interface SentDelivery {
  channel: OutboundChannel;
  status: string;
  sentAt: Date | null;
}

/**
 * Relance unique d'un message non lu : 24 h après l'envoi, pour une alerte active de sévérité
 * au moins WARNING, par le canal suivant (WhatsApp → SMS si consentement, sinon relais ; SMS →
 * relais). L'unicité vient de la contrainte (alerte, exploitation, canal) : un canal de relance
 * déjà présent n'est jamais recréé.
 */
export function reminderChannel(
  delivery: SentDelivery,
  alert: Pick<DeliveryAlert, "severity" | "status">,
  consents: DeliveryConsents,
  now: Date,
): "SMS" | "RELAY" | null {
  if (alert.status !== "ACTIVE") return null;
  if (alert.severity !== "WARNING" && alert.severity !== "CRITICAL") return null;
  if (delivery.status !== "SENT" && delivery.status !== "DELIVERED") return null;
  if (!delivery.sentAt || now.getTime() - delivery.sentAt.getTime() < REMINDER_DELAY_MS)
    return null;
  return delivery.channel === "WHATSAPP" ? fallbackChannel(consents) : "RELAY";
}
