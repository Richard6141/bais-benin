import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { insertReferenceFields } from "@/database/reference-fields-store";
import { loadActor } from "@/modules/identity";
import { applySyncBatch } from "@/modules/sync";

// Champ détecté attribué à une exploitation (ADR-0029) : la commande parcel.create avec la méthode
// REFERENCE_FIELD vaut AGENT_VERIFIED, garde la provenance, et refuse un contour qui ne vient pas
// d'un champ détecté existant.

const AGENT_PHONE = "+2290190000001";
const DEVICE = "test-device-reference-field";
const AT = "2026-09-27T09:30:00+01:00";
const YEAR = 2098;
const PARCEL_ID = "019284a0-0000-7000-8000-00000000e001";
const OTHER_PARCEL_ID = "019284a0-0000-7000-8000-00000000e002";

const FIELD = {
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
// Contour corrigé par l'agent : décalé de quelques mètres, il recouvre encore le champ.
const CORRECTED = {
  type: "Polygon" as const,
  coordinates: [
    [
      [1.67002, 9.70002],
      [1.670931, 9.70002],
      [1.670931, 9.700924],
      [1.67002, 9.700924],
      [1.67002, 9.70002],
    ],
  ],
};
const ELSEWHERE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2.4, 9.1],
      [2.400911, 9.1],
      [2.400911, 9.100904],
      [2.4, 9.100904],
      [2.4, 9.1],
    ],
  ],
};

function command(id: string, payload: unknown) {
  return {
    id,
    type: "parcel.create",
    payload,
    idempotencyKey: `ref-${id}`,
    clientCreatedAt: AT,
    deviceId: DEVICE,
  };
}

let fieldId = "";

async function purgeCommands() {
  await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
}

async function agent() {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: AGENT_PHONE },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

beforeAll(async () => {
  await purgeCommands();
  await insertReferenceFields([
    { ref: "attribution-1", year: YEAR, confidence: 90, areaHa: 1, geometry: FIELD },
  ]);
  const stored = await prisma.referenceField.findFirstOrThrow({
    where: { year: YEAR, sourceRef: "attribution-1" },
    select: { id: true },
  });
  fieldId = String(stored.id);
});

afterAll(async () => {
  await purgeCommands();
  await prisma.parcel.deleteMany({ where: { id: { in: [PARCEL_ID, OTHER_PARCEL_ID] } } });
  await prisma.$executeRaw`DELETE FROM "reference_field" WHERE "year" = ${YEAR}`;
  await prisma.$disconnect();
});

describe("attribution d'un champ détecté", () => {
  it("crée une parcelle AGENT_VERIFIED qui garde sa provenance", async () => {
    const { id, actor } = await agent();
    const farm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: id, archivedAt: null },
      select: { id: true },
    });
    const [created] = await applySyncBatch(actor, DEVICE, [
      command(PARCEL_ID, {
        id: PARCEL_ID,
        farmId: farm.id,
        declaredAreaHa: 1,
        geometry: CORRECTED,
        captureMethod: "REFERENCE_FIELD",
        referenceFieldIds: [fieldId],
      }),
    ]);
    expect(created?.outcome).toBe("APPLIED");
    expect(
      await prisma.parcel.findUniqueOrThrow({
        where: { id: PARCEL_ID },
        select: { captureMethod: true, reliability: true, farmId: true },
      }),
    ).toEqual({ captureMethod: "REFERENCE_FIELD", reliability: "AGENT_VERIFIED", farmId: farm.id });
    const event = await prisma.farmEvent.findFirstOrThrow({
      where: {
        farmId: farm.id,
        kind: "PARCEL_ADDED",
        payload: { path: ["referenceFieldIds"], equals: [fieldId] },
      },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    });
    expect((event.payload as { referenceFieldIds: string[] }).referenceFieldIds).toEqual([fieldId]);
  });

  it("refuse un contour sans champ détecté, inconnu ou sans lien avec lui", async () => {
    const { id, actor } = await agent();
    const farm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: id, archivedAt: null },
      select: { id: true },
    });
    const base = { id: OTHER_PARCEL_ID, farmId: farm.id, declaredAreaHa: 1 };
    const results = await applySyncBatch(actor, DEVICE, [
      command(OTHER_PARCEL_ID, {
        ...base,
        geometry: FIELD,
        captureMethod: "REFERENCE_FIELD",
      }),
      command("019284a0-0000-7000-8000-00000000e003", {
        ...base,
        id: "019284a0-0000-7000-8000-00000000e003",
        geometry: FIELD,
        captureMethod: "REFERENCE_FIELD",
        referenceFieldIds: ["999999999999"],
      }),
      command("019284a0-0000-7000-8000-00000000e004", {
        ...base,
        id: "019284a0-0000-7000-8000-00000000e004",
        geometry: ELSEWHERE,
        captureMethod: "REFERENCE_FIELD",
        referenceFieldIds: [fieldId],
      }),
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["REJECTED", "REJECTED", "REJECTED"]);
    expect(await prisma.parcel.count({ where: { id: OTHER_PARCEL_ID } })).toBe(0);
  });
});
