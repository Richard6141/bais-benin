import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { getFarmDetail, listParcelOverlaps } from "@/modules/registry";

// Chevauchements de parcelles : liste nationale pour le ministère, signal sur la fiche pour
// l'agent sans révéler l'exploitation d'un autre (ADR-0014). Deux parcelles de test qui se
// recouvrent sont créées à des coordonnées vides de toute parcelle, puis retirées.

const CODES = ["BJ-TEST-OVL-000001-P1", "BJ-TEST-OVL-000002-P1"] as const;
let ministry: Actor;
let agent: Actor;
let agentFarmId: string;

async function insertParcel(code: string, farmId: string, square: string): Promise<void> {
  const parcel = await prisma.parcel.create({
    data: {
      code,
      farmId,
      declaredAreaHa: 1,
      captureMethod: "GPS_WALK",
      sourceId: "BAIS_SEED",
      sourceDate: new Date(),
      reliability: "SYNTHETIC",
    },
    select: { id: true },
  });
  await prisma.$executeRaw`
    UPDATE "parcel" SET "geom" = ST_GeogFromText(${square}) WHERE "id" = ${parcel.id}::uuid`;
}

describe("chevauchements de parcelles", () => {
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
    const agentFarm = await prisma.farm.findFirstOrThrow({
      where: { registeredById: agentUser.id, archivedAt: null },
      orderBy: { code: "asc" },
    });
    agentFarmId = agentFarm.id;
    const otherFarm = await prisma.farm.findFirstOrThrow({
      where: { archivedAt: null, id: { not: agentFarm.id }, registeredById: null },
      orderBy: { code: "asc" },
    });
    // Deux carrés d'environ 110 m de côté, décalés de moitié : 0,6 ha environ en commun.
    await insertParcel(
      CODES[0],
      agentFarm.id,
      "POLYGON((2.5000 11.9000, 2.5010 11.9000, 2.5010 11.9010, 2.5000 11.9010, 2.5000 11.9000))",
    );
    await insertParcel(
      CODES[1],
      otherFarm.id,
      "POLYGON((2.5005 11.9000, 2.5015 11.9000, 2.5015 11.9010, 2.5005 11.9010, 2.5005 11.9000))",
    );
  }, 240_000);

  afterAll(async () => {
    await prisma.parcel.deleteMany({ where: { code: { in: [...CODES] } } });
    await prisma.$disconnect();
  });

  it("liste les recouvrements pour le ministère, les plus étendus d'abord", async () => {
    const list = await listParcelOverlaps(ministry);
    expect(list).not.toBeNull();
    expect(list!.total).toBeGreaterThan(0);
    for (let i = 1; i < list!.pairs.length; i += 1) {
      expect(list!.pairs[i - 1]!.overlapHa).toBeGreaterThanOrEqual(list!.pairs[i]!.overlapHa);
    }
    expect(list!.pairs.every((p) => p.overlapShare >= 0.05 && p.overlapHa >= 0.01)).toBe(true);
    const test = list!.pairs.find((p) => [p.parcelCode, p.otherParcelCode].includes(CODES[0]));
    expect(test?.kind).toBe("OTHER_FARM");
    expect(test?.overlapShare).toBeGreaterThan(0.4);
  });

  it("refuse la liste nationale à un agent", async () => {
    expect(await listParcelOverlaps(agent)).toBeNull();
  });

  it("signale le recouvrement à l'agent sans nommer l'exploitation d'un autre", async () => {
    const detail = await getFarmDetail(agent, agentFarmId);
    const parcel = detail?.parcels.find((p) => p.code === CODES[0]);
    expect(parcel?.overlaps).toHaveLength(1);
    expect(parcel?.overlaps[0]).toMatchObject({ kind: "OTHER_FARM", otherParcelCode: null });

    const asMinistry = await getFarmDetail(ministry, agentFarmId);
    const same = asMinistry?.parcels.find((p) => p.code === CODES[0]);
    expect(same?.overlaps[0]?.otherParcelCode).toBe(CODES[1]);
  });
});
