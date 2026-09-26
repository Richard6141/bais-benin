import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentDatabase } from "@/lib/offline/db";
import { buildFieldAttributionCommand } from "./survey-command";

const farmId = "01923456-0000-7000-8000-000000000010";
const parcelId = "01923456-0000-7000-8000-000000000030";

const geometry = {
  type: "Polygon" as const,
  coordinates: [
    [
      [1.67, 9.7],
      [1.670911, 9.7],
      [1.670911, 9.700904],
      [1.67, 9.700904],
      [1.67, 9.7],
    ] as [number, number][],
  ],
};

describe("attribution d'un champ détecté", () => {
  let db: AgentDatabase;

  beforeEach(async () => {
    db = new AgentDatabase(`attribution-${crypto.randomUUID()}`);
    await db.farms.add({
      id: farmId,
      code: "BJ-DON-DJO-000001",
      farmerId: "f1",
      farmerName: "Test",
      communeCode: "BJ-DON-003",
      communeName: "Djougou",
      verificationStatus: "DECLARED",
      declaredAreaHa: 2,
      parcelCount: 1,
      cropCodes: [],
      version: 1,
      syncState: "SYNCED",
      updatedAt: "2026-09-27T08:00:00.000Z",
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it("met en file une création de parcelle REFERENCE_FIELD avec les champs d'origine", async () => {
    const built = buildFieldAttributionCommand({
      farmId,
      parcelId,
      referenceFieldIds: ["41", "42"],
      geometry,
      declaredAreaHa: 1.02,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toMatchObject({
      id: parcelId,
      farmId,
      captureMethod: "REFERENCE_FIELD",
      referenceFieldIds: ["41", "42"],
      declaredAreaHa: 1.02,
    });
    await built.enqueue(db);
    const [entry] = await db.outbox.toArray();
    expect(entry?.type).toBe("parcel.create");
    expect(entry?.status).toBe("PENDING");
    const farm = await db.farms.get(farmId);
    expect(farm?.parcelCount).toBe(2);
    expect(farm?.syncState).toBe("MODIFIED");
  });

  it("garde l'exploitation créée sur l'appareil à l'état LOCAL_ONLY", async () => {
    await db.farms.update(farmId, { syncState: "LOCAL_ONLY" });
    const built = buildFieldAttributionCommand({
      farmId,
      parcelId,
      referenceFieldIds: ["41"],
      geometry,
      declaredAreaHa: 1,
    });
    if (!built.ok) throw new Error("commande refusée");
    await built.enqueue(db);
    expect((await db.farms.get(farmId))?.syncState).toBe("LOCAL_ONLY");
  });
});
