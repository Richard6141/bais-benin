import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { queueExposedParcels } from "@/database/sql/burned-area.sql";
import { insertFireDetections } from "@/database/sql/fires.sql";
import { measureBurnAssessments, queueBurnAssessmentsForFarm } from "@/modules/fires";
import { MonitoringBusyError } from "@/modules/monitoring/lock";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";
import {
  RemoteSensingProviderError,
  type BurnSeverityResult,
  type RemoteSensingProvider,
} from "@/services/ports/remote-sensing-provider";

// Surface brûlée des parcelles exposées (ADR-0038 §2) sur la vraie base : une parcelle de
// démonstration (contour inventé) et sa copie réelle (contour relevé sur place), un feu à 200 m il
// y a 20 jours. Lectures réelles sur la parcelle réelle seulement, fixture sur la parcelle de
// démonstration seulement ; plafond du mois ; deux lectures en échec au plus ; un seul passage à
// la fois ; expiration après 30 jours.

const since = new Date(Date.now() - 60_000);
const now = new Date();
const DAY = 86_400_000;
let demo: { id: string; farmId: string; lon: number; lat: number };
let realParcelId: string;
let requester: string;

/** Fournisseur de test : 35 % de la parcelle brûlée, 0,09 unité par lecture. */
function stub(
  id: "fixture" | "cdse",
  classPixels: BurnSeverityResult["classPixels"],
  delayMs = 0,
): RemoteSensingProvider {
  return {
    ...createFixtureRemoteSensingProvider(),
    id,
    burnSeverity: async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { classPixels, processingUnits: 0.09 };
    },
  } as RemoteSensingProvider;
}

function failing(): RemoteSensingProvider {
  return {
    ...createFixtureRemoteSensingProvider(),
    id: "cdse",
    burnSeverity: async () => {
      throw new RemoteSensingProviderError("Copernicus indisponible", true, 503);
    },
  } as RemoteSensingProvider;
}

async function statusOf(parcelId: string) {
  return prisma.burnAssessment.findFirstOrThrow({
    where: { parcelId, createdAt: { gte: since } },
    orderBy: { fireDetectedAt: "asc" },
    include: { damageDeclaration: true },
  });
}

/** Mesure en attente, prête à lire, pour un feu à une date donnée. */
async function pending(parcelId: string, daysAgo: number) {
  return prisma.burnAssessment.create({
    data: {
      parcelId,
      fireDetectedAt: new Date(now.getTime() - daysAgo * DAY),
      fireDistanceM: 200,
      trigger: "REQUEST",
      measureAfter: new Date(now.getTime() - (daysAgo - 15) * DAY),
      expiresAt: new Date(now.getTime() + (30 - daysAgo) * DAY),
    },
  });
}

