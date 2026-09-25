import { writeVerificationPoint } from "./geometry";
import { farmTarget, findFarm } from "./lookups";
import { FIELD_SOURCE_ID, idConflict, rejected, type SyncHandler } from "./types";

// Compte rendu d'une visite de terrain. CONFIRMED et CORRECTED font passer l'exploitation au
// statut FIELD_VERIFIED (avec application des corrections constatées) ; REJECTED la place en
// DISPUTED. Chaque compte rendu incrémente la version de l'exploitation.

export const verificationRecord: SyncHandler<"verification.record"> = {
  async target(command, db) {
    const farm = await findFarm(db, command.payload.farmId);
    return farm ? farmTarget(farm, "farm.verify") : null;
  },

  async apply(command, db, context) {
    const { payload } = command;
    const farm = await findFarm(db, payload.farmId);
    if (!farm) return rejected("NOT_FOUND", "Exploitation inconnue", "farmId");
    if (payload.parcelId) {
      const parcel = await db.parcel.findFirst({
        where: { id: payload.parcelId, farmId: farm.id, archivedAt: null },
        select: { id: true },
      });
      if (!parcel)
        return rejected("NOT_FOUND", "Parcelle inconnue pour cette exploitation", "parcelId");
    }

    const existing = await db.farmVerification.findUnique({
      where: { id: payload.id },
      select: { id: true, farmId: true },
    });
    if (existing) {
      if (existing.farmId !== farm.id) return idConflict();
      return {
        outcome: "DUPLICATE",
        entity: { type: "farm", id: farm.id, code: farm.code, version: farm.version },
      };
    }

    const verification = await db.farmVerification.create({
      data: {
        id: payload.id,
        farmId: farm.id,
        parcelId: payload.parcelId ?? null,
        kind: payload.kind,
        outcome: payload.outcome,
        notes: payload.notes ?? null,
        identityConfirmed: payload.identityConfirmed,
        visitedAt: new Date(payload.visitedAt),
        agentId: context.actor.userId,
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(payload.visitedAt),
        reliability: "FIELD_VERIFIED",
      },
      select: { id: true },
    });
    if (payload.gpsPoint) {
      await writeVerificationPoint(db, verification.id, payload.gpsPoint);
    }

    const confirmed = payload.outcome === "CONFIRMED" || payload.outcome === "CORRECTED";
    const updated = await db.farm.update({
      where: { id: farm.id },
      data: {
        verificationStatus: confirmed ? "FIELD_VERIFIED" : "DISPUTED",
        verifiedAt: confirmed ? new Date(payload.visitedAt) : null,
        verifiedById: confirmed ? context.actor.userId : null,
        reliability: confirmed ? "FIELD_VERIFIED" : "DECLARED",
        ...(payload.outcome === "CORRECTED" && payload.correctedDeclaredAreaHa !== undefined
          ? { declaredAreaHa: payload.correctedDeclaredAreaHa }
          : {}),
        version: { increment: 1 },
      },
      select: { id: true, code: true, version: true, verificationStatus: true },
    });

    return {
      outcome: "APPLIED",
      entity: { type: "farm", id: updated.id, code: updated.code, version: updated.version },
      farmId: farm.id,
      eventKind: "VERIFIED",
      eventPayload: {
        verificationId: verification.id,
        outcome: payload.outcome,
        status: updated.verificationStatus,
        identityConfirmed: payload.identityConfirmed,
        correctedDeclaredAreaHa: payload.correctedDeclaredAreaHa ?? null,
      },
      audit: {
        action: "registry.farm.verified",
        details: {
          farmId: farm.id,
          verificationId: verification.id,
          outcome: payload.outcome,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
