import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentDatabase } from "@/lib/offline/db";
import { buildVerificationCommand } from "./visit-command";

const farmId = "01923456-0000-7000-8000-000000000010";
const now = new Date("2026-09-24T09:30:00Z");

describe("commande de visite de vérification", () => {
  let db: AgentDatabase;

  beforeEach(() => {
    db = new AgentDatabase(`visit-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("exige une note pour un rejet", () => {
    const built = buildVerificationCommand({
      farmId,
      identityConfirmed: false,
      outcome: "REJECTED",
      position: null,
      correctedArea: "",
      notes: "  ",
      now,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toContain("note");
  });

  it("refuse de confirmer sans identité vérifiée", () => {
    const built = buildVerificationCommand({
      farmId,
      identityConfirmed: false,
      outcome: "CONFIRMED",
      position: null,
      correctedArea: "",
      notes: "",
      now,
    });
    expect(built.ok).toBe(false);
  });

  it("convertit la superficie corrigée saisie à la française et met la commande en file", async () => {
    await db.farms.add({
      id: farmId,
      code: "BJ-DON-DJO-000001",
      farmerId: "f1",
      farmerName: "Test",
      communeCode: "BJ-DON-003",
      communeName: "Djougou",
      verificationStatus: "DECLARED",
      declaredAreaHa: 3,
      parcelCount: 1,
      cropCodes: ["MAIZE"],
      version: 1,
      syncState: "SYNCED",
      updatedAt: "2026-09-01T00:00:00Z",
    });
    const built = buildVerificationCommand({
      farmId,
      identityConfirmed: true,
      outcome: "CORRECTED",
      position: { lng: 1.67, lat: 9.7, accuracyM: 8 },
      correctedArea: "2,5",
      notes: "",
      now,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toMatchObject({
      farmId,
      kind: "FIELD_VISIT",
      outcome: "CORRECTED",
      correctedDeclaredAreaHa: 2.5,
      gpsPoint: [1.67, 9.7],
      identityConfirmed: true,
      visitedAt: now.toISOString(),
    });
    expect(built.payload.notes).toBeUndefined();
    await built.enqueue(db);
    const entry = await db.outbox.get(built.payload.id);
    expect(entry?.type).toBe("verification.record");
    expect(entry?.status).toBe("PENDING");
    const farm = await db.farms.get(farmId);
    expect(farm?.syncState).toBe("MODIFIED");
  });
});
