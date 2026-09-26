import { MAX_POINT_DISTANCE_M } from "@/modules/area-survey/frame";
import { FIELD_SOURCE_ID, rejected, type Db, type SyncHandler } from "./types";

// Constat d'un point d'enquête aréolaire saisi hors ligne par l'agent (commande
// `surveyPoint.observe`, ADR-0033). La cible d'autorisation est la commune du point ; le droit
// vérifié est `survey.observe` (agent sur son territoire). La distance au point est recalculée
// ici, jamais crue du client : au-delà de 50 m, le constat est refusé (sauf point inaccessible).

async function pointTarget(db: Db, pointId: string) {
  const rows = await db.$queryRaw<
    { commune_id: string; departement_id: string; campaign_open: boolean }[]
  >`
    SELECT c."id" AS commune_id, c."departement_id",
           ac."status" = 'OPEN' AS campaign_open
      FROM "area_frame_point" p
      JOIN "commune" c ON c."id" = p."commune_id"
      JOIN "agricultural_campaign" ac ON ac."id" = p."campaign_id"
     WHERE p."id" = ${pointId}::uuid`;
  return rows[0] ?? null;
}

async function distanceToPoint(db: Db, pointId: string, lng: number, lat: number) {
  const rows = await db.$queryRaw<{ distance: number }[]>`
    SELECT ST_Distance(p."geom", ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)
             AS distance
      FROM "area_frame_point" p
     WHERE p."id" = ${pointId}::uuid`;
  return rows[0] ? Number(rows[0].distance) : null;
}

export const surveyPointObserve: SyncHandler<"surveyPoint.observe"> = {
  async target(command, db) {
    const target = await pointTarget(db, command.payload.pointId);
    if (!target) return null;
    return {
      action: "survey.observe",
      resource: { communeId: target.commune_id, departementId: target.departement_id },
      byId: true,
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    // Tout est vérifié avant d'écrire : un refus ne défait pas la transaction.
    const target = await pointTarget(db, payload.pointId);
    if (!target) return rejected("NOT_FOUND", "Point d'enquête introuvable", "pointId");
    if (!target.campaign_open) {
      return rejected("CAMPAIGN_CLOSED", "La campagne de ce point est close", "pointId");
    }
    const existing = await db.areaFrameObservation.findUnique({
      where: { id: payload.id },
      select: { pointId: true },
    });
    if (existing) {
      if (existing.pointId !== payload.pointId) {
        return rejected(
          "ID_CONFLICT",
          "Cet identifiant est déjà utilisé par une autre saisie",
          "id",
        );
      }
      return {
        outcome: "DUPLICATE",
        entity: { type: "areaFrameObservation", id: payload.id, version: 1 },
      };
    }
    let distanceM: number | null = null;
    if (payload.gpsPoint) {
      const distance = await distanceToPoint(
        db,
        payload.pointId,
        payload.gpsPoint[0],
        payload.gpsPoint[1],
      );
      distanceM = distance === null ? null : Math.round(distance);
    }
    if (
      payload.landCover !== "INACCESSIBLE" &&
      (distanceM === null || distanceM > MAX_POINT_DISTANCE_M)
    ) {
      return rejected(
        "TOO_FAR",
        `Point à ${distanceM ?? "?"} m : approchez-vous à ${MAX_POINT_DISTANCE_M} m au plus`,
        "gpsPoint",
      );
    }
    let cropId: string | null = null;
    if (payload.landCover === "CROP") {
      const crop = await db.crop.findUnique({
        where: { code: payload.cropCode! },
        select: { id: true },
      });
      if (!crop) return rejected("NOT_FOUND", "Culture inconnue", "cropCode");
      cropId = crop.id;
    }

    await db.areaFrameObservation.create({
      data: {
        id: payload.id,
        pointId: payload.pointId,
        landCover: payload.landCover,
        cropId,
        reason: payload.landCover === "INACCESSIBLE" ? (payload.reason ?? null) : null,
        observedAt: new Date(payload.observedAt),
        distanceM,
        observedById: context.actor.userId,
        sourceId: FIELD_SOURCE_ID,
        reliability: "FIELD_VERIFIED",
      },
    });
    return {
      outcome: "APPLIED",
      entity: { type: "areaFrameObservation", id: payload.id, version: 1 },
      audit: {
        action: "survey.point.observed",
        details: {
          pointId: payload.pointId,
          landCover: payload.landCover,
          cropCode: payload.cropCode ?? null,
          distanceM,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
