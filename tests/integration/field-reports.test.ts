import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { loadActor } from "@/modules/identity";
import { getReportForActor, listReportsForActor, reviewReport } from "@/modules/reports";
import { applySyncBatch } from "@/modules/sync";

// Signalements de terrain (phase 0) par la synchronisation : droits (producteur sur sa propre
// exploitation, agent sur celles qu'il a enregistrées), position retenue, photo réencodée sans
// métadonnées, rejeu idempotent. Tout est créé par le test et supprimé à la fin.

const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";
const DEVICE = "test-device-reports";
// Une heure avant l'exécution : une date d'observation de plus de 60 jours est refusée.
const AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const ids = {
  farmer: "019284a0-0000-7000-8000-00000000d001",
  farm: "019284a0-0000-7000-8000-00000000d002",
  byAgent: "019284a0-0000-7000-8000-00000000d101",
  byFarmer: "019284a0-0000-7000-8000-00000000d102",
  foreign: "019284a0-0000-7000-8000-00000000d103",
  outside: "019284a0-0000-7000-8000-00000000d104",
  far: "019284a0-0000-7000-8000-00000000d105",
  ahead: "019284a0-0000-7000-8000-00000000d106",
  capped: "019284a0-0000-7000-8000-00000000d107",
};

function command(id: string, type: string, payload: unknown) {
  return { id, type, payload, idempotencyKey: `rep-${id}`, clientCreatedAt: AT, deviceId: DEVICE };
}

async function actorForPhone(phone: string) {
  const user = await prisma.user.findFirstOrThrow({ where: { phoneNumber: phone } });
  return loadActor(user.id);
}

// Photo de test porteuse de métadonnées EXIF (dont une position), que le serveur doit retirer.
async function photoWithExif(): Promise<string> {
  const jpeg = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#5a7d2a" },
  })
    .jpeg()
    .withExif({ IFD0: { Make: "Téléphone de test", Copyright: "position 9.70N 1.67E" } })
    .toBuffer();
  expect((await sharp(jpeg).metadata()).exif).toBeDefined();
  return jpeg.toString("base64");
}