describe("surface brûlée des parcelles exposées", () => {
  beforeAll(async () => {
    const [row] = await prisma.$queryRaw<
      { id: string; farm_id: string; lon: number; lat: number }[]
    >`
      SELECT p."id"::text AS id, p."farm_id"::text AS farm_id,
             ST_X(ST_Centroid(p."geom"::geometry)) AS lon, ST_Y(ST_Centroid(p."geom"::geometry)) AS lat
        FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id" AND f."archived_at" IS NULL
       WHERE p."archived_at" IS NULL AND p."geom" IS NOT NULL AND ST_Area(p."geom") >= 5000
         AND p."reliability" = 'SYNTHETIC'
         AND NOT EXISTS (SELECT 1 FROM "burn_assessment" b WHERE b."parcel_id" = p."id")
       ORDER BY p."code" LIMIT 1`;
    demo = { id: row!.id, farmId: row!.farm_id, lon: row!.lon, lat: row!.lat };
    // Copie réelle de la parcelle : même contour, relevé sur place par un agent.
    const [copy] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "parcel" ("id", "code", "farm_id", "geom", "centroid", "declared_area_ha",
        "computed_area_ha", "capture_method", "gps_accuracy_m", "irrigation", "soil_type",
        "version", "source_id", "source_date", "reliability", "created_at", "updated_at")
      SELECT gen_random_uuid(), p."code" || '-REEL', p."farm_id", p."geom", p."centroid",
             p."declared_area_ha", p."computed_area_ha", p."capture_method", p."gps_accuracy_m",
             p."irrigation", p."soil_type", 1, p."source_id", p."source_date", 'FIELD_VERIFIED',
             now(), now()
        FROM "parcel" p WHERE p."id" = ${demo.id}::uuid
      RETURNING "id"::text AS id`;
    realParcelId = copy!.id;
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
        latitude: demo.lat,
        longitude: demo.lon + 0.0018,
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
    await prisma.parcel.deleteMany({ where: { id: realParcelId } });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("ne met en file pour une lecture réelle que la parcelle réelle", async () => {
    const queued = await queueExposedParcels({
      since: new Date(now.getTime() - 30 * DAY),
      exposureM: 500,
      minAreaM2: 2500,
      measureAfterDays: 15,
      expireDays: 30,
      trigger: "REQUEST",
      requestedById: requester,
      farmId: demo.farmId,
      realOnly: true,
    });
    try {
      const rows = await prisma.burnAssessment.findMany({
        where: { id: { in: queued } },
        select: { parcelId: true, parcel: { select: { reliability: true } } },
      });
      expect(rows.some((row) => row.parcelId === realParcelId)).toBe(true);
      expect(rows.every((row) => row.parcel.reliability !== "SYNTHETIC")).toBe(true);
    } finally {
      await prisma.burnAssessment.deleteMany({ where: { id: { in: queued } } });
    }
  });

  it("met chaque parcelle exposée en file une seule fois, à mesurer 15 jours après le feu", async () => {
    expect(await queueBurnAssessmentsForFarm(demo.farmId, requester, now)).toBeGreaterThanOrEqual(
      2,
    );
    expect(await queueBurnAssessmentsForFarm(demo.farmId, requester, now)).toBe(0);
    const row = await statusOf(demo.id);
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
    expect((await statusOf(realParcelId)).status).toBe("PENDING");
  });

  it("en fixture, ne mesure que la parcelle de démonstration", async () => {
    const result = await measureBurnAssessments({
      provider: stub("fixture", [0, 60, 5, 30, 5]),
      limit: 50,
      now,
    });
    expect(result.measured).toBeGreaterThanOrEqual(1);
    const synthetic = await statusOf(demo.id);
    expect(synthetic.status).toBe("MEASURED");
    // 35 brûlés sur 100 pixels nets, 40 avec les possibles.
    expect(Number(synthetic.burnedShareLow)).toBeCloseTo(0.35, 4);
    expect(Number(synthetic.burnedShareHigh)).toBeCloseTo(0.4, 4);
    expect(synthetic.reliability).toBe("SYNTHETIC");
    expect(synthetic.damageDeclaration).toMatchObject({ status: "PROPOSED" });
    // Aucune déclaration inventée sur la parcelle réelle.
    const real = await statusOf(realParcelId);
    expect(real.status).toBe("PENDING");
    expect(real.damageDeclaration).toBeNull();
  });

  it("en lecture réelle, ne mesure que la parcelle réelle, et compte les unités", async () => {
    const result = await measureBurnAssessments({
      provider: stub("cdse", [0, 60, 5, 30, 5]),
      limit: 50,
      now,
      monthlyUnitCap: 1_000,
    });
    expect(result.measured).toBe(1);
    expect(result.processingUnits).toBeCloseTo(0.09, 4);
    const real = await statusOf(realParcelId);
    expect(real.status).toBe("MEASURED");
    expect(Number(real.processingUnits)).toBeCloseTo(0.09, 4);
    expect(real.damageDeclaration).toMatchObject({ status: "PROPOSED" });
  });

  it("sort de la file une parcelle dont la lecture échoue deux fois", async () => {
    const row = await pending(realParcelId, 18);
    const first = await measureBurnAssessments({ provider: failing(), limit: 50, now });
    expect(first).toMatchObject({ errors: 1, failed: 0 });
    expect(await prisma.burnAssessment.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: "PENDING",
      attempts: 1,
    });
    const second = await measureBurnAssessments({ provider: failing(), limit: 50, now });
    expect(second).toMatchObject({ errors: 1, failed: 1 });
    expect(await prisma.burnAssessment.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: "FAILED",
      attempts: 2,
    });
    const third = await measureBurnAssessments({ provider: failing(), limit: 50, now });
    expect(third.errors).toBe(0);
  });

  it("ne laisse passer qu'un passage à la fois", async () => {
    const row = await pending(demo.id, 19);
    const runs = await Promise.allSettled([
      measureBurnAssessments({ provider: stub("fixture", [0, 60, 5, 30, 5], 400), limit: 50, now }),
      measureBurnAssessments({ provider: stub("fixture", [0, 60, 5, 30, 5], 400), limit: 50, now }),
    ]);
    expect(runs.filter((run) => run.status === "fulfilled")).toHaveLength(1);
    const refused = runs.find((run) => run.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(MonitoringBusyError);
    const measured = await prisma.burnAssessment.findUniqueOrThrow({
      where: { id: row.id },
      include: { damageDeclaration: true },
    });
    expect(measured.status).toBe("MEASURED");
    expect(measured.attempts).toBe(1);
  });

  it("expire une mesure qui n'a pas pu être faite dans les 30 jours", async () => {
    const stale = await prisma.burnAssessment.create({
      data: {
        parcelId: demo.id,
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
