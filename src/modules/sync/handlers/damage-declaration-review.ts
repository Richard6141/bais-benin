import { rejected, type Db, type SyncHandler } from "./types";

// Déclaration de sinistre confirmée ou écartée sur place par l'agent (commande
// `damageDeclaration.review`, ADR-0038 §2). La cible d'autorisation est l'exploitation ; le droit
// vérifié est `damage.review` (l'agent qui a enregistré l'exploitation). Une déclaration déjà
// traitée ne change plus : une seconde commande identique est un doublon, une autre est refusée.

async function declarationTarget(db: Db, id: string) {
  return db.damageDeclaration.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      version: true,
      farm: {
        select: {
          communeId: true,
          registeredById: true,
          farmer: { select: { userId: true } },
          commune: { select: { departementId: true } },
        },
      },
    },
  });
}

export const damageDeclarationReview: SyncHandler<"damageDeclaration.review"> = {
  async target(command, db) {
    const target = await declarationTarget(db, command.payload.id);
    if (!target) return null;
    return {
      action: "damage.review",
      resource: {
        communeId: target.farm.communeId,
        departementId: target.farm.commune.departementId,
        registeredByUserId: target.farm.registeredById ?? undefined,
        ownerUserId: target.farm.farmer.userId ?? undefined,
      },
      byId: true,
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    const target = await declarationTarget(db, payload.id);
    if (!target) return rejected("NOT_FOUND", "Déclaration de sinistre introuvable", "id");
    if (target.status !== "PROPOSED") {
      if (target.status === payload.decision) {
        return {
          outcome: "DUPLICATE",
          entity: { type: "damageDeclaration", id: payload.id, version: target.version },
        };
      }
      return rejected("ALREADY_REVIEWED", "Cette déclaration a déjà été traitée", "decision");
    }
    let cropId: string | null = null;
    if (payload.decision === "CONFIRMED" && payload.cropCode) {
      const crop = await db.crop.findUnique({
        where: { code: payload.cropCode },
        select: { id: true },
      });
      if (!crop) return rejected("NOT_FOUND", "Culture inconnue", "cropCode");
      cropId = crop.id;
    }
    const confirmed = payload.decision === "CONFIRMED";
    await db.damageDeclaration.update({
      where: { id: payload.id },
      data: {
        status: payload.decision,
        observedAreaHa: confirmed ? payload.observedAreaHa : null,
        cropId,
        cropStage: confirmed ? (payload.cropStage ?? null) : null,
        note: payload.note ?? null,
        rejectReason: confirmed ? null : (payload.reason ?? null),
        reviewedById: context.actor.userId,
        reviewedAt: new Date(payload.reviewedAt),
        version: { increment: 1 },
      },
    });
    return {
      outcome: "APPLIED",
      entity: { type: "damageDeclaration", id: payload.id, version: target.version + 1 },
      audit: {
        action: "damage.declaration.reviewed",
        details: {
          decision: payload.decision,
          observedAreaHa: confirmed ? (payload.observedAreaHa ?? null) : null,
          cropCode: confirmed ? (payload.cropCode ?? null) : null,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
