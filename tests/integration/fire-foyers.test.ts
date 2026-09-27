import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { fireFoyersNearParcelsByCommune } from "@/database/sql/fire-clusters.sql";
import { runFireIngestion } from "@/modules/fires";
import { evaluateNewFires, seedDefaultRules } from "@/modules/monitoring";
import { FixtureFireProvider } from "@/services/fires";
import type { RawFireDetection } from "@/services/ports/fire-detection-provider";

// Foyer de feux (ADR-0038) sur la vraie base : un feu près d'une parcelle lève l'alerte de feu,
// puis deux autres foyers distincts la font passer en « foyer de feux ». Le même feu vu à deux
// passages compte une fois. L'alerte de feu active reçoit alors les agents de la commune et le
// ministère, et le producteur déjà prévenu, dont le feu reste à plus de 500 m, n'a pas de second
// message.

const now = new Date();
const since = new Date(now.getTime() - 60_000);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
/** Environ 800 m en latitude et en longitude, vers 9 à 10° nord. */
const STEP_LAT = 0.0072;
const STEP_LON = 0.0073;

let parcel: { lon: number; lat: number };
let farm: { id: string; communeId: string; departementId: string };
let paused: string[] = [];

function detection(values: Partial<RawFireDetection>): RawFireDetection {
  return {
    sensor: "VIIRS_SNPP",
    latitude: 0,
    longitude: 0,
    acquiredAt: hoursAgo(3),
    confidenceRaw: "nominal",
    frpMw: 9,
    brightnessK: 336,
    daynight: "D",
    ...values,
  };
}

const east = () => detection({ latitude: parcel.lat, longitude: parcel.lon + STEP_LON });

async function activeFireAlert() {
  return prisma.alert.findFirstOrThrow({
    where: { communeId: farm.communeId, category: "FIRE", status: "ACTIVE" },
    include: { rule: { select: { code: true } } },
  });
}

