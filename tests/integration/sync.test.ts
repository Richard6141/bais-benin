import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import { applySyncBatch, type SyncApplyResult } from "@/modules/sync";

// Parcours complet d'un agent de Djougou hors ligne : création d'un producteur et de son
// exploitation, tracé d'une parcelle d'environ un hectare, déclaration de maïs, récolte en
// sacs de 100 kg, puis visite de vérification. Le lot est rejoué pour vérifier l'idempotence.

const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";
const DJOUGOU = "BJ-DON-003";
const DEVICE = "test-device-djougou";
const AT = "2026-09-24T09:30:00+01:00";

const ids = {
  farmer: "019284a0-0000-7000-8000-00000000a001",
  farm: "019284a0-0000-7000-8000-00000000a002",
  parcel: "019284a0-0000-7000-8000-00000000a003",
  parcelCrop: "019284a0-0000-7000-8000-00000000a004",
  harvest: "019284a0-0000-7000-8000-00000000a005",
  verification: "019284a0-0000-7000-8000-00000000a006",
  forbiddenFarmer: "019284a0-0000-7000-8000-00000000b001",
  secondFarm: "019284a0-0000-7000-8000-00000000c001",
};

// Carré d'environ 100 m de côté au nord de Djougou (1,67° E, 9,70° N) : près d'un hectare.
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

function command(id: string, type: string, payload: unknown, dependsOn?: string[]) {
  return {
    id,
    type,
    payload,
    idempotencyKey: `it-${id}`,
    clientCreatedAt: AT,
    deviceId: DEVICE,
    dependsOn,
  };
}

const batch = [
  command(ids.farmer, "farmer.create", {
    id: ids.farmer,
    firstName: "Adjoua",
    lastName: "Synchro",
    gender: "F",
    birthYear: 1984,
    communeCode: DJOUGOU,
    village: "Kpayérou",
    consentAt: AT,
  }),
  command(
    ids.farm,
    "farm.create",
    {
      id: ids.farm,
      farmerId: ids.farmer,
      communeCode: DJOUGOU,
      location: [1.6705, 9.7005],
      locationAccuracyM: 6,
      declaredAreaHa: 1.2,
      tenure: "FAMILY",
    },
    [ids.farmer],
  ),
  command(
    ids.parcel,
    "parcel.create",
    {
      id: ids.parcel,
      farmId: ids.farm,
      declaredAreaHa: 1.2,
      geometry: ONE_HECTARE,
      captureMethod: "GPS_WALK",
      gpsAccuracyM: 5,
    },
    [ids.farm],
  ),
  command(
    ids.parcelCrop,
    "cropSeason.declare",
    {
      id: ids.parcelCrop,
      parcelId: ids.parcel,
      cropCode: "MAIZE",
      campaignCode: "2026-2027",
      seasonCode: "MAIN_RAINY",
      sowingDate: "2026-06-10",
    },
    [ids.parcel],
  ),
  command(
    ids.harvest,
    "harvest.declare",
    {
      id: ids.harvest,
      parcelCropId: ids.parcelCrop,
      declaredQuantity: 12,
      unit: "BAG_100KG",
      declaredOn: "2026-09-20",
      declaredBy: "AGENT",
    },
    [ids.parcelCrop],
  ),
  command(
    ids.verification,
    "verification.record",
    {
      id: ids.verification,
      farmId: ids.farm,
      parcelId: ids.parcel,
      kind: "FIELD_VISIT",
      outcome: "CONFIRMED",
      visitedAt: AT,
      gpsPoint: [1.6704, 9.7004],
      identityConfirmed: true,
    },
    [ids.parcel],
  ),
];

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return loadActor(user.id);
}

