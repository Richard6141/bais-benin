import type {
  DeliveryReceipt,
  MessagingChannel,
  OutboundMessage,
} from "@/services/ports/messaging-channel";

// Canal de test : conserve les messages en mémoire pour que les tests d'intégration
// lisent le code envoyé sans dépendre d'un fournisseur.
export class FixtureMessagingChannel implements MessagingChannel {
  readonly id = "fixture" as const;
  readonly sent: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    this.sent.push(message);
    return {
      channel: this.id,
      providerMessageId: `fixture-${this.sent.length}`,
      accepted: true,
      replayed: false,
    };
  }

  lastOtpFor(phone: string): string | undefined {
    for (let index = this.sent.length - 1; index >= 0; index -= 1) {
      const message = this.sent[index];
      if (message?.kind === "OTP" && message.to === phone) return message.code;
    }
    return undefined;
  }

  reset() {
    this.sent.length = 0;
  }
}
