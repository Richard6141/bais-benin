import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentDatabase } from "@/lib/offline/db";
import { buildParcelSurveyCommand } from "./survey-command";

const farmId = "01923456-0000-7000-8000-000000000010";
const parcelId = "01923456-0000-7000-8000-000000000020";

describe("commande de relevé de contour de parcelle", () => {
  let db: AgentDatabase;

  beforeEach(() => {
    db = new AgentDatabase(`survey-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("refuse un contour de moins de trois coins", () => {
    const built = buildParcelSurveyCommand({
      farmId,
      parcelId,
      expectedVersion: 1,
      corners: [
        { lat: 9.0, lng: 1.6 },
        { lat: 9.001, lng: 1.601 },
      ],
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toContain("3 coins");
  });

  it("construit le polygone fermé, la surface estimée et met la commande en file", async () => {
    await db.farms.add({
      id: farmId,
      code: "BJ-DON-DJO-000001",
      farmerId: "f1",
      farmerName: "Test",
      communeCode: "BJ-DON-003",
      communeName: "Djougou",
      verificationStatus: "DECLARED",
      declaredAreaHa: 1,
      parcelCount: 1,
      cropCodes: ["MAIZE"],
      version: 1,
      syncState: "SYNCED",
      updatedAt: "2026-09-01T00:00:00Z",
    });

    const corners = [
      { lat: 9.0, lng: 1.6, accuracyM: 5 },
      { lat: 9.0, lng: 1.6009, accuracyM: 7 },
      { lat: 9.0009, lng: 1.6009, accuracyM: 6 },
      { lat: 9.0009, lng: 1.6, accuracyM: 8 },
    ];

    const built = buildParcelSurveyCommand({
      farmId,
      parcelId,
      expectedVersion: 3,
      corners,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.payload.parcelId).toBe(parcelId);
    expect(built.payload.captureMethod).toBe("GPS_WALK");
    expect(built.payload.expectedVersion).toBe(3);
    expect(built.payload.gpsAccuracyM).toBe(7);
    expect(built.payload.geometry.type).toBe("Polygon");
    const ring = built.payload.geometry.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(built.areaHa).toBeGreaterThan(0.9);
    expect(built.areaHa).toBeLessThan(1.1);

    await built.enqueue(db);
    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("parcel.geometry.set");
    expect(entries[0]?.expectedVersion).toBe(3);
    const farm = await db.farms.get(farmId);
    expect(farm?.syncState).toBe("MODIFIED");
  });
});