describe("serveur de synchronisation", () => {
  let first: SyncApplyResult[];

  beforeAll(async () => {
    await seedReferenceData();
  }, 120_000);

  afterAll(async () => {
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.farmEvent.deleteMany({ where: { farmId: { in: [ids.farm, ids.secondFarm] } } });
    await prisma.farmVerification.deleteMany({ where: { farmId: ids.farm } });
    await prisma.productionDeclaration.deleteMany({ where: { parcelCropId: ids.parcelCrop } });
    await prisma.parcelCrop.deleteMany({ where: { parcelId: ids.parcel } });
    await prisma.parcel.deleteMany({ where: { farmId: ids.farm } });
    await prisma.farm.deleteMany({ where: { id: { in: [ids.farm, ids.secondFarm] } } });
    await prisma.farmer.deleteMany({ where: { id: { in: [ids.farmer, ids.forbiddenFarmer] } } });
    await prisma.$disconnect();
  });

  it("applique le lot complet d'un agent de Djougou", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    first = await applySyncBatch(agent, DEVICE, batch);
    expect(first.map((r) => r.outcome)).toEqual([
      "APPLIED",
      "APPLIED",
      "APPLIED",
      "APPLIED",
      "APPLIED",
      "APPLIED",
    ]);

    expect(first[0]?.entity?.code).toMatch(/^BJ-F-\d{9}$/);
    expect(first[1]?.entity?.code).toMatch(/^BJ-DON-DJO-\d{6}$/);
    expect(first[2]?.entity?.code).toBe(`${first[1]?.entity?.code}-P01`);
    expect(first[2]?.warnings).toBeUndefined();
    expect(first[5]?.entity).toMatchObject({ type: "farm", id: ids.farm, version: 2 });

    const farm = await prisma.farm.findUniqueOrThrow({ where: { id: ids.farm } });
    expect(farm.verificationStatus).toBe("FIELD_VERIFIED");
    expect(farm.verifiedAt).not.toBeNull();
    expect(farm.version).toBe(2);
    expect(farm.sourceId).toBe("ATDA_TERRAIN");

    const parcel = await prisma.parcel.findUniqueOrThrow({ where: { id: ids.parcel } });
    expect(Number(parcel.computedAreaHa)).toBeGreaterThan(0.95);
    expect(Number(parcel.computedAreaHa)).toBeLessThan(1.05);
    const geometry = await prisma.$queryRaw<{ has_geom: boolean; has_location: boolean }[]>`
      SELECT p."geom" IS NOT NULL AND p."centroid" IS NOT NULL AS has_geom,
             f."location" IS NOT NULL AS has_location
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
      WHERE p."id" = ${ids.parcel}::uuid`;
    expect(geometry[0]).toEqual({ has_geom: true, has_location: true });

    const declaration = await prisma.productionDeclaration.findUniqueOrThrow({
      where: { id: ids.harvest },
    });
    expect(Number(declaration.quantityKg)).toBe(1200);
    const parcelCrop = await prisma.parcelCrop.findUniqueOrThrow({ where: { id: ids.parcelCrop } });
    expect(parcelCrop.stage).toBe("HARVESTED");

    const events = await prisma.farmEvent.findMany({
      where: { farmId: ids.farm },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.kind).sort()).toEqual(
      ["CREATED", "CROP_DECLARED", "HARVEST_DECLARED", "PARCEL_ADDED", "VERIFIED"].sort(),
    );
    expect(
      await prisma.syncCommand.count({ where: { deviceId: DEVICE, outcome: "APPLIED" } }),
    ).toBe(6);
  });

  it("rejoue le même lot en DUPLICATE avec les mêmes entités", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const replay = await applySyncBatch(agent, DEVICE, batch);
    expect(replay.map((r) => r.outcome)).toEqual(Array<string>(6).fill("DUPLICATE"));
    expect(replay.map((r) => r.entity)).toEqual(first.map((r) => r.entity));
    expect(await prisma.farmEvent.count({ where: { farmId: ids.farm } })).toBe(5);
    expect(await prisma.farmVerification.count({ where: { farmId: ids.farm } })).toBe(1);
  });

  it("signale l'écart de surface et met en conflit une géométrie périmée", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const [conflict] = await applySyncBatch(agent, DEVICE, [
      command("019284a0-0000-7000-8000-00000000a007", "parcel.geometry.set", {
        parcelId: ids.parcel,
        geometry: ONE_HECTARE,
        captureMethod: "MAP_DRAW",
        expectedVersion: 99,
      }),
    ]);
    expect(conflict).toMatchObject({ outcome: "CONFLICT", conflict: { serverVersion: 1 } });
    expect(conflict?.conflict?.fields).toHaveProperty("computedAreaHa");

    const [withWarning] = await applySyncBatch(agent, DEVICE, [
      command("019284a0-0000-7000-8000-00000000a008", "parcel.create", {
        id: "019284a0-0000-7000-8000-00000000a008",
        farmId: ids.farm,
        declaredAreaHa: 3,
        geometry: ONE_HECTARE,
        captureMethod: "MAP_DRAW",
      }),
    ]);
    expect(withWarning?.outcome).toBe("APPLIED");
    expect(withWarning?.warnings?.[0]).toMatch(/Écart de \d+ %/);
  });

  it("refuse le lot d'un producteur sur une commune qui n'est pas la sienne", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const results = await applySyncBatch(farmer, "test-device-farmer", [
      command(ids.forbiddenFarmer, "farmer.create", {
        id: ids.forbiddenFarmer,
        firstName: "Bio",
        lastName: "Interdit",
        communeCode: "BJ-BOR-005",
        consentAt: AT,
      }),
    ]);
    expect(results[0]).toMatchObject({ outcome: "REJECTED", error: { code: "FORBIDDEN" } });
    expect(await prisma.farmer.count({ where: { id: ids.forbiddenFarmer } })).toBe(0);
    await prisma.syncCommand.deleteMany({ where: { deviceId: "test-device-farmer" } });
  });

  // C2 : ce qu'un compte apprend des saisies des autres par la synchronisation.
  it("refuse la clé d'idempotence d'un autre compte sans renvoyer son résultat", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const [replayed] = await applySyncBatch(farmer, "test-device-farmer", [batch[0]]);
    expect(replayed).toMatchObject({
      outcome: "REJECTED",
      error: { code: "IDEMPOTENCY_KEY_CONFLICT" },
    });
    expect(replayed?.entity).toBeUndefined();
    const stored = await prisma.syncCommand.findUniqueOrThrow({
      where: { idempotencyKey: `it-${ids.farmer}` },
      select: { userId: true, outcome: true },
    });
    const agent = await actorForPhone(AGENT_PHONE);
    expect(stored).toEqual({ userId: agent.userId, outcome: "APPLIED" });
  });

  it("répond comme une absence pour une exploitation hors périmètre désignée par identifiant", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const [outside] = await applySyncBatch(farmer, "test-device-farmer", [
      command("019284a0-0000-7000-8000-00000000c002", "parcel.create", {
        id: "019284a0-0000-7000-8000-00000000c002",
        farmId: ids.farm,
        declaredAreaHa: 0.5,
        captureMethod: "DECLARED_ONLY",
      }),
    ]);
    expect(outside).toMatchObject({ outcome: "REJECTED", error: { code: "NOT_FOUND" } });
    await prisma.syncCommand.deleteMany({ where: { deviceId: "test-device-farmer" } });
  });

  it("refuse un identifiant déjà pris par une autre exploitation sans en donner le code", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const [secondFarm, reused] = await applySyncBatch(agent, DEVICE, [
      command(ids.secondFarm, "farm.create", {
        id: ids.secondFarm,
        farmerId: ids.farmer,
        communeCode: DJOUGOU,
        location: [1.671, 9.701],
        declaredAreaHa: 0.8,
        tenure: "FAMILY",
      }),
      command("019284a0-0000-7000-8000-00000000c003", "parcel.create", {
        id: ids.parcel,
        farmId: ids.secondFarm,
        declaredAreaHa: 0.8,
        captureMethod: "DECLARED_ONLY",
      }),
    ]);
    expect(secondFarm?.outcome).toBe("APPLIED");
    expect(reused).toMatchObject({ outcome: "REJECTED", error: { code: "ID_CONFLICT" } });
    expect(reused?.entity).toBeUndefined();
  });
});
