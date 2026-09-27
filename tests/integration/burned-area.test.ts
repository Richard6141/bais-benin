import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { queueExposedParcels } from "@/database/sql/burned-area.sql";
import { insertFireDetections } from "@/database/sql/fires.sql";
import { measureBurnAssessments, queueBurnAssessmentsForFarm } from "@/modules/fires";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";
import type {
  BurnSeverityResult,
  RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";

// Surface brûlée des parcelles exposées (ADR-0038 §2) sur la vraie base : une parcelle au
// contour relevé, un feu à 200 m il y a 20 jours ; mise en file à la demande (une seule fois),
// parcelles de démonstration écartées des lectures réelles, mesure qui propose une déclaration de
// sinistre, plafond mensuel des lectures payantes, expiration après 30 jours.

const since = new Date(Date.now() - 60_000);
const now = new Date();
const DAY = 86_400_000;
let parcel: { id: string; farmId: string; lon: number; lat: number; reliability: string };
let requester: string;

/** Fournisseur de test : un tiers de la parcelle brûlé, 0,09 unité par lecture. */
function stub(id: "fixture" | "cdse", classPixels: BurnSeverityResult["classPixels"]) {
  const fixture = createFixtureRemoteSensingProvider();
  return {
    ...fixture,
    id,
    burnSeverity: async () => ({ classPixels, processingUnits: 0.09 }),
  } as RemoteSensingProvider;
}

describe("surface brûlée des parcelles exposées", () => {
  beforeAll(async () => {
    const [row] = await prisma.$queryRaw<
      { id: string; farm_id: string; lon: number; lat: number; reliability: string }[]
    >`
      SELECT p."id"::text AS id, p."farm_id"::text AS farm_id, p."reliability"::text AS reliability,
             ST_X(ST_Centroid(p."geom"::geometry)) AS lon, ST_Y(ST_Centroid(p."geom"::geometry)) AS lat
        FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
       WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL AND ST_Area(p."geom") >= 5000
         AND NOT EXISTS (SELECT 1 FROM "burn_assessment" b WHERE b."parcel_id" = p."id")
       ORDER BY p."code" LIMIT 1`;
    parcel = {
      id: row!.id,
      farmId: row!.farm_id,
      lon: row!.lon,
      lat: row!.lat,
      reliability: row!.reliability,
    };
    const user = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000001" },
      select: { id: true },
    });
    requester = user.id;
    // Un feu à environ 200 m à l'est du centre de la parcelle, il y a 20 jours.
    await insertFireDetections([
      {
        id: crypto.randomUUID(),
        detectedAt: new Date(now.getTime() - 20 * DAY),
        latitude: parcel.lat,
        longitude: parcel.lon + 0.0018,
        sensors: ["VIIRS_SNPP"],
        confidence: "HIGH",
        frpMw: 12,
        brightnessK: 340,
        daynight: "D",
        sourceKeys: ["test-surface-brulee"],
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    const assessments = await prisma.burnAssessment.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true },
    });
    const ids = assessments.map((row) => row.id);
    await prisma.damageDeclaration.deleteMany({ where: { burnAssessmentId: { in: ids } } });
    await prisma.burnAssessment.deleteMany({ where: { id: { in: ids } } });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("écarte les parcelles de démonstration des lectures réelles", async () => {
    const queued = await queueExposedParcels({
      since: new Date(now.getTime() - 30 * DAY),
      exposureM: 500,
      minAreaM2: 2500,
      measureAfterDays: 15,
      expireDays: 30,
      trigger: "REQUEST",
      requestedById: requester,
      farmId: parcel.farmId,
      realOnly: true,
    });
    try {
      // Parcelles de démonstration (contour inventé, même noté « relevé GPS ») : jamais en file
      // pour une lecture réelle.
      const rows = await prisma.burnAssessment.findMany({
        where: { id: { in: queued } },
        select: { parcel: { select: { reliability: true } } },
      });
      expect(rows.every((row) => row.parcel.reliability !== "SYNTHETIC")).toBe(true);
      if (parcel.reliability === "SYNTHETIC") {
        expect(rows.some((row) => row.parcel.reliability === "SYNTHETIC")).toBe(false);
      }
    } finally {
      await prisma.burnAssessment.deleteMany({ where: { id: { in: queued } } });
    }
  });

  it("met la parcelle exposée en file une seule fois, à mesurer 15 jours après le feu", async () => {
    expect(await queueBurnAssessmentsForFarm(parcel.farmId, requester, now)).toBeGreaterThanOrEqual(
      1,
    );
    expect(await queueBurnAssessmentsForFarm(parcel.farmId, requester, now)).toBe(0);
    const row = await prisma.burnAssessment.findFirstOrThrow({
      where: { parcelId: parcel.id, createdAt: { gte: since } },
    });
    expect(row).toMatchObject({ status: "PENDING", trigger: "REQUEST", requestedById: requester });
    expect(row.fireDistanceM).toBeLessThan(500);
    expect(row.measureAfter.getTime() - row.fireDetectedAt.getTime()).toBe(15 * DAY);
    expect(row.expiresAt.getTime() - row.fireDetectedAt.getTime()).toBe(30 * DAY);
  });

  it("n'appelle pas Copernicus au-delà du plafond du mois", async () => {
    const result = await measureBurnAssessments({
      provider: stub("cdse", [0, 60, 5, 30, 5]),
      limit: 50,
      now,
      monthlyUnitCap: 0,
    });
    expect(result).toMatchObject({ stopped: "monthly-cap", measured: 0 });
    const row = await prisma.burnAssessment.findFirstOrThrow({
      where: { parcelId: parcel.id, createdAt: { gte: since } },
      select: { status: true },
    });
    expect(row.status).toBe("PENDING");
  });

  it("mesure la surface brûlée et propose une déclaration de sinistre", async () => {
    const result = await measureBurnAssessments({
      provider: stub("fixture", [0, 60, 5, 30, 5]),
      limit: 50,
      now,
    });
    expect(result.measured).toBeGreaterThanOrEqual(1);
    expect(result.proposed).toBeGreaterThanOrEqual(1);
    const row = await prisma.burnAssessment.findFirstOrThrow({
      where: { parcelId: parcel.id, createdAt: { gte: since } },
      include: { damageDeclaration: true },
    });
    expect(row.status).toBe("MEASURED");
    // 35 brûlés sur 100 pixels nets, 40 avec les possibles.
    expect(Number(row.burnedShareLow)).toBeCloseTo(0.35, 4);
    expect(Number(row.burnedShareHigh)).toBeCloseTo(0.4, 4);
    expect(row.reliability).toBe("SYNTHETIC");
    expect(row.damageDeclaration).toMatchObject({ status: "PROPOSED", farmId: parcel.farmId });
    expect(Number(row.damageDeclaration!.estimatedLowHa)).toBeCloseTo(
      Number(row.burnedAreaLowHa),
      3,
    );
  });

  it("expire une mesure qui n'a pas pu être faite dans les 30 jours", async () => {
    const stale = await prisma.burnAssessment.create({
      data: {
        parcelId: parcel.id,
        fireDetectedAt: new Date(now.getTime() - 40 * DAY),
        fireDistanceM: 120,
        trigger: "REQUEST",
        measureAfter: new Date(now.getTime() - 25 * DAY),
        expiresAt: new Date(now.getTime() - 10 * DAY),
      },
    });
    const result = await measureBurnAssessments({
      provider: stub("fixture", [0, 100, 0, 0, 0]),
      limit: 50,
      now,
    });
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const row = await prisma.burnAssessment.findUniqueOrThrow({ where: { id: stale.id } });
    expect(row.status).toBe("EXPIRED");
  });
});
