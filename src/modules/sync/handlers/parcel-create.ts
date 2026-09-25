import {
  areaGapWarning,
  measurePolygon,
  writeParcelCentroid,
  writeParcelGeometry,
} from "./geometry";
import { farmTarget, findFarm } from "./lookups";
import { FIELD_SOURCE_ID, rejected, type SyncHandler } from "./types";

// Ajout d'une parcelle à une exploitation. Le contour est facultatif (DECLARED_ONLY) ; quand il
// existe, la surface mesurée est calculée par PostGIS et comparée à la surface déclarée.

async function nextParcelCode(
  db: Parameters<SyncHandler<"parcel.create">["apply"]>[1],
  farmCode: string,
) {
  const count = await db.parcel.count({ where: { farm: { code: farmCode } } });
  for (let index = count + 1; index < count + 100; index += 1) {
    const candidate = `${farmCode}-P${String(index).padStart(2, "0")}`;
    const taken = await db.parcel.findUnique({ where: { code: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error(`Impossible d'attribuer un code de parcelle pour ${farmCode}`);
}

export const parcelCreate: SyncHandler<"parcel.create"> = {
  async target(command, db) {
    const farm = await findFarm(db, command.payload.farmId);
    return farm ? farmTarget(farm, "farm.update") : null;
  },

  async apply(command, db, context) {
    const { payload } = command;
    const farm = await findFarm(db, payload.farmId);
    if (!farm) return rejected("NOT_FOUND", "Exploitation inconnue", "farmId");

    const existing = await db.parcel.findUnique({
      where: { id: payload.id },
      select: { id: true, code: true, version: true },
    });
    if (existing) {
      return {
        outcome: "DUPLICATE",
        entity: { type: "parcel", id: existing.id, code: existing.code, version: existing.version },
      };
    }

    let measuredHa: number | null = null;
    if (payload.geometry) {
      const measure = await measurePolygon(db, payload.geometry);
      if (!measure.valid) {
        return rejected(
          "INVALID_GEOMETRY",
          `Contour invalide : ${measure.reason ?? "géométrie non valide"}`,
          "geometry",
        );
      }
      measuredHa = measure.areaHa;
    }

    const code = await nextParcelCode(db, farm.code);
    const parcel = await db.parcel.create({
      data: {
        id: payload.id,
        code,
        farmId: farm.id,
        declaredAreaHa: payload.declaredAreaHa,
        captureMethod: payload.captureMethod,
        gpsAccuracyM: payload.gpsAccuracyM ?? null,
        irrigation: payload.irrigation,
        soilType: payload.soilType ?? null,
        version: 1,
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(command.clientCreatedAt),
        // C2 : FIELD_VERIFIED suppose qu'un agent a réellement marché le contour ; captureMethod
        // seul (envoyé par le client) ne le prouve pas — n'importe quel téléphone peut prétendre
        // GPS_WALK. On la plafonne au rôle qui a autorisé la commande (context.grantRole).
        reliability:
          payload.captureMethod === "GPS_WALK" && context.grantRole === "AGENT_AGRICULTURE"
            ? "FIELD_VERIFIED"
            : "DECLARED",
      },
      select: { id: true, code: true, version: true },
    });
    if (payload.geometry) {
      await writeParcelGeometry(db, parcel.id, payload.geometry);
    } else if (payload.centroid) {
      await writeParcelCentroid(db, parcel.id, payload.centroid);
    }

    const warning = areaGapWarning(payload.declaredAreaHa, measuredHa);
    return {
      outcome: "APPLIED",
      entity: { type: "parcel", id: parcel.id, code: parcel.code, version: parcel.version },
      farmId: farm.id,
      eventKind: "PARCEL_ADDED",
      eventPayload: {
        parcelId: parcel.id,
        code: parcel.code,
        declaredAreaHa: payload.declaredAreaHa,
        computedAreaHa: measuredHa,
        captureMethod: payload.captureMethod,
      },
      audit: {
        action: "registry.parcel.created",
        details: {
          parcelId: parcel.id,
          farmId: farm.id,
          code: parcel.code,
          deviceId: context.deviceId,
        },
      },
      warnings: warning ? [warning] : undefined,
    };
  },
};
