import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import {
  purgeFieldReportPhotos,
  purgeFieldReports,
  purgeResolvedAssistanceRequests,
  purgeSatelliteTilesOutsideWindow,
  purgeWithdrawnRankingEntries,
} from "@/modules/privacy";
import { recentPeriods } from "@/modules/satellite";

// Durées de conservation des phases 0 à 2 (revue de sécurité R3, registre des traitements) :
// photos 1 an, signalements 3 ans, demandes 3 ans après résolution, lauréats jusqu'au retrait,
// images satellite hors de la fenêtre proposée. Tout ce que le test crée est retiré à la fin.

const now = new Date("2026-09-26T00:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ids = {
  oldReport: crypto.randomUUID(),
  photoReport: crypto.randomUUID(),
  recentReport: crypto.randomUUID(),
  oldResolved: crypto.randomUUID(),
  oldOpen: crypto.randomUUID(),
  ranking: crypto.randomUUID(),
};
let farm: { id: string; communeId: string; farmerId: string };
let userId: string;

async function report(id: string, createdAt: Date, withPhoto: boolean) {
  await prisma.fieldReport.create({
    data: {
      id,
      farmId: farm.id,
      communeId: farm.communeId,
      type: "PEST",
      description: "Signalement de test de conservation",
      locationSource: "NONE",
      observedAt: createdAt,
      reportedById: userId,
      createdAt,
      ...(withPhoto
        ? {
            photo: {
              create: {
                contentType: "image/webp",
                width: 1,
                height: 1,
                bytes: new Uint8Array([0]),
              },
            },
          }
        : {}),
    },
  });
}

describe("conservation des données des phases 0 à 2", () => {
  beforeAll(async () => {
    await seedReferenceData();
    farm = await prisma.farm.findFirstOrThrow({
      where: { archivedAt: null },
      select: { id: true, communeId: true, farmerId: true },
    });
    userId = (await prisma.user.findFirstOrThrow({ where: { phoneNumber: "+2290190000002" } })).id;
  }, 180_000);

  afterAll(async () => {
    await prisma.fieldReport.deleteMany({
      where: { id: { in: [ids.oldReport, ids.photoReport, ids.recentReport] } },
    });
    await prisma.assistanceRequest.deleteMany({
      where: { id: { in: [ids.oldResolved, ids.oldOpen] } },
    });
    await prisma.publishedRanking.deleteMany({ where: { id: ids.ranking } });
    await prisma.satelliteTile.deleteMany({ where: { tileKey: "test-conservation" } });
    await prisma.$disconnect();
  });

  it("retire les photos après 1 an et les signalements après 3 ans", async () => {
    await report(ids.oldReport, ago(4 * 365), false);
    await report(ids.photoReport, ago(400), true);
    await report(ids.recentReport, ago(10), true);

    expect(await purgeFieldReportPhotos(now)).toBeGreaterThanOrEqual(1);
    // Le signalement reste, sans sa photo ; la photo récente reste.
    expect(await prisma.fieldReport.findUnique({ where: { id: ids.photoReport } })).not.toBeNull();
    expect(await prisma.fieldReportPhoto.findUnique({ where: { reportId: ids.photoReport } })).toBe(
      null,
    );
    expect(
      await prisma.fieldReportPhoto.findUnique({ where: { reportId: ids.recentReport } }),
    ).not.toBeNull();

    expect(await purgeFieldReports(now)).toBeGreaterThanOrEqual(1);
    expect(await prisma.fieldReport.findUnique({ where: { id: ids.oldReport } })).toBeNull();
    expect(await prisma.fieldReport.findUnique({ where: { id: ids.photoReport } })).not.toBeNull();
  });

  it("retire une demande 3 ans après sa résolution, jamais une demande ouverte", async () => {
    const base = {
      requesterId: userId,
      communeId: farm.communeId,
      category: "ADVICE" as const,
      description: "Demande de test de conservation",
      createdAt: ago(5 * 365),
    };
    await prisma.assistanceRequest.createMany({
      data: [
        { ...base, id: ids.oldResolved, status: "RESOLVED", resolvedAt: ago(4 * 365) },
        { ...base, id: ids.oldOpen, status: "RECEIVED" },
      ],
    });
    expect(await purgeResolvedAssistanceRequests(now)).toBeGreaterThanOrEqual(1);
    expect(await prisma.assistanceRequest.findUnique({ where: { id: ids.oldResolved } })).toBe(
      null,
    );
    expect(await prisma.assistanceRequest.findUnique({ where: { id: ids.oldOpen } })).not.toBe(
      null,
    );
  });

  it("ne garde pas les lauréats d'un palmarès retiré", async () => {
    const ministry = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    await prisma.publishedRanking.create({
      data: {
        id: ids.ranking,
        title: "Palmarès de test retiré",
        cropCode: "COTTON",
        campaignCode: "2024-2025",
        metric: "production",
        verifiedOnly: true,
        requestedCount: 1,
        publishedById: ministry.id,
        withdrawnAt: ago(1),
        entries: {
          create: {
            rank: 1,
            farmerId: farm.farmerId,
            displayName: "Lauréat de test",
            communeName: "Commune",
            departementName: "Département",
            productionT: "1.000",
            areaHa: "1.000",
          },
        },
      },
    });
    expect(await purgeWithdrawnRankingEntries()).toBeGreaterThanOrEqual(1);
    expect(await prisma.publishedRankingEntry.count({ where: { rankingId: ids.ranking } })).toBe(0);
  });

  it("purge les images satellite des mois sortis de la fenêtre proposée", async () => {
    const [current] = recentPeriods(now);
    await prisma.satelliteTile.createMany({
      data: [
        { layer: "NDVI", period: "2020-01", tileKey: "test-conservation" },
        { layer: "NDVI", period: current!, tileKey: "test-conservation" },
      ],
      skipDuplicates: true,
    });
    expect(await purgeSatelliteTilesOutsideWindow(now)).toBeGreaterThanOrEqual(1);
    const left = await prisma.satelliteTile.findMany({ where: { tileKey: "test-conservation" } });
    expect(left.map((tile) => tile.period)).toEqual([current]);
  });
});