describe("foyer de feux dans une commune", () => {
  beforeAll(async () => {
    await seedDefaultRules();
    const [row] = await prisma.$queryRaw<
      { lon: number; lat: number; farm_id: string; commune_id: string; departement_id: string }[]
    >`
      SELECT ST_X(p."centroid"::geometry) AS lon, ST_Y(p."centroid"::geometry) AS lat,
             f."id"::text AS farm_id, f."commune_id"::text AS commune_id,
             c."departement_id"::text AS departement_id
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "commune" c ON c."id" = f."commune_id"
      WHERE p."centroid" IS NOT NULL AND p."archived_at" IS NULL AND f."archived_at" IS NULL
        -- Une seule parcelle : les feux placés à 800 m d'elle restent à plus de 500 m de
        -- l'exploitation.
        AND (SELECT count(*) FROM "parcel" q
              WHERE q."farm_id" = f."id" AND q."archived_at" IS NULL) = 1
        AND ST_Area(COALESCE(p."geom"::geography, ST_Buffer(p."centroid"::geography, 1))) < 50000
      ORDER BY p."code" LIMIT 1`;
    parcel = { lon: row!.lon, lat: row!.lat };
    farm = { id: row!.farm_id, communeId: row!.commune_id, departementId: row!.departement_id };
    // Une alerte de feu déjà active dans la commune (démonstration) est mise de côté le temps du
    // test, puis rétablie.
    const active = await prisma.alert.findMany({
      where: { communeId: farm.communeId, category: "FIRE", status: "ACTIVE" },
      select: { id: true },
    });
    paused = active.map((alert) => alert.id);
    await prisma.alert.updateMany({
      where: { id: { in: paused } },
      data: { status: "EXPIRED" },
    });
  }, 180_000);

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { category: "FIRE", startsAt: { gte: since } } });
    await prisma.alert.updateMany({ where: { id: { in: paused } }, data: { status: "ACTIVE" } });
    await prisma.ruleEvaluation.deleteMany({
      where: {
        rule: { code: { in: ["FIRE_NEAR_PARCELS", "FIRE_CLUSTER_COMMUNE"] } },
        evaluatedAt: { gte: since },
      },
    });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.fireIngestionRun.deleteMany({ where: { startedAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("lève l'alerte de feu pour un seul foyer, sans agents de la commune ni ministère", async () => {
    const run = await runFireIngestion({
      provider: new FixtureFireProvider([east()]),
      now,
    });
    await evaluateNewFires(run.changedIds, now);
    const alert = await activeFireAlert();
    expect(alert.rule.code).toBe("FIRE_NEAR_PARCELS");
    const ministry = await prisma.roleAssignment.findMany({
      where: { role: "ADMIN_STATE", revokedAt: null },
      select: { userId: true },
    });
    const inApp = await prisma.alertRecipient.findMany({
      where: { alertId: alert.id, farmId: null },
      select: { userId: true },
    });
    expect(inApp.some((row) => ministry.some((m) => m.userId === row.userId))).toBe(false);

    // Le message au producteur est parti.
    await prisma.alertRecipient.updateMany({
      where: { alertId: alert.id, farmId: farm.id, channel: { not: "IN_APP" } },
      data: { channel: "WHATSAPP", status: "SENT", sentAt: now },
    });
  }, 120_000);

  it("compte trois foyers distincts, le même feu vu deux fois comptant une fois", async () => {
    const run = await runFireIngestion({
      provider: new FixtureFireProvider([
        // Même feu que l'est, vu douze heures plus tôt à 100 m près.
        detection({
          sensor: "VIIRS_NOAA20",
          latitude: parcel.lat + 0.0009,
          longitude: parcel.lon + STEP_LON,
          acquiredAt: hoursAgo(15),
          daynight: "N",
        }),
        detection({ latitude: parcel.lat, longitude: parcel.lon - STEP_LON }),
        detection({ latitude: parcel.lat + STEP_LAT, longitude: parcel.lon }),
      ]),
      now,
    });
    expect(run.created).toBe(3);
    const foyers = await fireFoyersNearParcelsByCommune(
      [farm.communeId],
      new Date(now.getTime() - 24 * 3_600_000),
    );
    expect(foyers.get(farm.communeId)).toBe(3);

    // Les feux restent à plus de 500 m des parcelles de l'exploitation suivie.
    const [closest] = await prisma.$queryRaw<{ metres: number }[]>`
      SELECT MIN(ST_Distance(COALESCE(p."geom"::geography, p."centroid"::geography), d."location"))
               AS metres
      FROM "parcel" p, "fire_detection" d
      WHERE p."farm_id" = ${farm.id}::uuid AND p."archived_at" IS NULL
        AND d."created_at" >= ${since}`;
    expect(Number(closest!.metres)).toBeGreaterThan(500);

    await evaluateNewFires(run.changedIds, now);
  }, 120_000);

  it("prévient les agents de la commune et le ministère, sans second message au producteur", async () => {
    const alert = await activeFireAlert();
    expect(alert.severity).toBe("CRITICAL");
    expect(alert.rule.code).toBe("FIRE_CLUSTER_COMMUNE");
    expect(alert.messageFr).toContain("3 foyers de feux");

    const recipients = await prisma.alertRecipient.findMany({
      where: { alertId: alert.id },
      select: { farmId: true, userId: true, channel: true },
    });
    const users = new Set(recipients.flatMap((row) => (row.farmId === null ? [row.userId] : [])));
    const [ministry, agents] = await Promise.all([
      prisma.roleAssignment.findMany({
        where: { role: "ADMIN_STATE", revokedAt: null },
        select: { userId: true },
      }),
      prisma.roleAssignment.findMany({
        where: {
          role: "AGENT_AGRICULTURE",
          revokedAt: null,
          OR: [
            { scopeType: "COMMUNE", scopeId: farm.communeId },
            { scopeType: "DEPARTEMENT", scopeId: farm.departementId },
          ],
        },
        select: { userId: true },
      }),
    ]);
    expect(ministry.length).toBeGreaterThan(0);
    expect(ministry.every((row) => users.has(row.userId))).toBe(true);
    expect(agents.every((row) => users.has(row.userId))).toBe(true);

    // Déjà prévenu par l'alerte remplacée, feu toujours à plus de 500 m : pas de second message.
    const outbound = recipients.filter((row) => row.farmId === farm.id && row.channel !== "IN_APP");
    expect(outbound).toEqual([]);
  }, 120_000);
});
