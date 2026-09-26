import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { fireExposureByCommune } from "@/database/sql/watch.sql";
import { listFires, runFireIngestion, type FireIngestionSummary } from "@/modules/fires";
import { evaluateNewFires, seedDefaultRules } from "@/modules/monitoring";
import { FixtureFireProvider } from "@/services/fires";
import type { RawFireDetection } from "@/services/ports/fire-detection-provider";

// Feux actifs (ADR-0022) de bout en bout, avec un jeu de détections fixe : fusion de deux
// satellites au même passage, feu hors frontière écarté, fichier relu sans effet, alerte « feu
// de brousse » pour la commune de l'exploitation touchée, destinataires limités aux
// exploitations à moins de 1 km et à l'agent qui les a enregistrées (ADR-0014).

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const since = new Date(now.getTime() - 60_000);
let parcel: { lon: number; lat: number };
let farm: { id: string; communeId: string; registeredById: string | null };
let first: FireIngestionSummary;

function detection(values: Partial<RawFireDetection>): RawFireDetection {
  return {
    sensor: "VIIRS_SNPP",
    latitude: 0,
    longitude: 0,
    acquiredAt: hoursAgo(2),
    confidenceRaw: "nominal",
    frpMw: 8,
    brightnessK: 335,
    daynight: "D",
    ...values,
  };
}

function fixture(): FixtureFireProvider {
  return new FixtureFireProvider([
    // Un feu à 300 m environ d'une parcelle, vu par SNPP puis par NOAA-20 trente minutes après.
    detection({ latitude: parcel.lat, longitude: parcel.lon + 0.0027 }),
    detection({
      sensor: "VIIRS_NOAA20",
      latitude: parcel.lat + 0.0008,
      longitude: parcel.lon + 0.0027,
      acquiredAt: hoursAgo(1.5),
      confidenceRaw: "high",
      frpMw: 15,
    }),
    // Au Nigeria, dans l'emprise mais hors frontière : écarté.
    detection({ latitude: 7.5, longitude: 3.94 }),
  ]);
}

describe("feux actifs NASA FIRMS", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await seedDefaultRules();
    const [row] = await prisma.$queryRaw<
      { lon: number; lat: number; farm_id: string; commune_id: string; registered_by_id: string }[]
    >`
      SELECT ST_X(p."centroid"::geometry) AS lon, ST_Y(p."centroid"::geometry) AS lat,
             f."id"::text AS farm_id, f."commune_id"::text AS commune_id,
             f."registered_by_id"::text AS registered_by_id
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "farmer" fa ON fa."id" = f."farmer_id" JOIN "user" u ON u."id" = fa."user_id"
      WHERE u."phone_e164" = '+2290190000002' AND p."centroid" IS NOT NULL
      ORDER BY p."code" LIMIT 1`;
    parcel = { lon: row!.lon, lat: row!.lat };
    farm = { id: row!.farm_id, communeId: row!.commune_id, registeredById: row!.registered_by_id };
  }, 180_000);

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { category: "FIRE", startsAt: { gte: since } } });
    await prisma.ruleEvaluation.deleteMany({
      where: { rule: { code: "FIRE_NEAR_PARCELS" }, evaluatedAt: { gte: since } },
    });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.fireIngestionRun.deleteMany({ where: { startedAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("fusionne deux satellites au même passage et écarte un feu hors du Bénin", async () => {
    first = await runFireIngestion({ provider: fixture(), now });
    expect(first).toMatchObject({ status: "SUCCEEDED", fetched: 3, created: 1, merged: 0 });
    const fires = await listFires("24h", now);
    const fire = fires.find((f) => first.changedIds.includes(f.id));
    expect(fire).toMatchObject({ sensors: ["VIIRS_SNPP", "VIIRS_NOAA20"], confidence: "HIGH" });
    expect(fire?.frpMw).toBe(15);
  });

  it("ne recrée rien quand le même fichier est relu", async () => {
    const again = await runFireIngestion({ provider: fixture(), now });
    expect(again).toMatchObject({ created: 0, merged: 0, changedIds: [] });
  });

  it("lève une alerte « feu de brousse » pour les exploitations touchées seulement", async () => {
    const summary = await evaluateNewFires(first.changedIds, now);
    expect(summary?.raised.length).toBeGreaterThanOrEqual(1);
    const alert = await prisma.alert.findFirstOrThrow({
      where: { communeId: farm.communeId, category: "FIRE", status: "ACTIVE" },
    });
    expect(alert).toMatchObject({ sourceId: "NASA_FIRMS", reliability: "ESTIMATED" });
    expect(alert.messageFr).toContain("à moins de 1 km");

    const recipients = await prisma.alertRecipient.findMany({ where: { alertId: alert.id } });
    const farmIds = new Set(recipients.flatMap((r) => (r.farmId ? [r.farmId] : [])));
    expect(farmIds.has(farm.id)).toBe(true);
    const nearby = await prisma.$queryRaw<{ farm_id: string }[]>`
      SELECT DISTINCT p."farm_id"::text AS farm_id FROM "parcel" p, "fire_detection" d
      WHERE d."id" = ANY(${first.changedIds}::uuid[])
        AND ST_DWithin(COALESCE(p."geom"::geography, p."centroid"::geography), d."location", 1000)`;
    // Seules les exploitations à moins de 1 km du feu reçoivent l'alerte.
    expect([...farmIds].every((id) => nearby.some((n) => n.farm_id === id))).toBe(true);
    // Agent : celui qui a enregistré l'exploitation touchée (ADR-0014).
    const agents = recipients.filter((r) => r.farmId === null).map((r) => r.userId);
    expect(agents).toContain(farm.registeredById);
  });

  it("compte la commune parmi les parcelles exposées du centre de veille", async () => {
    const exposure = await fireExposureByCommune(hoursAgo(24));
    const commune = await prisma.commune.findUniqueOrThrow({ where: { id: farm.communeId } });
    const row = exposure.find((r) => r.commune_code === commune.code);
    expect(row?.producers).toBeGreaterThanOrEqual(1);
    expect(row?.fires).toBeGreaterThanOrEqual(1);
  });
});
