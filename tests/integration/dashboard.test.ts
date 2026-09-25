import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import {
  exportAnalyticsCsv,
  getCommuneProfile,
  getCropProduction,
  getDashboardOverview,
  getTerritoryRanking,
  refreshAnalyticsIfStale,
} from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";

// Tableau de bord national sur la base réelle (registre de démonstration) : cohérence des vues
// matérialisées avec des comptes directs, rafraîchissement après écriture, périmètre et masquage
// pour un agent, export journalisé, rafraîchissements concurrents. La déclaration de récolte
// créée ici et les entrées d'audit d'export sont retirées à la fin, puis les vues rafraîchies.

const DJOUGOU = "BJ-DON-003";
let ministry: Actor;
let agent: Actor;
let declarationId: string | null = null;
const exportAuditSince = new Date();

describe("tableau de bord national", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    ministry = await loadActor(ministryUser.id);
    const agentUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000001" },
    });
    agent = await loadActor(agentUser.id);
    await refreshAnalyticsIfStale({ force: true });
  }, 240_000);

  afterAll(async () => {
    if (declarationId) await prisma.productionDeclaration.delete({ where: { id: declarationId } });
    await prisma.auditLog.deleteMany({
      where: { action: "analytics.export", occurredAt: { gte: exportAuditSince } },
    });
    await refreshAnalyticsIfStale({ force: true });
    await prisma.$disconnect();
  });

  it("donne les mêmes chiffres que des comptes directs sur le registre", async () => {
    const overview = await getDashboardOverview(ministry, {});
    const farms = await prisma.farm.aggregate({
      where: { archivedAt: null },
      _count: true,
      _sum: { declaredAreaHa: true },
    });
    expect(overview.figures.farmCount).toBe(farms._count);
    expect(overview.figures.declaredAreaHa).toBeCloseTo(Number(farms._sum.declaredAreaHa ?? 0), 3);
    const farmers = await prisma.farm.findMany({
      where: { archivedAt: null },
      distinct: ["farmerId"],
      select: { farmerId: true },
    });
    expect(overview.figures.farmerCount).toBe(farmers.length);
    expect(overview.provenance.refreshedAt).not.toBeNull();

    const maize = await getDashboardOverview(ministry, { cropCode: "MAIZE" });
    const maizeFarms = await prisma.farm.count({
      where: {
        archivedAt: null,
        parcels: {
          some: {
            archivedAt: null,
            crops: {
              some: {
                archivedAt: null,
                crop: { code: "MAIZE" },
                campaign: { code: overview.campaign.code },
              },
            },
          },
        },
      },
    });
    expect(maize.figures.farmCount).toBe(maizeFarms);
  });

  it("intègre une récolte déclarée au rafraîchissement suivant", async () => {
    const parcelCrop = await prisma.parcelCrop.findFirstOrThrow({
      where: {
        archivedAt: null,
        crop: { code: "MAIZE" },
        campaign: { status: "OPEN" },
        parcel: { archivedAt: null, farm: { archivedAt: null } },
      },
      select: { id: true },
    });
    const before = await getCropProduction(ministry, {});
    const maizeBefore = before.rows.find((r) => r.cropCode === "MAIZE");
    const declaration = await prisma.productionDeclaration.create({
      data: {
        parcelCropId: parcelCrop.id,
        declaredQuantity: 1250,
        unit: "KG",
        quantityKg: 1250,
        declaredOn: new Date(),
        declaredBy: "AGENT",
        sourceId: "BAIS_SEED",
        sourceDate: new Date(),
        reliability: "DECLARED",
      },
    });
    declarationId = declaration.id;

    const refresh = await refreshAnalyticsIfStale();
    expect(refresh).toMatchObject({ refreshed: true, reason: "changed" });
    const after = await getCropProduction(ministry, {});
    const maize = after.rows.find((r) => r.cropCode === "MAIZE");
    expect(maize?.declaredHarvestCount).toBe((maizeBefore?.declaredHarvestCount ?? 0) + 1);
    expect(maize?.productionT).toBeCloseTo((maizeBefore?.productionT ?? 0) + 1.25, 6);
    expect(maize?.yieldTPerHa).not.toBeNull();
    expect((await refreshAnalyticsIfStale()).reason).toBe("fresh");
  });

  it("restreint l'agent à ses communes et masque les petits effectifs", async () => {
    const overview = await getDashboardOverview(agent, {});
    const djougouFarms = await prisma.farm.count({
      where: { archivedAt: null, commune: { code: DJOUGOU } },
    });
    expect(overview.figures.farmCount).toBe(djougouFarms);

    const crops = await getCropProduction(agent, {});
    for (const row of crops.rows) {
      if (row.masked) {
        expect(row).toMatchObject({ farmCount: null, areaHa: null, verifiedShare: null });
      } else {
        expect(row.farmCount === 0 || (row.farmCount ?? 0) >= 5).toBe(true);
      }
    }
    expect(crops.rows.filter((r) => r.masked).length).not.toBe(1);

    await expect(getTerritoryRanking(agent, { level: "departement" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getCommuneProfile(agent, "BJ-LIT-001", {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const own = await getCommuneProfile(agent, DJOUGOU, {});
    expect(own.comparison).toBeNull();
    expect(own.fieldCoverage.agents.every((a) => /^Agent \d+$/.test(a.label))).toBe(true);
  });

  it("classe les départements avec une ligne Bénin cohérente", async () => {
    const ranking = await getTerritoryRanking(ministry, { level: "departement" });
    expect(ranking.rows).toHaveLength(12);
    const visible = ranking.rows.reduce((sum, r) => sum + (r.farmCount ?? 0), 0);
    expect(visible).toBeLessThanOrEqual(ranking.total.farmCount ?? 0);
    expect(ranking.rows[0]?.rank).toBe(1);
    expect(ranking.total.name).toBe("Bénin");
  });

  it("exporte un CSV français masqué et journalise l'export", async () => {
    const file = await exportAnalyticsCsv(agent, "indicators", {});
    expect(file.content.charCodeAt(0)).toBe(0xfeff);
    const [header, ...lines] = file.content.slice(1).trim().split("\r\n");
    expect(header?.split(";")).toContain("masque_k");
    expect(lines.length).toBe(file.rows);
    // Agent : ses communes seulement, ni pays ni départements.
    expect(lines.every((l) => l.startsWith("commune;BJ-DON-003;"))).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "analytics.export", actorId: agent.userId },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit.details).toMatchObject({ kind: "indicators", rows: file.rows });
  });

  it("n'exécute jamais deux rafraîchissements à la fois", async () => {
    const [a, b] = await Promise.all([
      refreshAnalyticsIfStale({ force: true }),
      refreshAnalyticsIfStale({ force: true }),
    ]);
    expect([a.reason, b.reason].sort()).toEqual(["busy", "forced"]);
    // Les lectures restent possibles pendant un rafraîchissement concurrent.
    const [reading] = await Promise.all([
      getDashboardOverview(ministry, {}),
      refreshAnalyticsIfStale({ force: true }),
    ]);
    expect(reading.figures.farmCount).toBeGreaterThan(0);
  }, 60_000);
});
