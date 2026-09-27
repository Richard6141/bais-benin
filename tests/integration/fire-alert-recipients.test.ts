import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { runFireIngestion } from "@/modules/fires";
import { loadActor } from "@/modules/identity";
import {
  alertCommuneIds,
  evaluateNewFires,
  getAlertDetail,
  listAlertsForActor,
  seedDefaultRules,
} from "@/modules/monitoring";
import { dispatchPendingDeliveries, listAffectedFarms } from "@/modules/monitoring/delivery";
import { FixtureFireProvider } from "@/services/fires";
import { FixtureMessagingChannel } from "@/services/messaging/fixture/fixture-channel";

// Alerte « feu de brousse » utile (ADR-0022) : un feu à environ 330 m au nord d'une parcelle de
// l'agricultrice de démonstration de Djougou. Elle voit l'alerte, critique, dans l'application ;
// une voisine de la même commune, sans parcelle près du feu, ne la voit ni dans sa liste ni dans
// sa fiche ; l'agent voit l'exploitation exposée et sa distance. Le message WhatsApp, avec la
// distance et la direction depuis SA parcelle, part vers un producteur enregistré sur le terrain
// dont le champ est aussi près du feu, jamais vers une fiche de démonstration au numéro inventé.
// Aucun envoi réel : canal de test.

const FARMER_PHONE = "+2290190000002";
const AGENT_PHONE = "+2290190000001";
const ENROLLED_PHONE = "+2290166000123";
const now = new Date();
const since = new Date(now.getTime() - 60_000);
const neighbourIds = {
  user: crypto.randomUUID(),
  farmer: crypto.randomUUID(),
  farm: crypto.randomUUID(),
};
const enrolledIds = {
  farmer: crypto.randomUUID(),
  farm: crypto.randomUUID(),
  parcel: crypto.randomUUID(),
};
const provenance = { sourceId: "BAIS_SEED", sourceDate: now, reliability: "SYNTHETIC" } as const;
const field = { sourceId: "ATDA_TERRAIN", sourceDate: now, reliability: "DECLARED" } as const;

let exposed: { farmId: string; communeId: string; actor: Actor };
let neighbour: Actor;
let agent: Actor;
let alertId: string;

