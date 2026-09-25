import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { getCommuneStats, getDepartementStats, getNationalStats } from "@/modules/analytics";

// Jeu de données de test : deux agriculteurs, treize exploitations (huit à Djougou, cinq à
// Parakou), une parcelle par exploitation, maïs sur la campagne 2026-2027 à Djougou, coton à
// Parakou. Les effectifs par commune restent volontairement au-dessus de k=5 (K_ANONYMITY,
// modules/analytics/k-anonymity.ts) : en dessous, B3 masque désormais la ligne entière sur
// cette route publique, ce que couvre le dernier test de ce fichier avec un troisième groupe
// délibérément trop petit. Tout est marqué SYNTHETIC et supprimé en fin de suite.

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

async function plantFarm(spec: {
  code: string;
  farmerId: string;
  communeId: string;
  area: number;
  status: "DECLARED" | "AGENT_VERIFIED" | "FIELD_VERIFIED";
  cropId: string;
  campaignId: string;
}): Promise<void> {
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
    data: { code: `${spec.code}-P1`, farmId: farm.id, declaredAreaHa: spec.area, ...provenance },
  });
  created.parcelIds.push(parcel.id);
  await prisma.parcelCrop.create({
    data: {
      parcelId: parcel.id,
      cropId: spec.cropId,
      campaignId: spec.campaignId,
      areaHa: spec.area,
      ...provenance,
    },
  });
}

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
    expect(communes.items.every((c) => c.farmCount === 0 && c.cropCodes?.length === 0)).toBe(true);
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

    // Djougou : 8 exploitations de maïs (5 vérifiées sur le terrain, 3 déclarées) — le compte
    // reste au-dessus de k=5 même une fois filtré sur le seul statut FIELD_VERIFIED plus bas.
    for (let index = 0; index < 5; index += 1) {
      await plantFarm({
        code: `BJ-DON-DJO-STAT-FV${index}`,
        farmerId: farmerA.id,
        communeId: djougou.id,
        area: 2,
        status: "FIELD_VERIFIED",
        cropId: maize.id,
        campaignId: campaign.id,
      });
    }
    for (let index = 0; index < 3; index += 1) {
      await plantFarm({
        code: `BJ-DON-DJO-STAT-DE${index}`,
        farmerId: farmerA.id,
        communeId: djougou.id,
        area: 1,
        status: "DECLARED",
        cropId: maize.id,
        campaignId: campaign.id,
      });
    }
    // Parakou : 5 exploitations de coton, toutes vérifiées par un agent.
    for (let index = 0; index < 5; index += 1) {
      await plantFarm({
        code: `BJ-BOR-PAR-STAT${index}`,
        farmerId: farmerB.id,
        communeId: parakou.id,
        area: 4,
        status: "AGENT_VERIFIED",
        cropId: cotton.id,
        campaignId: campaign.id,
      });
    }

    const national = await getNationalStats();
    expect(national.farmCount).toBe(13);
    expect(national.farmerCount).toBe(2);
    expect(national.declaredAreaHa).toBeCloseTo(33, 6);
    expect(national.verifiedShare).toBeCloseTo(10 / 13, 6);
    expect(national.communeCountWithFarms).toBe(2);
    expect(national.provenance.reliability).toBe("DECLARED");

    const communes = await getCommuneStats();
    const djougouStats = communes.items.find((c) => c.communeCode === DJOUGOU);
    const parakouStats = communes.items.find((c) => c.communeCode === PARAKOU);
    expect(djougouStats).toMatchObject({
      masked: false,
      communeName: "Djougou",
      departementCode: "BJ-DO",
      farmCount: 8,
      farmerCount: 1,
      declaredAreaHa: 13,
      verifiedShare: 0.625,
      cropCodes: ["MAIZE"],
      reliability: "DECLARED",
    });
    expect(parakouStats).toMatchObject({
      masked: false,
      farmCount: 5,
      farmerCount: 1,
      verifiedShare: 1,
      cropCodes: ["COTTON"],
      reliability: "FIELD_VERIFIED",
    });
    expect(communes.items.filter((c) => (c.farmCount ?? 0) > 0)).toHaveLength(2);
  });

  it("filtre par culture, par département, par campagne et par statut", async () => {
    const maize = await getCommuneStats({ cropCode: "MAIZE" });
    expect(maize.items.filter((c) => (c.farmCount ?? 0) > 0).map((c) => c.communeCode)).toEqual([
      DJOUGOU,
    ]);
    expect(maize.items.find((c) => c.communeCode === PARAKOU)?.farmCount).toBe(0);

    const donga = await getCommuneStats({ departementCode: "BJ-DO" });
    expect(donga.items).toHaveLength(4);
    expect(donga.items.every((c) => c.departementCode === "BJ-DO")).toBe(true);
    expect(donga.provenance.farmCount).toBe(8);

    const dongaDepartement = await getDepartementStats({ departementCode: "BJ-DO" });
    expect(dongaDepartement.items).toHaveLength(1);
    expect(dongaDepartement.items[0]).toMatchObject({
      masked: false,
      departementCode: "BJ-DO",
      communeCount: 4,
      farmCount: 8,
      farmerCount: 1,
      cropCodes: ["MAIZE"],
    });

    const otherCampaign = await getNationalStats({ campaignCode: "2024-2025" });
    expect(otherCampaign.farmCount).toBe(0);
    const thisCampaign = await getNationalStats({ campaignCode: CAMPAIGN, cropCode: "COTTON" });
    expect(thisCampaign.farmCount).toBe(5);
    expect(thisCampaign.communeCountWithFarms).toBe(1);

    const verifiedOnly = await getNationalStats({ verificationStatus: "FIELD_VERIFIED" });
    expect(verifiedOnly.farmCount).toBe(5);
    expect(verifiedOnly.verifiedShare).toBe(1);
  });

  it("masque un effectif trop petit (secret statistique, k=5) sur la route publique", async () => {
    // Une troisième commune, avec une seule exploitation : en dessous de K_ANONYMITY, la ligne
    // entière (effectifs, surface, cultures, fiabilité) doit disparaître, pas seulement être
    // arrondie — sinon une exploitation unique resterait reconnaissable dans sa commune.
    const natitingou = await prisma.commune.findUniqueOrThrow({ where: { code: "BJ-ALI-001" } });
    const farmerC = await prisma.farmer.create({
      data: {
        code: "BJ-F-STATS00003",
        firstName: "Kokou",
        lastName: "Isole",
        communeId: natitingou.id,
        ...provenance,
      },
    });
    created.farmerIds.push(farmerC.id);
    const maize = await prisma.crop.findUniqueOrThrow({ where: { code: "MAIZE" } });
    const campaign = await prisma.agriculturalCampaign.findUniqueOrThrow({
      where: { code: CAMPAIGN },
    });
    await plantFarm({
      code: "BJ-ATA-NAT-STATMASK",
      farmerId: farmerC.id,
      communeId: natitingou.id,
      area: 3,
      status: "DECLARED",
      cropId: maize.id,
      campaignId: campaign.id,
    });

    const communes = await getCommuneStats();
    const natitingouStats = communes.items.find((c) => c.communeCode === "BJ-ALI-001");
    expect(natitingouStats?.masked).toBe(true);
    expect(natitingouStats).toMatchObject({
      farmCount: null,
      farmerCount: null,
      declaredAreaHa: null,
      verifiedShare: null,
      cropCodes: null,
      reliability: null,
    });
    // La commune reste identifiable (on sait qu'elle existe), seuls ses effectifs sont cachés.
    expect(natitingouStats?.communeName).toBeTruthy();
  });
});
