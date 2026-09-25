import { farmTarget, findFarmOfParcel } from "./lookups";
import { FIELD_SOURCE_ID, rejected, type SyncHandler } from "./types";

// Déclaration de récolte sur une culture de parcelle. La quantité est normalisée en kilogrammes
// par le facteur de l'unité ; les unités locales sans équivalent fixe (régime, tas, bassine)
// sont conservées avec un facteur 1 et un avertissement, en attendant le référentiel de
// conversion par culture (docs/08 §4).

export const HARVEST_UNIT_FACTORS_KG = {
  KG: 1,
  T: 1000,
  BAG_100KG: 100,
  BAG_50KG: 50,
  BUNCH: 1,
  HEAP: 1,
  BASIN: 1,
} as const;

export const NON_NORMALIZED_UNITS = new Set(["BUNCH", "HEAP", "BASIN"]);

export function quantityToKg(quantity: number, unit: keyof typeof HARVEST_UNIT_FACTORS_KG): number {
  return Math.round(quantity * HARVEST_UNIT_FACTORS_KG[unit] * 100) / 100;
}

export const harvestDeclare: SyncHandler<"harvest.declare"> = {
  async target(command, db) {
    const parcelCrop = await db.parcelCrop.findFirst({
      where: { id: command.payload.parcelCropId, archivedAt: null },
      select: { parcelId: true },
    });
    if (!parcelCrop) return null;
    const farm = await findFarmOfParcel(db, parcelCrop.parcelId);
    return farm ? farmTarget(farm, "farm.update") : null;
  },

  async apply(command, db, context) {
    const { payload } = command;
    const parcelCrop = await db.parcelCrop.findFirst({
      where: { id: payload.parcelCropId, archivedAt: null },
      select: { id: true, parcel: { select: { farmId: true } }, crop: { select: { code: true } } },
    });
    if (!parcelCrop) return rejected("NOT_FOUND", "Culture de parcelle inconnue", "parcelCropId");

    const existing = await db.productionDeclaration.findUnique({
      where: { id: payload.id },
      select: { id: true },
    });
    if (existing) {
      return {
        outcome: "DUPLICATE",
        entity: { type: "productionDeclaration", id: existing.id, version: 1 },
      };
    }

    const quantityKg = quantityToKg(payload.declaredQuantity, payload.unit);
    // C2 : declaredBy/reliability viennent du rôle qui a autorisé la commande (grantRole),
    // jamais du champ payload.declaredBy — sans quoi un agriculteur pourrait s'attribuer
    // AGENT_VERIFIED simplement en déclarant "AGENT" dans sa propre saisie hors ligne.
    const declaredByAgent = context.grantRole === "AGENT_AGRICULTURE";
    const declaration = await db.productionDeclaration.create({
      data: {
        id: payload.id,
        parcelCropId: parcelCrop.id,
        declaredQuantity: payload.declaredQuantity,
        unit: payload.unit,
        quantityKg,
        declaredOn: new Date(payload.declaredOn),
        declaredBy: declaredByAgent ? "AGENT" : "FARMER",
        declaredByUserId: context.actor.userId,
        lossesPct: payload.lossesPct ?? null,
        lossCause: payload.lossCause ?? null,
        priceHintFcfaPerKg: payload.priceHintFcfaPerKg ?? null,
        sourceId: FIELD_SOURCE_ID,
        sourceDate: new Date(payload.declaredOn),
        reliability: declaredByAgent ? "AGENT_VERIFIED" : "DECLARED",
      },
      select: { id: true },
    });
    await db.parcelCrop.update({ where: { id: parcelCrop.id }, data: { stage: "HARVESTED" } });

    const warnings = NON_NORMALIZED_UNITS.has(payload.unit)
      ? [
          `Unité non normalisée (${payload.unit}) : quantité conservée telle quelle, sans conversion en kilogrammes`,
        ]
      : undefined;

    return {
      outcome: "APPLIED",
      entity: { type: "productionDeclaration", id: declaration.id, version: 1 },
      farmId: parcelCrop.parcel.farmId,
      eventKind: "HARVEST_DECLARED",
      eventPayload: {
        declarationId: declaration.id,
        parcelCropId: parcelCrop.id,
        cropCode: parcelCrop.crop.code,
        declaredQuantity: payload.declaredQuantity,
        unit: payload.unit,
        quantityKg,
      },
      audit: {
        action: "registry.harvest.declared",
        details: {
          declarationId: declaration.id,
          parcelCropId: parcelCrop.id,
          quantityKg,
          unit: payload.unit,
          deviceId: context.deviceId,
        },
      },
      warnings,
    };
  },
};