describe("signalements de terrain", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const agent = await actorForPhone(AGENT_PHONE);
    // Exploitation enregistrée par l'agent de démonstration, pour les droits OWN (ADR-0014).
    const results = await applySyncBatch(agent, DEVICE, [
      command(ids.farmer, "farmer.create", {
        id: ids.farmer,
        firstName: "Rachidatou",
        lastName: "Signalement",
        communeCode: "BJ-DON-003",
        consentAt: AT,
      }),
      command(ids.farm, "farm.create", {
        id: ids.farm,
        farmerId: ids.farmer,
        communeCode: "BJ-DON-003",
        location: [1.672, 9.702],
        declaredAreaHa: 1,
      }),
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["APPLIED", "APPLIED"]);
  }, 180_000);

  afterAll(async () => {
    await prisma.farmEvent.deleteMany({
      where: {
        kind: { in: ["REPORT_SUBMITTED", "REPORT_REVIEWED"] },
        occurredAt: { gte: new Date(AT) },
      },
    });
    await prisma.farmerNotification.deleteMany({
      where: { subjectId: { in: Object.values(ids) } },
    });
    await prisma.fieldReport.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.fieldReport.deleteMany({ where: { farmId: ids.farm } });
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.farmEvent.deleteMany({ where: { farmId: ids.farm } });
    await prisma.farm.deleteMany({ where: { id: ids.farm } });
    await prisma.farmer.deleteMany({ where: { id: ids.farmer } });
    await prisma.$disconnect();
  });

  it("enregistre le signalement de l'agent, positionné sur l'exploitation, photo sans EXIF", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const [result] = await applySyncBatch(agent, DEVICE, [
      command(ids.byAgent, "fieldReport.create", {
        id: ids.byAgent,
        farmId: ids.farm,
        type: "PEST",
        cropCode: "MAIZE",
        description: "Chenilles légionnaires sur les jeunes plants de maïs",
        observedAt: AT,
        photo: { contentType: "image/jpeg", dataBase64: await photoWithExif() },
      }),
    ]);
    expect(result).toMatchObject({ outcome: "APPLIED", entity: { type: "fieldReport" } });

    const rows = await prisma.$queryRaw<{ source: string; has_location: boolean }[]>`
      SELECT "location_source" AS source, "location" IS NOT NULL AS has_location
      FROM "field_report" WHERE "id" = ${ids.byAgent}::uuid`;
    expect(rows[0]).toEqual({ source: "FARM", has_location: true });

    const photo = await prisma.fieldReportPhoto.findUniqueOrThrow({
      where: { reportId: ids.byAgent },
    });
    expect(photo.contentType).toBe("image/webp");
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1280);
    const metadata = await sharp(Buffer.from(photo.bytes)).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(Buffer.from(photo.bytes).includes(Buffer.from("Téléphone de test"))).toBe(false);

    const [replay] = await applySyncBatch(agent, DEVICE, [
      command(ids.byAgent, "fieldReport.create", {
        id: ids.byAgent,
        farmId: ids.farm,
        type: "PEST",
        description: "Chenilles légionnaires sur les jeunes plants de maïs",
        observedAt: AT,
      }),
    ]);
    expect(replay?.outcome).toBe("DUPLICATE");
  });

  it("refuse le signalement d'un producteur sur une exploitation qui n'est pas la sienne", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const [result] = await applySyncBatch(farmer, "test-device-reports-farmer", [
      command(ids.foreign, "fieldReport.create", {
        id: ids.foreign,
        farmId: ids.farm,
        type: "CROP_DISEASE",
        description: "Feuilles jaunies sur toute la parcelle",
        observedAt: AT,
      }),
    ]);
    expect(result).toMatchObject({ outcome: "REJECTED", error: { code: "NOT_FOUND" } });
    await prisma.syncCommand.deleteMany({ where: { deviceId: "test-device-reports-farmer" } });
  });

  it("accepte le producteur sur sa propre exploitation, avec la position GPS relevée", async () => {
    const farmer = await actorForPhone(FARMER_PHONE);
    const own = await prisma.farm.findFirstOrThrow({
      where: { farmer: { userId: farmer.userId }, archivedAt: null },
      select: { id: true },
    });
    // Point relevé à un kilomètre environ de l'exploitation.
    const [farmPoint] = await prisma.$queryRaw<{ lon: number; lat: number }[]>`
      SELECT ST_X("location"::geometry) AS lon, ST_Y("location"::geometry) AS lat
      FROM "farm" WHERE "id" = ${own.id}::uuid`;
    const [result, outside] = await applySyncBatch(farmer, "test-device-reports-farmer", [
      command(ids.byFarmer, "fieldReport.create", {
        id: ids.byFarmer,
        farmId: own.id,
        type: "ANIMAL_DISEASE",
        description: "Deux chèvres fiévreuses depuis hier",
        gps: { point: [farmPoint!.lon + 0.007, farmPoint!.lat + 0.007], accuracyM: 12 },
        observedAt: AT,
      }),
      command(ids.outside, "fieldReport.create", {
        id: ids.outside,
        farmId: own.id,
        type: "OTHER",
        description: "Position relevée hors du pays",
        gps: { point: [-3.5, 40.4] },
        observedAt: AT,
      }),
    ]);
    expect(result?.outcome).toBe("APPLIED");
    expect(outside).toMatchObject({ outcome: "REJECTED", error: { code: "INVALID_POSITION" } });
    const stored = await prisma.fieldReport.findUniqueOrThrow({ where: { id: ids.byFarmer } });
    expect(stored).toMatchObject({ locationSource: "GPS", status: "SUBMITTED" });
    await prisma.syncCommand.deleteMany({ where: { deviceId: "test-device-reports-farmer" } });
  });

  it("montre à chacun les signalements de sa portée seulement", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const farmer = await actorForPhone(FARMER_PHONE);
    const ministryUser = await prisma.user.findUniqueOrThrow({
      where: { email: "ministere@bais.demo" },
    });
    const ministry = await loadActor(ministryUser.id);

    const agentIds = (await listReportsForActor(agent)).map((r) => r.id);
    expect(agentIds).toContain(ids.byAgent);
    // L'agent voit le signalement de l'agricultrice seulement s'il a enregistré sa ferme (ADR-0014).
    const farmerFarm = await prisma.fieldReport.findUniqueOrThrow({
      where: { id: ids.byFarmer },
      select: { farm: { select: { registeredById: true } } },
    });
    expect(agentIds.includes(ids.byFarmer)).toBe(farmerFarm.farm.registeredById === agent.userId);

    const farmerIds = (await listReportsForActor(farmer)).map((r) => r.id);
    expect(farmerIds).toContain(ids.byFarmer);
    expect(farmerIds).not.toContain(ids.byAgent);
    expect(await getReportForActor(farmer, ids.byAgent)).toBeNull();

    const ministryIds = (await listReportsForActor(ministry)).map((r) => r.id);
    expect(ministryIds).toEqual(expect.arrayContaining([ids.byAgent, ids.byFarmer]));
    expect(await getReportForActor(ministry, ids.byAgent)).toMatchObject({
      hasPhoto: true,
      farm: { id: ids.farm, farmerName: "Rachidatou Signalement" },
    });
  });

  it("laisse l'agent confirmer après visite, une seule fois, jamais le producteur", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const farmer = await actorForPhone(FARMER_PHONE);
    expect(await reviewReport(farmer, ids.byAgent, "CONFIRMED", "")).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await reviewReport(farmer, ids.byFarmer, "CONFIRMED", "")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await reviewReport(agent, ids.byAgent, "DISMISSED", "non")).toEqual({
      ok: false,
      code: "NOTE_REQUIRED",
    });
    expect(
      await reviewReport(agent, ids.byAgent, "CONFIRMED", "Chenilles vues sur place"),
    ).toMatchObject({ ok: true });
    expect(await reviewReport(agent, ids.byAgent, "DISMISSED", "Changement d'avis")).toEqual({
      ok: false,
      code: "ALREADY_REVIEWED",
    });
    const report = await getReportForActor(agent, ids.byAgent);
    expect(report).toMatchObject({
      status: "CONFIRMED",
      review: { note: "Chenilles vues sur place" },
    });
  });

  it("ignore un point loin de l'exploitation, refuse une date à venir, sans photo au journal", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const [far, ahead] = await applySyncBatch(agent, DEVICE, [
      command(ids.far, "fieldReport.create", {
        id: ids.far,
        farmId: ids.farm,
        type: "PEST",
        description: "Point relevé à Cotonou, loin de Djougou",
        gps: { point: [2.42, 6.37] },
        observedAt: AT,
      }),
      command(ids.ahead, "fieldReport.create", {
        id: ids.ahead,
        farmId: ids.farm,
        type: "PEST",
        description: "Date d'observation dans trois jours",
        observedAt: future,
      }),
    ]);
    // Le signalement est gardé, placé sur l'exploitation et non à Cotonou.
    expect(far?.outcome).toBe("APPLIED");
    const placed = await prisma.fieldReport.findUniqueOrThrow({ where: { id: ids.far } });
    expect(placed).toMatchObject({ locationSource: "FARM", gpsAccuracyM: null });
    expect(ahead).toMatchObject({ outcome: "REJECTED", error: { code: "INVALID_DATE" } });

    // La photo envoyée avec EXIF n'est pas recopiée dans le journal des commandes.
    const stored = await prisma.syncCommand.findUniqueOrThrow({
      where: { idempotencyKey: `rep-${ids.byAgent}` },
    });
    expect(stored.payload).toMatchObject({ photo: { contentType: "image/jpeg", omitted: true } });
    expect(JSON.stringify(stored.payload)).not.toContain("dataBase64");
  });

  it("plafonne les signalements d'un compte sur 24 heures", async () => {
    const agent = await actorForPhone(AGENT_PHONE);
    const farm = await prisma.farm.findUniqueOrThrow({ where: { id: ids.farm } });
    const already = await prisma.fieldReport.count({
      where: { reportedById: agent.userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    await prisma.fieldReport.createMany({
      data: Array.from({ length: Math.max(0, 20 - already) }, () => ({
        id: crypto.randomUUID(),
        farmId: ids.farm,
        communeId: farm.communeId,
        type: "OTHER" as const,
        description: "Signalement de remplissage du plafond",
        locationSource: "NONE",
        observedAt: new Date(),
        reportedById: agent.userId,
      })),
    });
    const [capped] = await applySyncBatch(agent, DEVICE, [
      command(ids.capped, "fieldReport.create", {
        id: ids.capped,
        farmId: ids.farm,
        type: "PEST",
        description: "Signalement de trop dans la journée",
        observedAt: AT,
      }),
    ]);
    expect(capped).toMatchObject({ outcome: "REJECTED", error: { code: "RATE_LIMITED" } });
  });
});
