import { findCommuneByCode, findFarm } from "./lookups";
import { idConflict, rejected, type CommandTarget, type SyncHandler } from "./types";

// Demande d'assistance « Solliciter l'État » (phase 0, docs/modules/signalements.md) : le
// producteur la dépose pour son exploitation, ou pour lui-même et sa commune s'il n'a pas encore
// d'exploitation enregistrée. Elle est routée vers les agents de cette commune.

export const assistanceRequest: SyncHandler<"assistance.request"> = {
  async target(command, db, actor) {
    const { farmId, communeCode } = command.payload;
    if (farmId) {
      const farm = await findFarm(db, farmId);
      if (!farm) return null;
      return {
        action: "assistance.request",
        resource: {
          communeId: farm.communeId,
          departementId: farm.departementId,
          ownerUserId: farm.ownerUserId,
        },
        byId: true,
      } satisfies CommandTarget;
    }
    const commune = await findCommuneByCode(db, communeCode ?? "");
    if (!commune) return null;
    // Sans exploitation, la demande porte sur le compte même de l'acteur.
    return {
      action: "assistance.request",
      resource: {
        communeId: commune.id,
        departementId: commune.departementId,
        ownerUserId: actor.userId,
      },
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    let communeId: string;
    if (payload.farmId) {
      const farm = await findFarm(db, payload.farmId);
      if (!farm) return rejected("NOT_FOUND", "Exploitation inconnue", "farmId");
      communeId = farm.communeId;
    } else {
      const commune = await findCommuneByCode(db, payload.communeCode ?? "");
      if (!commune) return rejected("NOT_FOUND", "Commune inconnue", "communeCode");
      communeId = commune.id;
    }

    const existing = await db.assistanceRequest.findUnique({
      where: { id: payload.id },
      select: { id: true, requesterId: true },
    });
    if (existing) {
      if (existing.requesterId !== context.actor.userId) return idConflict();
      return {
        outcome: "DUPLICATE",
        entity: { type: "assistanceRequest", id: existing.id, version: 1 },
      };
    }

    await db.assistanceRequest.create({
      data: {
        id: payload.id,
        requesterId: context.actor.userId,
        farmId: payload.farmId ?? null,
        communeId,
        category: payload.category,
        description: payload.description,
        // Heure de réception par le serveur : les délais de prise en charge se comptent depuis
        // l'arrivée de la demande, jamais depuis une date fournie par l'appareil.
        createdAt: context.now,
      },
    });

    return {
      outcome: "APPLIED",
      entity: { type: "assistanceRequest", id: payload.id, version: 1 },
      farmId: payload.farmId,
      eventKind: payload.farmId ? "ASSISTANCE_REQUESTED" : undefined,
      eventPayload: { requestId: payload.id, category: payload.category },
      audit: {
        action: "assistance.requested",
        details: {
          requestId: payload.id,
          category: payload.category,
          farmId: payload.farmId ?? null,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
