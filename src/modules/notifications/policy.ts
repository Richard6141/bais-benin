import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  endOfQuietHours,
  isQuietHours,
} from "@/modules/monitoring/delivery/policy";
import { MessagingError, type MessagingChannel } from "@/services/ports/messaging-channel";

// Règles d'envoi d'un message de suivi au producteur, en fonction pure comme pour les alertes
// (monitoring/delivery/policy.ts) : l'orchestrateur lit la base, appelle `processNotification` et
// applique la mise à jour. Mêmes garde-fous que les alertes : consentement vérifié au moment de
// l'envoi, silence de 21 h à 6 h, trois essais au plus, arrêt au quota du fournisseur.

export interface PendingNotification {
  id: string;
  attempts: number;
  text: string;
  recipient: {
    reliability: string;
    /** Numéro du compte (vérifié par code WhatsApp), sinon celui de la fiche producteur. */
    phoneE164: string | null;
    whatsappConsentId: string | null;
  };
}

export interface NotificationUpdate {
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  nextAttemptAt: Date | null;
  sentAt?: Date;
  providerMessageId?: string | null;
  failureReason?: string | null;
}

export interface NotificationOutcome {
  update: NotificationUpdate;
  quotaReached: boolean;
}

export function notificationIdempotencyKey(id: string): string {
  return `farmer-notification-${id}`;
}

function skipped(notification: PendingNotification, reason: string): NotificationOutcome {
  return {
    update: {
      status: "SKIPPED",
      attempts: notification.attempts,
      nextAttemptAt: null,
      failureReason: reason,
    },
    quotaReached: false,
  };
}

export async function processNotification(
  notification: PendingNotification,
  channel: MessagingChannel,
  now: Date,
): Promise<NotificationOutcome> {
  const { recipient } = notification;
  // Fiches de démonstration : numéros inventés, rien ne part hors de l'application.
  if (recipient.reliability === "SYNTHETIC") {
    return skipped(notification, "Producteur de démonstration : aucun envoi hors application");
  }
  if (!recipient.whatsappConsentId) {
    return skipped(notification, "Consentement WhatsApp absent ou retiré");
  }
  if (!recipient.phoneE164) return skipped(notification, "Aucun numéro de téléphone");
  if (isQuietHours(now)) {
    return {
      update: {
        status: "PENDING",
        attempts: notification.attempts,
        nextAttemptAt: endOfQuietHours(now),
      },
      quotaReached: false,
    };
  }

  const attempts = notification.attempts + 1;
  try {
    const receipt = await channel.send({
      kind: "TEXT",
      to: recipient.phoneE164,
      text: notification.text,
      consentReference: recipient.whatsappConsentId,
      idempotencyKey: notificationIdempotencyKey(notification.id),
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
      quotaReached: false,
    };
  } catch (error) {
    const code = error instanceof MessagingError ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (code === "RATE_LIMITED") {
      const retryMs = ((error as MessagingError).retryAfterSeconds ?? 60) * 1000;
      return {
        update: {
          status: "PENDING",
          attempts: notification.attempts,
          nextAttemptAt: new Date(now.getTime() + retryMs),
          failureReason: message,
        },
        quotaReached: true,
      };
    }
    if (code === "RECIPIENT_UNKNOWN" || code === "REJECTED" || attempts >= MAX_ATTEMPTS) {
      return {
        update: { status: "FAILED", attempts, nextAttemptAt: null, failureReason: message },
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
      quotaReached: false,
    };
  }
}
