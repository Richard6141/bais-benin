import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import { applySyncBatch } from "@/modules/sync";

// Délimitation assistée (ADR-0016, phase 3) : un contour proposé par le satellite et validé par
// l'agent, peut-être au bureau, vaut AGENT_VERIFIED, jamais FIELD_VERIFIED, réservé à la marche
// GPS sur place. Vérifié à travers le vrai traitement de la commande parcel.geometry.set, sur une
// parcelle créée pour le test dans une exploitation enregistrée par l'agent de démonstration.

const AGENT_PHONE = "+2290190000001";
const DEVICE = "test-device-satellite-contour";
const AT = "2026-09-26T09:30:00+01:00";
const PARCEL_ID = "019284a0-0000-7000-8000-00000000d001";

const ONE_HECTARE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [1.67, 9.7],
      [1.670911, 9.7],
      [1.670911, 9.700904],
      [1.67, 9.700904],
      [1.67, 9.7],
    ],
  ],
};

function command(id: string, type: string, payload: unknown) {
  return { id, type, payload, idempotencyKey: `sat-${id}`, clientCreatedAt: AT, deviceId: DEVICE };
}

async function agent() {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: AGENT_PHONE },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

describe("fiabilité d'un contour proposé par le satellite", () => {
  afterAll(async () => {
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.farmEvent.deleteMany({
      where: { payload: { path: ["parcelId"], equals: PARCEL_ID } },
    });
    await prisma.parcel.deleteMany({ where: { id: PARCEL_ID } });
    await prisma.$disconnect();
  });

  it("donne AGENT_VERIFIED au contour satellite validé, FIELD_VERIFIED à la seule marche GPS", async () => {
    const { id, actor } = await agent();
    const farm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: id, archivedAt: null },
      select: { id: true },
    });
    const [created] = await applySyncBatch(actor, DEVICE, [
      command(PARCEL_ID, "parcel.create", {
        id: PARCEL_ID,
        farmId: farm.id,
        declaredAreaHa: 1,
        captureMethod: "DECLARED_ONLY",
      }),
    ]);
    expect(created?.outcome).toBe("APPLIED");

    const [assisted] = await applySyncBatch(actor, DEVICE, [
      command("019284a0-0000-7000-8000-00000000d002", "parcel.geometry.set", {
        parcelId: PARCEL_ID,
        geometry: ONE_HECTARE,
        captureMethod: "SATELLITE_ASSISTED",
        expectedVersion: 1,
      }),
    ]);
    expect(assisted?.outcome).toBe("APPLIED");
    expect(
      await prisma.parcel.findUniqueOrThrow({
        where: { id: PARCEL_ID },
        select: { captureMethod: true, reliability: true },
      }),
    ).toEqual({ captureMethod: "SATELLITE_ASSISTED", reliability: "AGENT_VERIFIED" });

    const [walked] = await applySyncBatch(actor, DEVICE, [
      command("019284a0-0000-7000-8000-00000000d003", "parcel.geometry.set", {
        parcelId: PARCEL_ID,
        geometry: ONE_HECTARE,
        captureMethod: "GPS_WALK",
        gpsAccuracyM: 4,
        expectedVersion: 2,
      }),
    ]);
    expect(walked?.outcome).toBe("APPLIED");
    expect(
      (
        await prisma.parcel.findUniqueOrThrow({
          where: { id: PARCEL_ID },
          select: { reliability: true },
        })
      ).reliability,
    ).toBe("FIELD_VERIFIED");
  });
});
