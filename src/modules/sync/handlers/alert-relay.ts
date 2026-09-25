import { recordRelay, resolveRelayTarget } from "@/modules/monitoring/delivery";
import { rejected, type SyncHandler } from "./types";

// Relais oral d'une alerte saisi hors ligne par l'agent (commande `alert.relay`). La cible
// d'autorisation est la commune de l'exploitation, qui doit être celle de l'alerte ; le droit
// vérifié est `alert.relay` (agent sur son périmètre, ministère).

export const alertRelay: SyncHandler<"alert.relay"> = {
  async target(command, db) {
    const target = await resolveRelayTarget(db, command.payload.alertId, command.payload.farmId);
    if (!target) return null;
    return {
      action: "alert.relay",
      resource: { communeId: target.communeId, departementId: target.departementId },
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    const target = await resolveRelayTarget(db, payload.alertId, payload.farmId);
    if (!target)
      return rejected("NOT_FOUND", "Alerte ou exploitation introuvable dans cette commune");

    const result = await recordRelay(
      db,
      context.actor.userId,
      { alertId: payload.alertId, farmId: payload.farmId, mode: payload.mode, note: payload.note },
      new Date(payload.relayedAt),
    );
    const entity = { type: "alertRecipient", id: result.recipientId, version: 1 };
    if (!result.created) return { outcome: "DUPLICATE", entity };

    return {
      outcome: "APPLIED",
      entity,
      farmId: payload.farmId,
      eventKind: "ALERT_RELAYED",
      eventPayload: { alertId: payload.alertId, mode: payload.mode, note: payload.note ?? null },
      audit: {
        action: "alert.relayed",
        details: {
          alertId: payload.alertId,
          farmId: payload.farmId,
          mode: payload.mode,
          note: payload.note ?? null,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
