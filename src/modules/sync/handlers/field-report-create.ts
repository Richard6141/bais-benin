import { prepareReportPhoto } from "@/modules/reports";
import { farmTarget, findFarm } from "./lookups";
import { idConflict, rejected, type SyncHandler } from "./types";

// Signalement d'un problème sur une parcelle (phase 0, docs/modules/signalements.md) : droit
// `report.create` sur l'exploitation (le producteur pour la sienne, l'agent pour celles qu'il a
// enregistrées). La position retenue pour la détection des foyers (ADR-0015) est le GPS de
// l'appareil s'il a été relevé, sinon le centre de la parcelle, sinon le point de l'exploitation.

// Emprise du Bénin, avec une marge : un point relevé ailleurs est une erreur de l'appareil.
const BENIN_BOUNDS = { minLon: 0.6, maxLon: 4, minLat: 6, maxLat: 12.6 };
// Un point relevé à plus de 30 km de l'exploitation ne la concerne pas : retenu, il déplacerait
// le signalement vers une autre zone et fausserait la détection des foyers (ADR-0015).
const MAX_GPS_DISTANCE_FROM_FARM_M = 30_000;
// Date d'observation : pas dans le futur (au-delà d'un décalage d'horloge), ni plus ancienne
// qu'une file hors ligne raisonnable.
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_AGE_MS = 60 * 24 * 60 * 60 * 1000;
// Par compte et par 24 heures : bien au-delà d'un usage de terrain, en deçà d'un envoi en masse.
const MAX_REPORTS_PER_DAY = 20;

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
    const observedAt = new Date(payload.observedAt);
    const age = context.now.getTime() - observedAt.getTime();
    if (age < -MAX_CLOCK_SKEW_MS || age > MAX_REPORT_AGE_MS) {
      return rejected(
        "INVALID_DATE",
        "Date d'observation dans le futur ou de plus de 60 jours",
        "observedAt",
      );
    }

    const existing = await db.fieldReport.findUnique({
      where: { id: payload.id },
      select: { id: true, farmId: true },
    });
    if (existing) {
      if (existing.farmId !== farm.id) return idConflict();
      return { outcome: "DUPLICATE", entity: { type: "fieldReport", id: existing.id, version: 1 } };
    }

    // Point relevé loin de l'exploitation : le signalement est gardé, placé sur la parcelle ou
    // l'exploitation comme sans GPS.
    let gps = payload.gps;
    if (gps) {
      const [lon, lat] = gps.point;
      const rows = await db.$queryRaw<{ far: boolean }[]>`
        SELECT NOT ST_DWithin(
          "location",
          ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography,
          ${MAX_GPS_DISTANCE_FROM_FARM_M}::float8
        ) AS far
        FROM "farm" WHERE "id" = ${farm.id}::uuid AND "location" IS NOT NULL`;
      if (rows[0]?.far) gps = undefined;
    }
    const recent = await db.fieldReport.count({
      where: {
        reportedById: context.actor.userId,
        createdAt: { gte: new Date(context.now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent >= MAX_REPORTS_PER_DAY) {
      return rejected("RATE_LIMITED", "Trop de signalements envoyés en 24 heures");
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
        gpsAccuracyM: gps?.accuracyM ?? null,
        // Horloge de l'appareil en avance : ramenée à l'heure du serveur.
        observedAt: observedAt > context.now ? context.now : observedAt,
        reportedById: context.actor.userId,
      },
    });
    if (gps) {
      const [lon, lat] = gps.point;
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
