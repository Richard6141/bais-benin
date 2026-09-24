import { logger } from "@/lib/logger";
import type {
  DeliveryReceipt,
  MessagingChannel,
  OutboundMessage,
} from "@/services/ports/messaging-channel";

// Canal de développement : le message est écrit dans le journal du serveur.
// C'est là qu'un développeur lit le code à usage unique quand aucun fournisseur n'est configuré.
export class ConsoleMessagingChannel implements MessagingChannel {
  readonly id = "console" as const;

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    if (message.kind === "OTP") {
      logger.info(
        {
          to: maskPhone(message.to),
          code: message.code,
          expiresInMinutes: message.expiresInMinutes,
        },
        "Code à usage unique (canal console)",
      );
    } else {
      logger.info({ to: maskPhone(message.to), text: message.text }, "Message (canal console)");
    }
    return { channel: this.id, providerMessageId: null, accepted: true, replayed: false };
  }
}

// Le journal ne doit jamais contenir un numéro complet : on garde l'indicatif et la fin.
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 4)}••••${phone.slice(-2)}` : "••••";
}
