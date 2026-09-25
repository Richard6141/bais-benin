import { farmerCode } from "@/database/seed/generators/identifiers";
import { findCommuneByCode } from "./lookups";
import { FIELD_SOURCE_ID, rejected, type SyncHandler } from "./types";

// Création d'un producteur par un agent de terrain. L'identifiant vient du client (UUID v7) pour
// que les commandes suivantes du lot puissent le référencer ; le code officiel est attribué par
// la séquence serveur. Le consentement est conservé dans le journal d'audit.

async function nextFarmerCode(db: Parameters<SyncHandler<"farmer.create">["apply"]>[1]) {
  const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('farmer_code_seq') AS n`;
  return farmerCode(Number(rows[0]?.n ?? 0));
}

export const farmerCreate: SyncHandler<"farmer.create"> = {
  async target(command, db) {
    const commune = await findCommuneByCode(db, command.payload.communeCode);
    if (!commune) return null;
    // Sans exploitation existante, la création d'un producteur relève du droit de créer une
    // exploitation dans la commune (un agent affecté à la commune, jamais un simple visiteur).
    return {
      action: "farm.create",
      resource: { communeId: commune.id, departementId: commune.departementId },
    };
  },

  async apply(command, db, context) {
    const { payload } = command;
    const commune = await findCommuneByCode(db, payload.communeCode);
    if (!commune) return rejected("NOT_FOUND", "Commune inconnue", "communeCode");

    const existing = await db.farmer.findUnique({
      where: { id: payload.id },
      select: { id: true, code: true },
    });
    if (existing) {
      return {
        outcome: "DUPLICATE",
        entity: { type: "farmer", id: existing.id, code: existing.code, version: 1 },
      };
    }

    const code = await nextFarmerCode(db);
    const farmer = await db.farmer.create({
      data: {
        id: payload.id,
        code,
        firstName: payload.firstName,
        lastName: payload.lastName,
        gender: payload.gender,
        birthYear: payload.birthYear ?? null,
        phoneE164: payload.phone ?? null,
        communeId: commune.id,
        village: payload.village ?? null,
        householdSize: payload.householdSize ?? null,
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(command.clientCreatedAt),
        reliability: "DECLARED",
      },
      select: { id: true, code: true },
    });

    return {
      outcome: "APPLIED",
      entity: { type: "farmer", id: farmer.id, code: farmer.code, version: 1 },
      audit: {
        action: "registry.farmer.created",
        details: {
          farmerId: farmer.id,
          code: farmer.code,
          communeCode: payload.communeCode,
          consentAt: payload.consentAt,
          deviceId: context.deviceId,
        },
      },
    };
  },
};
