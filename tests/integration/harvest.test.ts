import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import {
  declareHarvestOnline,
  listDeclarableCropSeasons,
  listHarvestHistory,
  listOwnFarms,
} from "@/modules/registry";
import { applySyncBatch } from "@/modules/sync";

// Déclaration de récolte en ligne par l'agricultrice de démonstration, sur l'exploitation
// synthétique de Djougou que le seed relie à son compte. Une seconde exploitation créée pour le
// test, appartenant à quelqu'un d'autre, sert à vérifier le refus.

const FARMER_PHONE = "+2290190000002";
const provenance = {
  sourceId: "BAIS_SEED",
  sourceDate: new Date(),
  reliability: "SYNTHETIC",
} as const;

const other = {
  farmer: "019284a0-0000-7000-8000-00000000c011",
  farm: "019284a0-0000-7000-8000-00000000c012",
  parcel: "019284a0-0000-7000-8000-00000000c013",
  parcelCrop: "019284a0-0000-7000-8000-00000000c014",
};

const applied: string[] = [];
let ownFarmId: string;
let userId: string;
let startedAt: Date;

describe("déclaration de récolte en ligne", () => {
  beforeAll(async () => {
    await seedReferenceData();
    startedAt = new Date();
    const user = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: FARMER_PHONE },
      select: { id: true },
    });
    userId = user.id;
    const own = await listOwnFarms(userId);
    if (!own[0])
      throw new Error("Le seed n'a pas relié l'agricultrice de démonstration à une exploitation");
    ownFarmId = own[0].id;

    const commune = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-DON-003" } });
    const campaign = await prisma.agriculturalCampaign.findFirstOrThrow({
      where: { status: "OPEN" },
    });
    const maize = await prisma.crop.findUniqueOrThrow({ where: { code: "MAIZE" } });
    await prisma.farmer.create({
      data: {
        id: other.farmer,
        code: "BJ-F-HARV000002",
        firstName: "Test",
        lastName: "Autre",
        communeId: commune.id,
        ...provenance,
      },
    });
    await prisma.farm.create({
      data: {
        id: other.farm,
        code: "BJ-DON-DJO-HARV02",
        farmerId: other.farmer,
        communeId: commune.id,
        declaredAreaHa: 2,
        ...provenance,
      },
    });
    await prisma.parcel.create({
      data: {
        id: other.parcel,
        code: "BJ-DON-DJO-HARV02-P01",
        farmId: other.farm,
        declaredAreaHa: 2,
        ...provenance,
      },
    });
    await prisma.parcelCrop.create({
      data: {
        id: other.parcelCrop,
        parcelId: other.parcel,
        cropId: maize.id,
        campaignId: campaign.id,
        areaHa: 2,
        ...provenance,
      },
    });
  }, 180_000);

  afterAll(async () => {
    await prisma.syncCommand.deleteMany({ where: { id: { in: applied } } });
    await prisma.productionDeclaration.deleteMany({ where: { id: { in: applied } } });
    await prisma.farmEvent.deleteMany({
      where: { farmId: { in: [ownFarmId, other.farm] }, occurredAt: { gte: startedAt } },
    });
    await prisma.parcelCrop.deleteMany({ where: { id: other.parcelCrop } });
    await prisma.parcel.deleteMany({ where: { id: other.parcel } });
    await prisma.farm.deleteMany({ where: { id: other.farm } });
    await prisma.farmer.deleteMany({ where: { id: other.farmer } });
    await prisma.$disconnect();
  });

  it("propose les cultures de la campagne ouverte de sa propre exploitation, datées", async () => {
    const actor = await loadActor(userId);
    const seasons = await listDeclarableCropSeasons(actor, ownFarmId);
    expect(seasons.length).toBeGreaterThan(0);
    expect(seasons.every((s) => s.campaignCode === "2026-2027")).toBe(true);
    expect(seasons.every((s) => s.tradeUnit.length > 0)).toBe(true);
    const dated = seasons.filter((s) => s.expectedHarvestOn !== null);
    expect(dated.length).toBeGreaterThan(0);
    // Tri par date de récolte attendue croissante.
    const times = dated.map((s) => s.expectedHarvestOn?.getTime() ?? 0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Une exploitation qui n'est pas la sienne ne propose rien.
    expect(await listDeclarableCropSeasons(actor, other.farm)).toEqual([]);
  });

  it("enregistre la récolte de l'agricultrice sur sa propre exploitation", async () => {
    const actor = await loadActor(userId);
    const [season] = await listDeclarableCropSeasons(actor, ownFarmId);
    if (!season) throw new Error("Aucune culture déclarable");
    const result = await declareHarvestOnline(actor, {
      parcelCropId: season.parcelCropId,
      declaredQuantity: 8,
      unit: "BAG_100KG",
      lossesPct: 10,
      lossCause: "Stockage",
    });
    applied.push(result.id);
    expect(result.outcome).toBe("APPLIED");
    expect(result.warnings).toBeUndefined();

    const declaration = await prisma.productionDeclaration.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(declaration.parcelCropId).toBe(season.parcelCropId);
    expect(Number(declaration.quantityKg)).toBe(800);
    expect(declaration.declaredBy).toBe("FARMER");
    expect(declaration.declaredByUserId).toBe(userId);
    expect(Number(declaration.lossesPct)).toBe(10);

    const events = await prisma.farmEvent.findMany({
      where: { farmId: ownFarmId, occurredAt: { gte: startedAt } },
    });
    expect(events.map((e) => e.kind)).toEqual(["HARVEST_DECLARED"]);

    const history = await listHarvestHistory(actor, ownFarmId);
    const current = history?.campaigns.find((c) => c.campaignCode === "2026-2027");
    expect(current?.totalKg).toBeGreaterThanOrEqual(800);
    const crop = current?.crops.find((c) => c.parcelCropId === season.parcelCropId);
    expect(crop?.declarations.some((d) => d.id === result.id && d.declaredQuantity === 8)).toBe(
      true,
    );
    expect(history?.events.some((e) => e.kind === "HARVEST_DECLARED")).toBe(true);
  });

  it("ignore un declaredBy=AGENT falsifié dans la commande hors ligne d'une agricultrice (C2)", async () => {
    // La fiabilité ne doit jamais dépendre d'un champ envoyé par le client : une agricultrice
    // qui construit elle-même la commande harvest.declare (comme le ferait l'outbox hors ligne)
    // et y met declaredBy="AGENT" ne doit pas obtenir AGENT_VERIFIED pour autant.
    const actor = await loadActor(userId);
    const [season] = await listDeclarableCropSeasons(actor, ownFarmId);
    if (!season) throw new Error("Aucune culture déclarable");
    const id = crypto.randomUUID();
    const [result] = await applySyncBatch(actor, "test-device", [
      {
        id,
        type: "harvest.declare",
        idempotencyKey: `spoof-${id}`,
        clientCreatedAt: new Date().toISOString(),
        deviceId: "test-device",
        payload: {
          id,
          parcelCropId: season.parcelCropId,
          declaredQuantity: 5,
          unit: "BAG_100KG",
          declaredOn: new Date().toISOString().slice(0, 10),
          declaredBy: "AGENT",
        },
      },
    ]);
    applied.push(id);
    expect(result?.outcome).toBe("APPLIED");

    const declaration = await prisma.productionDeclaration.findUniqueOrThrow({ where: { id } });
    expect(declaration.declaredBy).toBe("FARMER");
    expect(declaration.reliability).toBe("DECLARED");
  });

  it("refuse la déclaration sur l'exploitation d'un autre producteur", async () => {
    const actor = await loadActor(userId);
    const result = await declareHarvestOnline(actor, {
      parcelCropId: other.parcelCrop,
      declaredQuantity: 3,
      unit: "BASIN",
    });
    applied.push(result.id);
    expect(result).toMatchObject({ outcome: "REJECTED", error: { code: "FORBIDDEN" } });
    expect(
      await prisma.productionDeclaration.count({ where: { parcelCropId: other.parcelCrop } }),
    ).toBe(0);
    expect(await prisma.farmEvent.count({ where: { farmId: other.farm } })).toBe(0);
  });
});
