import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  DamageError,
  exportDamageCsv,
  listDamageDeclarations,
  requestBurnAssessment,
} from "@/modules/fires";
import { loadActor } from "@/modules/identity";
import { applySyncBatch } from "@/modules/sync";

// Déclaration de sinistre après un feu (ADR-0038 §2) sur la vraie base : l'agent qui a enregistré
// l'exploitation la confirme hors ligne (une seconde commande identique est un doublon, une
// décision contraire est refusée) ; le ministère ne la révise pas mais l'exporte, avec trace au
// journal ; le producteur lit la sienne ; un producteur ne demande pas de mesure.

const since = new Date(Date.now() - 60_000);
const DEVICE = "test-device-sinistre";
const AT = "2026-12-28T10:00:00+01:00";
let declarationId: string;
let parcelId: string;
let farm: { id: string; registeredById: string; farmerUserId: string | null };

async function actorOf(userId: string) {
  return loadActor(userId);
}

function review(payload: Record<string, unknown>, deviceId = DEVICE) {
  const id = crypto.randomUUID();
  return {
    id,
    type: "damageDeclaration.review" as const,
    payload: { id: declarationId, reviewedAt: AT, ...payload },
    idempotencyKey: `it-${id}`,
    clientCreatedAt: AT,
    deviceId,
  };
}

/** Une déclaration proposée de plus, sur la même parcelle, pour un autre feu. */
async function proposedDeclaration(fireAt: string): Promise<string> {
  const assessment = await prisma.burnAssessment.create({
    data: {
      parcelId,
      fireDetectedAt: new Date(fireAt),
      fireDistanceM: 180,
      trigger: "REQUEST",
      status: "MEASURED",
      measureAfter: new Date(fireAt),
      expiresAt: new Date(fireAt),
      burnedAreaLowHa: 0.4,
      burnedAreaHighHa: 0.5,
      reliability: "ESTIMATED",
    },
  });
  const declaration = await prisma.damageDeclaration.create({
    data: {
      farmId: farm.id,
      parcelId,
      burnAssessmentId: assessment.id,
      occurredAt: assessment.fireDetectedAt,
      estimatedLowHa: 0.4,
      estimatedHighHa: 0.5,
    },
  });
  return declaration.id;
}

