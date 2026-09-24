import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { getCommuneStats, getDepartementStats, getNationalStats } from "@/modules/analytics";

// Jeu de données de test : deux agriculteurs, trois exploitations (deux à Djougou, une à Parakou),
// une parcelle par exploitation, maïs sur la campagne 2026-2027 à Djougou, coton à Parakou.
// Tout est marqué SYNTHETIC et supprimé en fin de suite.

const DJOUGOU = "BJ-DON-003";
const PARAKOU = "BJ-BOR-005";
const CAMPAIGN = "2026-2027";
const provenance = {
  sourceId: "BAIS_SEED",
  sourceDate: new Date(),
  reliability: "SYNTHETIC",
} as const;

const created = { farmerIds: [] as string[], farmIds: [] as string[], parcelIds: [] as string[] };

// Le seed charge un registre synthétique. Pour raisonner sur des comptes exacts, la suite
// archive ces exploitations avec une date repère, puis les restaure : les agrégats ignorent
// les lignes archivées.
const PARKED_AT = new Date("1900-01-01T00:00:00Z");

describe("agrégats territoriaux", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await prisma.farm.updateMany({
      where: { sourceId: "BAIS_SEED", archivedAt: null },
      data: { archivedAt: PARKED_AT },
    });
  }, 180_000);

  afterAll(async () => {
    await prisma.farm.updateMany({ where: { archivedAt: PARKED_AT }, data: { archivedAt: null } });
    await prisma.parcelCrop.deleteMany({ where: { parcelId: { in: created.parcelIds } } });
    await prisma.parcel.deleteMany({ where: { id: { in: created.parcelIds } } });
    await prisma.farm.deleteMany({ where: { id: { in: created.farmIds } } });
    await prisma.farmer.deleteMany({ where: { id: { in: created.farmerIds } } });
    await prisma.$disconnect();
  });

  it("renvoie des zéros et les 77 communes sans exploitation active", async () => {
    const communes = await getCommuneStats();
    expect(communes.items).toHaveLength(77);
    expect(communes.items.every((c) => c.farmCount === 0 && c.cropCodes.length === 0)).toBe(true);
    expect(communes.provenance.reliability).toBe("DECLARED");

    const departements = await getDepartementStats();
    expect(departements.items).toHaveLength(12);
    expect(departements.items.reduce((sum, d) => sum + d.communeCount, 0)).toBe(77);
    expect(departements.items.every((d) => d.farmCount === 0)).toBe(true);

    const national = await getNationalStats();
    expect(national).toMatchObject({
      farmCount: 0,
      farmerCount: 0,
      declaredAreaHa: 0,
      verifiedShare: 0,
      communeCountWithFarms: 0,
    });
  });

  it("compte les exploitations, les agriculteurs, les surfaces et la part vérifiée", async () => {
    const djougou = await prisma.commune.findUniqueOrThrow({ where: { code: DJOUGOU } });
    const parakou = await prisma.commune.findUniqueOrThrow({ where: { code: PARAKOU } });
    const campaign = await prisma.agriculturalCampaign.findUniqueOrThrow({
      where: { code: CAMPAIGN },
    });
    const maize = await prisma.crop.findUniqueOrThrow({ where: { code: "MAIZE" } });
    const cotton = await prisma.crop.findUniqueOrThrow({ where: { code: "COTTON" } });

    const farmerA = await prisma.farmer.create({
      data: {
        code: "BJ-F-STATS00001",
        firstName: "Adjoua",
        lastName: "Stats",
        communeId: djougou.id,
        ...provenance,
      },
    });
    const farmerB = await prisma.farmer.create({
      data: {
        code: "BJ-F-STATS00002",
        firstName: "Bio",
        lastName: "Stats",
        communeId: parakou.id,
        ...provenance,
      },
    });
    created.farmerIds.push(farmerA.id, farmerB.id);

    const farms = [
      {
        code: "BJ-DON-DJO-STAT01",
        farmerId: farmerA.id,
        communeId: djougou.id,
        area: 2.5,
        status: "FIELD_VERIFIED",
        crop: maize.id,
      },
      {
        code: "BJ-DON-DJO-STAT02",
        farmerId: farmerA.id,
        communeId: djougou.id,
        area: 1.5,
        status: "DECLARED",
        crop: maize.id,
      },
      {
        code: "BJ-BOR-PAR-STAT03",
        farmerId: farmerB.id,
        communeId: parakou.id,
        area: 4,
        status: "AGENT_VERIFIED",
        crop: cotton.id,
      },
    ] as const;

    for (const spec of farms) {
      const farm = await prisma.farm.create({
        data: {
          code: spec.code,
          farmerId: spec.farmerId,
          communeId: spec.communeId,
          declaredAreaHa: spec.area,
          verificationStatus: spec.status,
          ...provenance,
        },
      });
      created.farmIds.push(farm.id);
      const parcel = await prisma.parcel.create({
        data: {
          code: `${spec.code}-P1`,
          farmId: farm.id,
          declaredAreaHa: spec.area,
          ...provenance,
        },
      });
      created.parcelIds.push(parcel.id);
      await prisma.parcelCrop.create({
        data: {
          parcelId: parcel.id,
          cropId: spec.crop,
          campaignId: campaign.id,
          areaHa: spec.area,
          ...provenance,
        },
      });
    }

    const national = await getNationalStats();
    expect(national.farmCount).toBe(3);
    expect(national.farmerCount).toBe(2);
    expect(national.declaredAreaHa).toBeCloseTo(8, 6);
    expect(national.verifiedShare).toBeCloseTo(2 / 3, 6);
    expect(national.communeCountWithFarms).toBe(2);
    expect(national.provenance.reliability).toBe("DECLARED");

    const communes = await getCommuneStats();
    const djougouStats = communes.items.find((c) => c.communeCode === DJOUGOU);
    const parakouStats = communes.items.find((c) => c.communeCode === PARAKOU);
    expect(djougouStats).toMatchObject({
      communeName: "Djougou",
      departementCode: "BJ-DO",
      farmCount: 2,
      farmerCount: 1,
      declaredAreaHa: 4,
      verifiedShare: 0.5,
      cropCodes: ["MAIZE"],
      reliability: "DECLARED",
    });
    expect(parakouStats).toMatchObject({
      farmCount: 1,
      farmerCount: 1,
      verifiedShare: 1,
      cropCodes: ["COTTON"],
      reliability: "FIELD_VERIFIED",
    });
    expect(communes.items.filter((c) => c.farmCount > 0)).toHaveLength(2);
  });

  it("filtre par culture, par département, par campagne et par statut", async () => {
    const maize = await getCommuneStats({ cropCode: "MAIZE" });
    expect(maize.items.filter((c) => c.farmCount > 0).map((c) => c.communeCode)).toEqual([DJOUGOU]);
    expect(maize.items.find((c) => c.communeCode === PARAKOU)?.farmCount).toBe(0);

    const donga = await getCommuneStats({ departementCode: "BJ-DO" });
    expect(donga.items).toHaveLength(4);
    expect(donga.items.every((c) => c.departementCode === "BJ-DO")).toBe(true);
    expect(donga.provenance.farmCount).toBe(2);

    const dongaDepartement = await getDepartementStats({ departementCode: "BJ-DO" });
    expect(dongaDepartement.items).toHaveLength(1);
    expect(dongaDepartement.items[0]).toMatchObject({
      departementCode: "BJ-DO",
      communeCount: 4,
      farmCount: 2,
      farmerCount: 1,
      cropCodes: ["MAIZE"],
    });

    const otherCampaign = await getNationalStats({ campaignCode: "2024-2025" });
    expect(otherCampaign.farmCount).toBe(0);
    const thisCampaign = await getNationalStats({ campaignCode: CAMPAIGN, cropCode: "COTTON" });
    expect(thisCampaign.farmCount).toBe(1);
    expect(thisCampaign.communeCountWithFarms).toBe(1);

    const verifiedOnly = await getNationalStats({ verificationStatus: "FIELD_VERIFIED" });
    expect(verifiedOnly.farmCount).toBe(1);
    expect(verifiedOnly.verifiedShare).toBe(1);
  });
});
