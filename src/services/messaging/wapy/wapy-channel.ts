import { z } from "zod";
import {
  MessagingError,
  type DeliveryReceipt,
  type MessagingChannel,
  type OutboundMessage,
} from "@/services/ports/messaging-channel";

// Adaptateur wapy.pro, « Pont WhatsApp » (docs/recherche/authentification-etape-3.md §8).
// Deux points d'entrée : /pont/v1/otp pour les codes (texte composé par la passerelle) et
// /pont/v1/messages pour les textes libres. L'en-tête Idempotency-Key évite un double envoi
// en cas de relance ; les quotas (2 codes par heure et par destinataire) sont respectés en
// ne renvoyant un code qu'à la demande explicite de l'utilisateur.

const sendResponseSchema = z.object({
  id: z.string().optional(),
  message_id: z.string().optional(),
  statut: z.string(),
  remise: z.string().optional(),
  rejeu: z.boolean().optional(),
});

export interface WapyChannelOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class WapyMessagingChannel implements MessagingChannel {
  readonly id = "wapy" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WapyChannelOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    const path = message.kind === "OTP" ? "/pont/v1/otp" : "/pont/v1/messages";
    const body =
      message.kind === "OTP"
        ? {
            destinataire: message.to,
            code: message.code,
            service: message.service,
            minutes: message.expiresInMinutes,
          }
        : { destinataire: message.to, texte: message.text, consentement: message.consentReference };

    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw await this.toError(response);

    const parsed = sendResponseSchema.parse(await response.json());
    return {
      channel: this.id,
      providerMessageId: parsed.message_id ?? parsed.id ?? null,
      accepted: parsed.statut === "envoye",
      replayed: parsed.rejeu === true,
    };
  }

  private async toError(response: Response): Promise<MessagingError> {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "");
    switch (response.status) {
      case 401:
      case 403:
        return new MessagingError(
          "NOT_CONFIGURED",
          `wapy.pro a refusé la clé ou le compte (${response.status})`,
        );
      case 404:
        return new MessagingError("RECIPIENT_UNKNOWN", "Destinataire introuvable sur WhatsApp");
      case 429:
        return new MessagingError(
          "RATE_LIMITED",
          "Quota wapy.pro atteint",
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      case 502:
      case 503:
        return new MessagingError(
          "PROVIDER_UNAVAILABLE",
          `WhatsApp injoignable (${response.status})`,
        );
      default:
        return new MessagingError("REJECTED", `Envoi refusé par wapy.pro (${response.status})`);
    }
  }
}
