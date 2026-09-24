import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData, type SeedSummary } from "@/database/seed";
import { checkCommuneDepartementContainment } from "@/database/sql/territory.sql";
import { listCommunes, listDepartements, locateCommune, searchCommunes } from "@/modules/territory";

// Le seed est idempotent : le lancer ici garantit un état connu quel que soit l'ordre des tests.

describe("référentiels et territoire", () => {
  let summary: SeedSummary;

  beforeAll(async () => {
    summary = await seedReferenceData();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("charge les volumes attendus", () => {
    expect(summary).toEqual({
      dataSources: 7,
      zones: 8,
      departements: 12,
      communes: 77,
      crops: 21,
      campaigns: 4,
      demoAccounts: 5,
    });
  });

  it("est idempotent : relancer le seed ne duplique rien", async () => {
    await seedReferenceData();
    expect(await prisma.commune.count()).toBe(77);
    expect(await prisma.departement.count()).toBe(12);
    expect(await prisma.crop.count()).toBe(21);
  });

  it("relie chaque commune à son département et à une zone agro-écologique", async () => {
    const departements = await listDepartements();
    expect(departements.reduce((sum, d) => sum + d.communeCount, 0)).toBe(77);
    expect(departements.find((d) => d.code === "BJ-DO")?.communeCount).toBe(4);
    const communes = await listCommunes();
    expect(communes.every((c) => c.zoneCode !== null)).toBe(true);
  });

  it("stocke des géométries valides avec centroïde et surface", async () => {
    const rows = await prisma.$queryRaw<{ missing: bigint; invalid: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "geom" IS NULL OR "centroid" IS NULL OR "area_km2" IS NULL) AS missing,
        COUNT(*) FILTER (WHERE NOT ST_IsValid("geom"::geometry)) AS invalid
      FROM "commune"`;
    expect(Number(rows[0]?.missing)).toBe(0);
    expect(Number(rows[0]?.invalid)).toBe(0);

    // Le Bénin couvre environ 114 760 km² : la somme des départements doit s'en approcher.
    const total = await prisma.departement.aggregate({ _sum: { areaKm2: true } });
    expect(Number(total._sum.areaKm2)).toBeGreaterThan(110_000);
    expect(Number(total._sum.areaKm2)).toBeLessThan(120_000);
  });

  it("place le centroïde de chaque commune dans son département", async () => {
    const checks = await checkCommuneDepartementContainment();
    expect(checks).toHaveLength(77);
    expect(checks.filter((c) => !c.inside)).toEqual([]);
  });

  it("retrouve la commune d'un point GPS", async () => {
    // Centre-ville de Parakou.
    expect((await locateCommune(2.63, 9.34))?.name).toBe("Parakou");
    // Cotonou, place de l'Étoile Rouge.
    expect((await locateCommune(2.42, 6.37))?.name).toBe("Cotonou");
    // En mer, au large de Grand-Popo.
    expect(await locateCommune(1.8, 5.9)).toBeNull();
  });

  it("recherche une commune par libellé partiel ou alias", async () => {
    expect((await searchCommunes("djou")).map((c) => c.name)).toContain("Djougou");
    expect((await searchCommunes("Sèmè-Podji")).map((c) => c.name)).toContain("Sèmè-Kpodji");
    expect(await searchCommunes("x")).toEqual([]);
  });

  it("porte la provenance sur chaque référentiel", async () => {
    const commune = await prisma.commune.findFirstOrThrow({ include: { source: true } });
    expect(commune.source.id).toBe("GEOBOUNDARIES");
    expect(commune.reliability).toBe("OFFICIAL");
    const crop = await prisma.crop.findFirstOrThrow({ where: { code: "MAIZE" } });
    expect(crop.sourceId).toBe("BAIS_SEED");
    expect(crop.reliability).toBe("ESTIMATED");
    expect(crop.colorHex).toBe("#c99a2e");
  });

  it("marque la campagne 2026-2027 comme ouverte et 2027-2028 comme planifiée", async () => {
    const campaigns = await prisma.agriculturalCampaign.findMany({ orderBy: { startYear: "asc" } });
    expect(campaigns.map((c) => `${c.code}:${c.status}`)).toEqual([
      "2024-2025:CLOSED",
      "2025-2026:CLOSED",
      "2026-2027:OPEN",
      "2027-2028:PLANNED",
    ]);
  });

  it("respecte les contraintes relationnelles du registre", async () => {
    const commune = await prisma.commune.findFirstOrThrow({ where: { code: "BJ-DON-003" } });
    const farmer = await prisma.farmer.create({
      data: {
        code: "BJ-F-TEST000001",
        firstName: "Test",
        lastName: "Relation",
        communeId: commune.id,
        sourceId: "BAIS_SEED",
        sourceDate: new Date(),
        reliability: "SYNTHETIC",
      },
    });
    const farm = await prisma.farm.create({
      data: {
        code: "BJ-DON-DJO-TEST01",
        farmerId: farmer.id,
        communeId: commune.id,
        declaredAreaHa: 1.5,
        sourceId: "BAIS_SEED",
        sourceDate: new Date(),
        reliability: "SYNTHETIC",
      },
    });
    // Une exploitation ne peut pas pointer vers une commune inexistante.
    await expect(
      prisma.farm.create({
        data: {
          code: "BJ-XXX-XXX-TEST02",
          farmerId: farmer.id,
          communeId: "00000000-0000-7000-8000-000000000000",
          declaredAreaHa: 1,
          sourceId: "BAIS_SEED",
          sourceDate: new Date(),
          reliability: "SYNTHETIC",
        },
      }),
    ).rejects.toThrow();

    await prisma.farm.delete({ where: { id: farm.id } });
    await prisma.farmer.delete({ where: { id: farmer.id } });
  });
});