describe("déclaration de sinistre", () => {
  beforeAll(async () => {
    const [row] = await prisma.$queryRaw<
      {
        farm_id: string;
        registered_by_id: string;
        farmer_user_id: string | null;
        parcel_id: string;
      }[]
    >`
      SELECT f."id"::text AS farm_id, f."registered_by_id"::text AS registered_by_id,
             fa."user_id"::text AS farmer_user_id, p."id"::text AS parcel_id
        FROM "farm" f
        JOIN "farmer" fa ON fa."id" = f."farmer_id"
        JOIN "parcel" p ON p."farm_id" = f."id" AND p."archived_at" IS NULL
       WHERE f."archived_at" IS NULL AND f."registered_by_id" IS NOT NULL
       ORDER BY (fa."user_id" IS NOT NULL) DESC, f."code"
       LIMIT 1`;
    parcelId = row!.parcel_id;
    farm = {
      id: row!.farm_id,
      registeredById: row!.registered_by_id,
      farmerUserId: row!.farmer_user_id,
    };
    const assessment = await prisma.burnAssessment.create({
      data: {
        parcelId: row!.parcel_id,
        fireDetectedAt: new Date("2026-12-10T12:30:00Z"),
        fireDistanceM: 240,
        trigger: "ALERT",
        status: "MEASURED",
        measureAfter: new Date("2026-12-25T12:30:00Z"),
        expiresAt: new Date("2027-01-09T12:30:00Z"),
        burnedAreaLowHa: 0.6,
        burnedAreaHighHa: 0.9,
        reliability: "ESTIMATED",
        sourceId: "COPERNICUS_S2",
        measuredAt: new Date("2026-12-26T08:00:00Z"),
      },
    });
    const declaration = await prisma.damageDeclaration.create({
      data: {
        farmId: farm.id,
        parcelId: row!.parcel_id,
        burnAssessmentId: assessment.id,
        occurredAt: assessment.fireDetectedAt,
        estimatedLowHa: 0.6,
        estimatedHighHa: 0.9,
      },
    });
    declarationId = declaration.id;
  }, 120_000);

  afterAll(async () => {
    const assessments = await prisma.burnAssessment.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true },
    });
    const ids = assessments.map((entry) => entry.id);
    await prisma.damageDeclaration.deleteMany({ where: { burnAssessmentId: { in: ids } } });
    await prisma.burnAssessment.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("refuse la révision au ministère, qui ne la voit pas comme cible", async () => {
    const ministryUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000003" },
      select: { id: true },
    });
    const [result] = await applySyncBatch(await actorOf(ministryUser.id), DEVICE, [
      review({ decision: "CONFIRMED", observedAreaHa: 0.7 }),
    ]);
    expect(result?.outcome).toBe("REJECTED");
    expect(result?.error?.code).toBe("NOT_FOUND");
  });

  it("laisse l'agent qui a enregistré l'exploitation confirmer, une seule fois", async () => {
    const agent = await actorOf(farm.registeredById);
    const [applied] = await applySyncBatch(agent, DEVICE, [
      review({
        decision: "CONFIRMED",
        observedAreaHa: 0.7,
        cropCode: "MAIZE",
        cropStage: "GROWING",
      }),
    ]);
    expect(applied?.outcome).toBe("APPLIED");
    const stored = await prisma.damageDeclaration.findUniqueOrThrow({
      where: { id: declarationId },
      include: { crop: { select: { code: true } } },
    });
    expect(stored).toMatchObject({
      status: "CONFIRMED",
      cropStage: "GROWING",
      reviewedById: farm.registeredById,
      version: 2,
    });
    expect(Number(stored.observedAreaHa)).toBeCloseTo(0.7, 3);
    expect(stored.crop?.code).toBe("MAIZE");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "damage.declaration.reviewed", occurredAt: { gte: since } },
    });
    expect(audit).not.toBeNull();

    const [again] = await applySyncBatch(agent, DEVICE, [
      review({ decision: "CONFIRMED", observedAreaHa: 0.7 }),
    ]);
    expect(again?.outcome).toBe("DUPLICATE");
    const [contrary] = await applySyncBatch(agent, DEVICE, [
      review({ decision: "REJECTED", reason: "Brûlis volontaire" }),
    ]);
    expect(contrary?.outcome).toBe("REJECTED");
    expect(contrary?.error?.code).toBe("ALREADY_REVIEWED");
  });

  it("n'applique jamais deux décisions contraires venues de deux appareils", async () => {
    declarationId = await proposedDeclaration("2026-12-12T12:30:00Z");
    const agent = await actorOf(farm.registeredById);
    const [confirm, reject] = await Promise.all([
      applySyncBatch(agent, "appareil-a", [
        review({ decision: "CONFIRMED", observedAreaHa: 0.4 }, "appareil-a"),
      ]),
      applySyncBatch(agent, "appareil-b", [
        review({ decision: "REJECTED", reason: "Brûlis volontaire" }, "appareil-b"),
      ]),
    ]);
    const outcomes = [confirm[0]!, reject[0]!];
    expect(outcomes.filter((result) => result.outcome === "APPLIED")).toHaveLength(1);
    const refused = outcomes.find((result) => result.outcome !== "APPLIED")!;
    expect(refused.outcome).toBe("REJECTED");
    expect(refused.error?.code).toBe("ALREADY_REVIEWED");
    const stored = await prisma.damageDeclaration.findUniqueOrThrow({
      where: { id: declarationId },
    });
    expect(stored.version).toBe(2);
    expect(["CONFIRMED", "REJECTED"]).toContain(stored.status);
  });

  it("montre la déclaration au producteur et l'exporte pour le ministère", async () => {
    if (farm.farmerUserId) {
      const mine = await listDamageDeclarations(await actorOf(farm.farmerUserId));
      expect(mine.some((row) => row.id === declarationId)).toBe(true);
      await expect(
        requestBurnAssessment(await actorOf(farm.farmerUserId), farm.id),
      ).rejects.toBeInstanceOf(DamageError);
    }
    const ministryUser = await prisma.user.findFirstOrThrow({
      where: { phoneNumber: "+2290190000003" },
      select: { id: true },
    });
    const ministry = await actorOf(ministryUser.id);
    const csv = await exportDamageCsv(ministry, { status: "CONFIRMED" });
    expect(csv.content).toContain("Confirmée");
    expect(csv.content).toContain("satellite Sentinel-2");
    const exported = await prisma.auditLog.findFirst({
      where: { action: "damage.exported", actorId: ministryUser.id, occurredAt: { gte: since } },
    });
    expect(exported).not.toBeNull();
    const agent = await actorOf(farm.registeredById);
    await expect(exportDamageCsv(agent)).rejects.toBeInstanceOf(DamageError);
  });
});
