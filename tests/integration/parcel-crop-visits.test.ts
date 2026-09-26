import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { loadActor } from "@/modules/identity";
import { listCropVisitPriorities, trainAndPredictCrops } from "@/modules/satellite";
import { applySyncBatch } from "@/modules/sync";

// Apprentissage actif (ADR-0030, lot 2) sur la vraie base : la visite enregistre la culture vue
// sur chaque parcelle, le modèle l'apprend, et la file de l'agent met les doutes en tête.

const AGENT_PHONE = "+2290190000001";
const MINISTRY_PHONE = "+2290190000003";
const DEVICE = "test-device-cultures";
const AT = "2026-09-27T09:30:00+01:00";

async function userId(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return user.id;
}

function visit(
  id: string,
  farmId: string,
  observedCrops: { parcelId: string; cropCode: string }[],
) {
  return {
    id,
    type: "verification.record",
    payload: {
      id,
      farmId,
      kind: "FIELD_VISIT",
      outcome: "CONFIRMED",
      visitedAt: AT,
      identityConfirmed: true,
      observedCrops,
    },
    idempotencyKey: `it-${id}`,
    clientCreatedAt: AT,
    deviceId: DEVICE,
  };
}

describe("cultures constatées et file de visite", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enregistre la culture vue sur chaque parcelle, et refuse une culture inconnue sans rien écrire", async () => {
    const agentId = await userId(AGENT_PHONE);
    const farm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: agentId, archivedAt: null, parcels: { some: { archivedAt: null } } },
      select: { id: true, parcels: { where: { archivedAt: null }, select: { id: true }, take: 1 } },
    });
    const parcelId = farm.parcels[0]!.id;
    const agent = await loadActor(agentId);

    const refusedId = crypto.randomUUID();
    const [refused] = await applySyncBatch(agent, DEVICE, [
      visit(refusedId, farm.id, [{ parcelId, cropCode: "CULTURE_INCONNUE" }]),
    ]);
    expect(refused?.outcome).toBe("REJECTED");
    expect(await prisma.farmVerification.count({ where: { id: refusedId } })).toBe(0);

    const acceptedId = crypto.randomUUID();
    const [accepted] = await applySyncBatch(agent, DEVICE, [
      visit(acceptedId, farm.id, [{ parcelId, cropCode: "COTTON" }]),
    ]);
    expect(accepted?.outcome).toBe("APPLIED");
    const observation = await prisma.parcelCropObservation.findFirstOrThrow({
      where: { verificationId: acceptedId },
      select: { parcelId: true, crop: { select: { code: true } }, reliability: true },
    });
    expect(observation).toEqual({
      parcelId,
      crop: { code: "COTTON" },
      reliability: "FIELD_VERIFIED",
    });
  });

  it("apprend une culture constatée, et ne refait pas le modèle sans rien de nouveau", async () => {
    const signed = await prisma.parcelSignature.findFirstOrThrow({
      where: { parcel: { cropObservations: { none: {} } } },
      select: { parcelId: true, campaignId: true, parcel: { select: { farmId: true } } },
    });
    const verification = await prisma.farmVerification.create({
      data: {
        farmId: signed.parcel.farmId,
        parcelId: signed.parcelId,
        kind: "FIELD_VISIT",
        outcome: "CONFIRMED",
        visitedAt: new Date(AT),
        sourceId: "ATDA_TERRAIN",
        sourceDate: new Date(AT),
        reliability: "FIELD_VERIFIED",
      },
      select: { id: true },
    });
    const cotton = await prisma.crop.findUniqueOrThrow({ where: { code: "COTTON" } });
    await prisma.parcelCropObservation.create({
      data: {
        parcelId: signed.parcelId,
        campaignId: signed.campaignId,
        cropId: cotton.id,
        verificationId: verification.id,
        observedAt: new Date(AT),
        sourceId: "ATDA_TERRAIN",
        reliability: "FIELD_VERIFIED",
      },
    });
    const trained = await trainAndPredictCrops();
    expect(trained.unchanged).toBe(false);
    expect(trained.fieldVisitLabels).toBeGreaterThanOrEqual(1);
    const again = await trainAndPredictCrops();
    expect(again.unchanged).toBe(true);
    expect(again.version).toBe(trained.version);
  }, 120_000);

  it("met en tête les désaccords, dans le seul périmètre de l'agent", async () => {
    const ministry = await loadActor(await userId(MINISTRY_PHONE));
    const all = await listCropVisitPriorities(ministry, 50);
    expect(all.length).toBeGreaterThan(0);
    const firstUncertain = all.findIndex((entry) => entry.agreement === "UNCERTAIN");
    if (firstUncertain > 0) {
      expect(all.slice(firstUncertain).every((entry) => entry.agreement === "UNCERTAIN")).toBe(
        true,
      );
    }
    expect(all.every((entry) => !/[·…—;]/.test(entry.reason))).toBe(true);

    const agentId = await userId(AGENT_PHONE);
    const own = await listCropVisitPriorities(await loadActor(agentId), 50);
    const farms = await prisma.farm.findMany({
      where: { id: { in: own.map((entry) => entry.farmId) } },
      select: { registeredById: true },
    });
    expect(farms.every((farm) => farm.registeredById === agentId)).toBe(true);
  });
});
