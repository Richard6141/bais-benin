import { logger } from "@/lib/logger";
import { isSyntheticPhone } from "@/lib/phone/synthetic";
import {
  MessagingError,
  type MessagingChannel,
  type OutboundMessage,
} from "@/services/ports/messaging-channel";

// Filet de dernier recours, hors production : les fiches semées portent des numéros inventés
// (+229 01 XX 9X XX XX) qui peuvent appartenir à quelqu'un. Les gardes par fiche écartent déjà
// ces destinataires (alertes : monitoring/delivery/policy.ts ; messages aux producteurs :
// notifications/policy.ts) ; ici, tout message TEXT vers un tel numéro est refusé et tracé, quel
// que soit le chemin qui l'envoie. Jamais pour un code de connexion (OTP) : il part vers le
// numéro que la personne a saisi elle-même, et un vrai numéro de cette plage doit pouvoir se
// connecter.
export function guardSyntheticRecipients(channel: MessagingChannel): MessagingChannel {
  return {
    id: channel.id,
    async send(message: OutboundMessage) {
      if (message.kind === "TEXT" && isSyntheticPhone(message.to)) {
        // Ni le numéro ni le texte dans le journal : la clé d'idempotence suffit à retrouver
        // l'envoi (alerte ou message, destinataire, canal).
        logger.warn(
          { channel: channel.id, idempotencyKey: message.idempotencyKey },
          "Message refusé : numéro inventé d'une fiche de démonstration",
        );
        throw new MessagingError(
          "RECIPIENT_UNKNOWN",
          "Numéro inventé d'une fiche de démonstration : aucun envoi",
        );
      }
      return channel.send(message);
    },
  };
}
