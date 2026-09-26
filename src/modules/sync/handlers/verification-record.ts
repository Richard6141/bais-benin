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

    // Cultures constatées : vérifiées avant toute écriture, car un rejet ne défait pas la
    // transaction. Une visite rejetée n'en donne pas : l'exploitation n'a pas été reconnue.
    const wanted = payload.outcome !== "REJECTED" ? (payload.observedCrops ?? []) : [];
    let observations: { parcelId: string; cropId: string }[] = [];
    let campaign: { id: string } | null = null;
    if (wanted.length > 0) {
      const [openCampaign, parcels, crops] = await Promise.all([
        db.agriculturalCampaign.findFirst({ where: { status: "OPEN" }, select: { id: true } }),
        db.parcel.findMany({
          where: {
            id: { in: wanted.map((entry) => entry.parcelId) },
            farmId: farm.id,
            archivedAt: null,
          },
          select: { id: true },
        }),
        db.crop.findMany({
          where: { code: { in: wanted.map((entry) => entry.cropCode) } },
          select: { id: true, code: true },
        }),
      ]);
      const parcelIds = new Set(parcels.map((parcel) => parcel.id));
      const cropIds = new Map(crops.map((crop) => [crop.code, crop.id]));
      if (wanted.some((entry) => !parcelIds.has(entry.parcelId) || !cropIds.has(entry.cropCode))) {
        return rejected("NOT_FOUND", "Parcelle ou culture inconnue", "observedCrops");
      }
      campaign = openCampaign;
      observations = wanted.map((entry) => ({
        parcelId: entry.parcelId,
        cropId: cropIds.get(entry.cropCode)!,
      }));
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

    // Cultures constatées, parcelle par parcelle, pour la campagne ouverte (vérifiées plus haut).
    let observedCrops = 0;
    if (observations.length > 0 && campaign) {
      const created = await db.parcelCropObservation.createMany({
        data: observations.map((entry) => ({
          parcelId: entry.parcelId,
          campaignId: campaign.id,
          cropId: entry.cropId,
          verificationId: verification.id,
          observedAt: new Date(payload.visitedAt),
          sourceId: FIELD_SOURCE_ID,
          reliability: "FIELD_VERIFIED" as const,
        })),
        skipDuplicates: true,
      });
      observedCrops = created.count;
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
        observedCrops,
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
