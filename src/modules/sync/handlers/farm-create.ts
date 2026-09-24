import { farmCode } from "@/database/seed/generators/identifiers";
import { findCommuneByCode } from "./lookups";
import { FIELD_SOURCE_ID, rejected, type SyncHandler } from "./types";

// Création d'une exploitation rattachée à un producteur existant (créé dans le même lot ou
// avant). La position est un point GPS écrit par PostGIS ; le code suit le format
// BJ-<DEP>-<COM>-NNNNNN du jeu de démonstration, avec une séquence serveur distincte.

export const farmCreate: SyncHandler<"farm.create"> = {
  async target(command, db) {
    const commune = await findCommuneByCode(db, command.payload.communeCode);
    if (!commune) return null;
    const farmer = await db.farmer.findFirst({
      where: { id: command.payload.farmerId, archivedAt: null },
      select: { userId: true },
    });
    if (!farmer) return null;
    return {
      action: "farm.create",
      resource: {
        communeId: commune.id,
        departementId: commune.departementId,
        ownerUserId: farmer.userId,
      },
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    const commune = await findCommuneByCode(db, payload.communeCode);
    if (!commune) return rejected("NOT_FOUND", "Commune inconnue", "communeCode");
    const farmer = await db.farmer.findFirst({
      where: { id: payload.farmerId, archivedAt: null },
      select: { id: true },
    });
    if (!farmer) return rejected("NOT_FOUND", "Producteur inconnu", "farmerId");

    const existing = await db.farm.findUnique({
      where: { id: payload.id },
      select: { id: true, code: true, version: true },
    });
    if (existing) {
      return {
        outcome: "DUPLICATE",
        entity: { type: "farm", id: existing.id, code: existing.code, version: existing.version },
      };
    }

    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('farm_code_seq') AS n`;
    const code = farmCode(commune.departementName, commune.name, Number(rows[0]?.n ?? 0));
    const farm = await db.farm.create({
      data: {
        id: payload.id,
        code,
        farmerId: farmer.id,
        name: payload.name ?? null,
        communeId: commune.id,
        village: payload.village ?? null,
        declaredAreaHa: payload.declaredAreaHa,
        tenure: payload.tenure,
        mainActivity: payload.mainActivity,
        verificationStatus: "DECLARED",
        registeredById: context.actor.userId,
        version: 1,
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(command.clientCreatedAt),
        reliability: "DECLARED",
      },
      select: { id: true, code: true, version: true },
    });
    const [lon, lat] = payload.location;
    await db.$executeRaw`
      UPDATE "farm"
      SET "location" = ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography
      WHERE "id" = ${farm.id}::uuid`;

    return {
      outcome: "APPLIED",
      entity: { type: "farm", id: farm.id, code: farm.code, version: farm.version },
      farmId: farm.id,
      eventKind: "CREATED",
      eventPayload: {
        code: farm.code,
        declaredAreaHa: payload.declaredAreaHa,
        locationAccuracyM: payload.locationAccuracyM ?? null,
      },
      audit: {
        action: "registry.farm.created",
        details: {
          farmId: farm.id,
          code: farm.code,
          communeCode: payload.communeCode,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