describe("alerte feu adressée aux seuls producteurs exposés", () => {
  beforeAll(async () => {
    await seedReferenceData();
    await seedDefaultRules();
    const [row] = await prisma.$queryRaw<
      { lon: number; lat: number; farm_id: string; commune_id: string; user_id: string }[]
    >`
      SELECT ST_X(p."centroid"::geometry) AS lon, ST_Y(p."centroid"::geometry) AS lat,
             f."id"::text AS farm_id, f."commune_id"::text AS commune_id,
             u."id"::text AS user_id
      FROM "parcel" p JOIN "farm" f ON f."id" = p."farm_id"
      JOIN "farmer" fa ON fa."id" = f."farmer_id" JOIN "user" u ON u."id" = fa."user_id"
      WHERE u."phone_e164" = ${FARMER_PHONE} AND p."centroid" IS NOT NULL
        AND p."archived_at" IS NULL AND f."archived_at" IS NULL
      ORDER BY p."code" LIMIT 1`;
    if (!row)
      throw new Error("Le seed n'a pas donné de parcelle à l'agricultrice de démonstration");
    exposed = {
      farmId: row.farm_id,
      communeId: row.commune_id,
      actor: await loadActor(row.user_id),
    };
    const agentUser = await prisma.user.findFirstOrThrow({ where: { phoneNumber: AGENT_PHONE } });
    agent = await loadActor(agentUser.id);

    // Voisine de la même commune, avec un compte, sans aucune parcelle près du feu.
    await prisma.user.create({
      data: {
        id: neighbourIds.user,
        name: "Voisine Testfeu",
        email: `voisine-${neighbourIds.user}@bais.test`,
      },
    });
    await prisma.farmer.create({
      data: {
        id: neighbourIds.farmer,
        code: `BJ-F-FEU-${neighbourIds.farmer.slice(0, 8)}`,
        userId: neighbourIds.user,
        firstName: "Voisine",
        lastName: "Testfeu",
        communeId: exposed.communeId,
        ...provenance,
      },
    });
    await prisma.farm.create({
      data: {
        id: neighbourIds.farm,
        code: `BJ-FEU-${neighbourIds.farm.slice(0, 8)}`,
        farmerId: neighbourIds.farmer,
        communeId: exposed.communeId,
        declaredAreaHa: 1,
        ...provenance,
      },
    });
    neighbour = {
      userId: neighbourIds.user,
      grants: [{ role: "FARMER", scopeType: "SELF", scopeId: null }],
    };

    // Producteur enregistré sur le terrain (fiche réelle, consentement WhatsApp), dont le champ
    // est à 110 m à l'est de celui de l'agricultrice : le même feu est à son nord.
    await prisma.farmer.create({
      data: {
        id: enrolledIds.farmer,
        code: `BJ-F-FEU-${enrolledIds.farmer.slice(0, 8)}`,
        firstName: "Terrain",
        lastName: "Testfeu",
        phoneE164: ENROLLED_PHONE,
        communeId: exposed.communeId,
        ...field,
      },
    });
    await prisma.channelConsent.create({
      data: {
        farmerId: enrolledIds.farmer,
        channel: "WHATSAPP",
        granted: true,
        grantedAt: now,
        method: "AGENT_FORM",
        evidence: "test-alerte-feu",
      },
    });
    await prisma.farm.create({
      data: {
        id: enrolledIds.farm,
        code: `BJ-FEU-${enrolledIds.farm.slice(0, 8)}`,
        farmerId: enrolledIds.farmer,
        communeId: exposed.communeId,
        declaredAreaHa: 1,
        ...field,
      },
    });
    await prisma.parcel.create({
      data: {
        id: enrolledIds.parcel,
        code: `BJ-FEU-${enrolledIds.farm.slice(0, 8)}-P01`,
        farmId: enrolledIds.farm,
        declaredAreaHa: 1,
        ...field,
      },
    });
    await prisma.$executeRaw`
      UPDATE "parcel"
      SET "centroid" = ST_SetSRID(ST_MakePoint(${row.lon + 0.001}, ${row.lat}), 4326)::geography
      WHERE "id" = ${enrolledIds.parcel}::uuid`;

    const ingestion = await runFireIngestion({
      now,
      provider: new FixtureFireProvider([
        {
          sensor: "VIIRS_SNPP",
          latitude: row.lat + 0.003,
          longitude: row.lon,
          acquiredAt: new Date(now.getTime() - 2 * 3_600_000),
          confidenceRaw: "nominal",
          frpMw: 9,
          brightnessK: 336,
          daynight: "D",
        },
      ]),
    });
    expect(ingestion.changedIds.length).toBe(1);
    await evaluateNewFires(ingestion.changedIds, now);
    const alert = await prisma.alert.findFirstOrThrow({
      where: { communeId: exposed.communeId, category: "FIRE", status: "ACTIVE" },
      select: { id: true },
    });
    alertId = alert.id;
  }, 180_000);

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { category: "FIRE", startsAt: { gte: since } } });
    await prisma.ruleEvaluation.deleteMany({
      where: { rule: { code: "FIRE_NEAR_PARCELS" }, evaluatedAt: { gte: since } },
    });
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.fireIngestionRun.deleteMany({ where: { startedAt: { gte: since } } });
    await prisma.parcel.deleteMany({ where: { id: enrolledIds.parcel } });
    await prisma.farm.deleteMany({ where: { id: { in: [neighbourIds.farm, enrolledIds.farm] } } });
    await prisma.farmer.deleteMany({
      where: { id: { in: [neighbourIds.farmer, enrolledIds.farmer] } },
    });
    await prisma.user.deleteMany({ where: { id: neighbourIds.user } });
    await prisma.$disconnect();
  });

  it("est critique : le feu est à moins de 500 m d'une parcelle", async () => {
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alert.severity).toBe("CRITICAL");
    expect(alert.sourceId).toBe("NASA_FIRMS");
  });

  it("vise l'exploitation exposée, jamais la voisine", async () => {
    const recipients = await prisma.alertRecipient.findMany({ where: { alertId } });
    const farmIds = new Set(recipients.flatMap((r) => (r.farmId ? [r.farmId] : [])));
    expect(farmIds.has(exposed.farmId)).toBe(true);
    expect(farmIds.has(neighbourIds.farm)).toBe(false);
  });

  it("la productrice exposée la voit ; la voisine de la même commune ne la voit pas", async () => {
    const mine = await listAlertsForActor(exposed.actor, { category: "FIRE" });
    expect(mine.map((a) => a.id)).toContain(alertId);
    expect(await getAlertDetail(exposed.actor, alertId)).not.toBeNull();

    // Même commune : sans le filtre des feux, la voisine verrait l'alerte.
    expect(await alertCommuneIds(neighbour)).toContain(exposed.communeId);
    const theirs = await listAlertsForActor(neighbour, { category: "FIRE" });
    expect(theirs.map((a) => a.id)).not.toContain(alertId);
    expect(await getAlertDetail(neighbour, alertId)).toBeNull();
  });

  it("dit au producteur la distance et la direction depuis SA parcelle", async () => {
    // Seuls les envois de cette alerte partent : placés en tête de file, et le passage limité à
    // leur nombre. La base de démonstration en garde d'autres en attente, qui ne sont pas à ce test.
    const ours = await prisma.alertRecipient.updateMany({
      where: { alertId, status: "PENDING", channel: { in: ["WHATSAPP", "SMS"] } },
      data: { nextAttemptAt: new Date(0) },
    });
    expect(ours.count).toBeGreaterThanOrEqual(1);
    const channel = new FixtureMessagingChannel();
    await dispatchPendingDeliveries({
      now,
      messaging: { WHATSAPP: channel, SMS: channel },
      limit: ours.count,
    });
    const textsTo = (phone: string) =>
      channel.sent.flatMap((m) => (m.kind === "TEXT" && m.to === phone ? [m.text] : []));
    const texts = textsTo(ENROLLED_PHONE);
    expect(texts.length).toBe(1);
    const text = texts[0] ?? "";
    expect(text).toMatch(/au nord de votre champ/);
    expect(text).toContain("118");
    expect(text).toMatch(/à vérifier sur place/i);
    // Fiche de démonstration : l'alerte reste dans l'application, rien ne part vers son numéro.
    expect(textsTo(FARMER_PHONE)).toEqual([]);
    expect(channel.sent.every((m) => m.kind === "TEXT" && m.to === ENROLLED_PHONE)).toBe(true);
  });

  it("montre à l'agent l'exploitation exposée, avec la distance du feu", async () => {
    const farms = await listAffectedFarms(agent, alertId);
    const farm = farms.find((f) => f.farmId === exposed.farmId);
    expect(farm?.fire).toMatchObject({ direction: "au nord", critical: true });
    expect(farm?.fire?.distanceM).toBeLessThan(500);
    expect(farms.some((f) => f.farmId === neighbourIds.farm)).toBe(false);
  });
});
