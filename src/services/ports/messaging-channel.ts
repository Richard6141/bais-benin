// Port de messagerie sortante (docs/09 §1). Les adaptateurs : wapy.pro (WhatsApp),
// console (développement), fixture (tests). Le module notifications choisit le canal.

export type MessagingChannelId = "wapy" | "sms" | "email" | "console" | "fixture";

export type OutboundMessage =
  | {
      kind: "OTP";
      to: string; // E.164
      code: string;
      // Nom du service tel qu'il apparaît dans le message ("BAIS").
      service: string;
      expiresInMinutes: number;
      // Identifiant stable de l'événement : sert de clé d'idempotence chez le fournisseur.
      idempotencyKey: string;
    }
  | {
      kind: "TEXT";
      to: string;
      text: string;
      consentReference?: string;
      idempotencyKey: string;
    };

export interface DeliveryReceipt {
  channel: MessagingChannelId;
  providerMessageId: string | null;
  accepted: boolean;
  // true quand le fournisseur a reconnu un rejeu de la même clé d'idempotence.
  replayed: boolean;
}

export type MessagingErrorCode =
  "NOT_CONFIGURED" | "RECIPIENT_UNKNOWN" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "REJECTED";

export class MessagingError extends Error {
  constructor(
    readonly code: MessagingErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MessagingError";
  }
}

export interface MessagingChannel {
  readonly id: MessagingChannelId;
  send(message: OutboundMessage): Promise<DeliveryReceipt>;
}
