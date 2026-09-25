import { farmTarget, findFarmOfParcel } from "./lookups";
import { FIELD_SOURCE_ID, idConflict, rejected, type SyncHandler } from "./types";

// Déclaration d'une culture sur une parcelle pour une campagne et une sous-saison. Le couple
// (parcelle, culture, campagne, sous-saison) est unique : une redéclaration renvoie l'existant.

export const cropSeasonDeclare: SyncHandler<"cropSeason.declare"> = {
  async target(command, db) {
    const farm = await findFarmOfParcel(db, command.payload.parcelId);
    return farm ? farmTarget(farm, "farm.update") : null;
  },

  async apply(command, db, context) {
    const { payload } = command;
    const parcel = await db.parcel.findFirst({
      where: { id: payload.parcelId, archivedAt: null },
      select: { id: true, farmId: true, declaredAreaHa: true },
    });
    if (!parcel) return rejected("NOT_FOUND", "Parcelle inconnue", "parcelId");
    const crop = await db.crop.findFirst({
      where: { code: payload.cropCode, archivedAt: null },
      select: { id: true, nameFr: true },
    });
    if (!crop) return rejected("NOT_FOUND", "Culture inconnue", "cropCode");
    const campaign = await db.agriculturalCampaign.findFirst({
      where: { code: payload.campaignCode, archivedAt: null },
      select: { id: true, status: true },
    });
    if (!campaign) return rejected("NOT_FOUND", "Campagne inconnue", "campaignCode");
    if (campaign.status === "CLOSED") {
      return rejected(
        "CAMPAIGN_CLOSED",
        "La campagne est close : déclaration refusée",
        "campaignCode",
      );
    }

    const byId = await db.parcelCrop.findUnique({
      where: { id: payload.id },
      select: { id: true, parcelId: true },
    });
    if (byId && byId.parcelId !== parcel.id) return idConflict();
    const byKey =
      byId ??
      (await db.parcelCrop.findFirst({
        where: {
          parcelId: parcel.id,
          cropId: crop.id,
          campaignId: campaign.id,
          subSeason: payload.seasonCode,
          archivedAt: null,
        },
        select: { id: true },
      }));
    if (byKey) {
      return { outcome: "DUPLICATE", entity: { type: "parcelCrop", id: byKey.id, version: 1 } };
    }

    const parcelCrop = await db.parcelCrop.create({
      data: {
        id: payload.id,
        parcelId: parcel.id,
        cropId: crop.id,
        campaignId: campaign.id,
        subSeason: payload.seasonCode,
        areaHa: payload.areaHa ?? parcel.declaredAreaHa,
        sowingDate: payload.sowingDate ? new Date(payload.sowingDate) : null,
        stage: payload.sowingDate ? "SOWN" : "PLANNED",
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(command.clientCreatedAt),
        reliability: "DECLARED",
      },
      select: { id: true },
    });

    return {
      outcome: "APPLIED",
      entity: { type: "parcelCrop", id: parcelCrop.id, version: 1 },
      farmId: parcel.farmId,
      eventKind: "CROP_DECLARED",
      eventPayload: {
        parcelCropId: parcelCrop.id,
        parcelId: parcel.id,
        cropCode: payload.cropCode,
        cropName: crop.nameFr,
        campaignCode: payload.campaignCode,
        seasonCode: payload.seasonCode,
      },
      audit: {
        action: "registry.crop.declared",
        details: {
          parcelCropId: parcelCrop.id,
          cropCode: payload.cropCode,
          campaignCode: payload.campaignCode,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
