import { prepareReportPhoto } from "@/modules/reports";
import { farmTarget, findFarm } from "./lookups";
import { idConflict, rejected, type SyncHandler } from "./types";

// Signalement d'un problème sur une parcelle (phase 0, docs/modules/signalements.md) : droit
// `report.create` sur l'exploitation (le producteur pour la sienne, l'agent pour celles qu'il a
// enregistrées). La position retenue pour la détection des foyers (ADR-0015) est le GPS de
// l'appareil s'il a été relevé, sinon le centre de la parcelle, sinon le point de l'exploitation.

// Emprise du Bénin, avec une marge : un point relevé ailleurs est une erreur de l'appareil.
const BENIN_BOUNDS = { minLon: 0.6, maxLon: 4, minLat: 6, maxLat: 12.6 };

function insideBenin([lon, lat]: [number, number]): boolean {
  return (
    lon >= BENIN_BOUNDS.minLon &&
    lon <= BENIN_BOUNDS.maxLon &&
    lat >= BENIN_BOUNDS.minLat &&
    lat <= BENIN_BOUNDS.maxLat
  );
}

export const fieldReportCreate: SyncHandler<"fieldReport.create"> = {
  async target(command, db) {
    const farm = await findFarm(db, command.payload.farmId);
    return farm ? farmTarget(farm, "report.create") : null;
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
      if (!parcel) return rejected("NOT_FOUND", "Parcelle inconnue pour cette exploitation");
    }
    if (payload.gps && !insideBenin(payload.gps.point)) {
      return rejected("INVALID_POSITION", "La position relevée est hors du Bénin", "gps");
    }

    const existing = await db.fieldReport.findUnique({
      where: { id: payload.id },
      select: { id: true, farmId: true },
    });
    if (existing) {
      if (existing.farmId !== farm.id) return idConflict();
      return { outcome: "DUPLICATE", entity: { type: "fieldReport", id: existing.id, version: 1 } };
    }

    const photo = payload.photo ? await prepareReportPhoto(payload.photo.dataBase64) : null;
    if (payload.photo && !photo) {
      return rejected("INVALID_PHOTO", "Photo illisible ou trop lourde", "photo");
    }

    await db.fieldReport.create({
      data: {
        id: payload.id,
        farmId: farm.id,
        parcelId: payload.parcelId ?? null,
        communeId: farm.communeId,
        type: payload.type,
        cropCode: payload.cropCode ?? null,
        description: payload.description,
        locationSource: "NONE",
        gpsAccuracyM: payload.gps?.accuracyM ?? null,
        observedAt: new Date(payload.observedAt),
        reportedById: context.actor.userId,
      },
    });
    if (payload.gps) {
      const [lon, lat] = payload.gps.point;
      await db.$executeRaw`
        UPDATE "field_report"
        SET "location" = ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography,
            "location_source" = 'GPS'
        WHERE "id" = ${payload.id}::uuid`;
    } else {
      await db.$executeRaw`
        UPDATE "field_report" fr
        SET "location" = src.loc, "location_source" = src.origin
        FROM (
          SELECT COALESCE(p."centroid", f."location") AS loc,
                 CASE WHEN p."centroid" IS NOT NULL THEN 'PARCEL'
                      WHEN f."location" IS NOT NULL THEN 'FARM'
                      ELSE 'NONE' END AS origin
          FROM "farm" f
          LEFT JOIN "parcel" p ON p."id" = ${payload.parcelId ?? null}::uuid
          WHERE f."id" = ${farm.id}::uuid
        ) src
        WHERE fr."id" = ${payload.id}::uuid`;
    }
    if (photo) {
      await db.fieldReportPhoto.create({
        data: {
          reportId: payload.id,
          contentType: photo.contentType,
          width: photo.width,
          height: photo.height,
          bytes: photo.bytes,
        },
      });
    }

    return {
      outcome: "APPLIED",
      entity: { type: "fieldReport", id: payload.id, version: 1 },
      farmId: farm.id,
      eventKind: "REPORT_SUBMITTED",
      eventPayload: {
        reportId: payload.id,
        type: payload.type,
        parcelId: payload.parcelId ?? null,
        hasPhoto: photo !== null,
      },
      audit: {
        action: "report.created",
        details: {
          reportId: payload.id,
          farmId: farm.id,
          type: payload.type,
          hasPhoto: photo !== null,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
