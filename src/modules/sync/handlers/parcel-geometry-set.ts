import { measurePolygon, writeParcelGeometry } from "./geometry";
import { farmTarget, findFarmOfParcel } from "./lookups";
import { rejected, type SyncHandler } from "./types";

// Remplacement du contour d'une parcelle existante. Verrou optimiste : la version attendue par
// le client doit être la version serveur, sinon la commande est en conflit et renvoie l'état
// serveur des champs qui divergent, pour que l'agent tranche.

export const parcelGeometrySet: SyncHandler<"parcel.geometry.set"> = {
  async target(command, db) {
    const farm = await findFarmOfParcel(db, command.payload.parcelId);
    return farm ? farmTarget(farm, "farm.update") : null;
  },

  async apply(command, db, context) {
    const { payload } = command;
    const parcel = await db.parcel.findFirst({
      where: { id: payload.parcelId, archivedAt: null },
      select: {
        id: true,
        code: true,
        version: true,
        farmId: true,
        computedAreaHa: true,
        declaredAreaHa: true,
      },
    });
    if (!parcel) return rejected("NOT_FOUND", "Parcelle inconnue", "parcelId");

    if (parcel.version !== payload.expectedVersion) {
      return {
        outcome: "CONFLICT",
        conflict: {
          serverVersion: parcel.version,
          fields: {
            computedAreaHa: parcel.computedAreaHa === null ? null : Number(parcel.computedAreaHa),
            declaredAreaHa: Number(parcel.declaredAreaHa),
          },
        },
      };
    }

    const measure = await measurePolygon(db, payload.geometry);
    if (!measure.valid) {
      return rejected(
        "INVALID_GEOMETRY",
        `Contour invalide : ${measure.reason ?? "géométrie non valide"}`,
        "geometry",
      );
    }

    const updated = await db.parcel.update({
      where: { id: parcel.id },
      data: {
        captureMethod: payload.captureMethod,
        gpsAccuracyM: payload.gpsAccuracyM ?? null,
        // C2 : même plafond que parcel-create.ts — voir son commentaire.
        reliability:
          payload.captureMethod === "GPS_WALK" && context.grantRole === "AGENT_AGRICULTURE"
            ? "FIELD_VERIFIED"
            : "DECLARED",
        version: { increment: 1 },
      },
      select: { id: true, code: true, version: true },
    });
    await writeParcelGeometry(db, parcel.id, payload.geometry);

    return {
      outcome: "APPLIED",
      entity: { type: "parcel", id: updated.id, code: updated.code, version: updated.version },
      farmId: parcel.farmId,
      eventKind: "PARCEL_GEOMETRY_SET",
      eventPayload: {
        parcelId: parcel.id,
        computedAreaHa: measure.areaHa,
        captureMethod: payload.captureMethod,
      },
      audit: {
        action: "registry.parcel.created",
        details: { parcelId: parcel.id, geometryReplaced: true, version: updated.version },
      },
    };
  },
};
