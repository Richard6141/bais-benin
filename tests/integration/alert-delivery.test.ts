import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  AlertAccessError,
  acknowledgeAlert,
  applyWapyEvent,
  dispatchPendingDeliveries,
  planAlertRecipients,
  relayAlert,
} from "@/modules/monitoring/delivery";
import { applySyncBatch } from "@/modules/sync";
import { FixtureMessagingChannel } from "@/services/messaging/fixture/fixture-channel";

// Diffusion d'une alerte sur Djougou (BJ-DON-003) : plan des destinataires à partir du registre
// synthétique et des consentements du seed, envoi par un canal de test, accusé de lecture,
// relais par l'agent (en ligne et par synchronisation), webhook wapy.pro. Règle et alertes sont
// créées par le test et supprimées à la fin (les destinataires suivent en cascade).

const DJOUGOU = "BJ-DON-003";
const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";
// 10 h 00 à Porto-Novo : hors silence nocturne.
const DAY = new Date("2026-09-25T09:00:00Z");
const DEVICE = "test-device-alert-relay";

const created = { ruleId: "", alertIds: [] as string[] };
let agent: Actor;
let farmer: Actor;
let buyer: Actor;
let liveAlertId: string;
let syntheticAlertId: string;

async function actorFor(where: { phoneNumber?: string; email?: string }) {
  const user = await prisma.user.findFirstOrThrow({ where, select: { id: true } });
  return loadActor(user.id);
}

// Une seule alerte active par commune et par catégorie (index alert_one_active_per_category) :
// chaque alerte de test prend une catégorie distincte, jamais celle de l'épisode de démonstration
// de Djougou (stress hydrique).
const TEST_CATEGORIES = ["MARKET", "ADMIN", "PEST", "HEAT", "FLOOD"] as const;
let categoryIndex = 0;

async function createAlert(reliability: "ESTIMATED" | "SYNTHETIC") {
  const category = TEST_CATEGORIES[categoryIndex++ % TEST_CATEGORIES.length] ?? "MARKET";
  const commune = await prisma.commune.findUniqueOrThrow({ where: { code: DJOUGOU } });
  const alert = await prisma.alert.create({
    data: {
      ruleId: created.ruleId,
      ruleVersion: 1,
      severity: "WARNING",
      category,
      title: "Poche de sécheresse (test)",
      messageFr: "Djougou : 12 jours sans pluie utile.",
      messageShort: "BAIS Djougou : 12 jours sans pluie. Paillez vos semis.",
      adviceFr: "Paillez les jeunes plants.",
      communeId: commune.id,
      indicators: {},
      trace: [],
      startsAt: DAY,
      sourceId: reliability === "SYNTHETIC" ? "BAIS_SEED" : "OPEN_METEO",
      sourceDate: DAY,
      reliability,
    },
  });
  created.alertIds.push(alert.id);
  return alert.id;
}

describe("diffusion des alertes", () => {
  beforeAll(async () => {
    await seedReferenceData();
    const rule = await prisma.rule.create({
      data: {
        code: "TEST_DELIVERY_V1",
        version: 1,
        name: "Règle de test de diffusion",
        description: "Maïs en place et moins de 5 mm en 10 jours (test).",
        severity: "WARNING",
        category: "WATER_STRESS",
        definition: {
          all: [
            { indicator: "crop_in", value: ["MAIZE"] },
            { indicator: "crop_stage_in", value: ["SOWN", "GROWING", "FLOWERING"] },
            { indicator: "rain_sum_10d", op: "<", value: 5 },
          ],
        },
        messageFr: "{commune} : sécheresse.",
        messageShort: "BAIS {commune} : sécheresse.",
        adviceFr: "Paillez les jeunes plants.",
        sourceId: "BAIS_SEED",
      },
    });
    created.ruleId = rule.id;
    agent = await actorFor({ phoneNumber: AGENT_PHONE });
    farmer = await actorFor({ phoneNumber: FARMER_PHONE });
    buyer = await actorFor({ email: "acheteur@bais.demo" });
    liveAlertId = await createAlert("ESTIMATED");
    syntheticAlertId = await createAlert("SYNTHETIC");
  }, 180_000);

  afterAll(async () => {
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.farmEvent.deleteMany({
      where: { kind: "ALERT_RELAYED", occurredAt: { gte: DAY } },
    });
    await prisma.alert.deleteMany({ where: { id: { in: created.alertIds } } });
    await prisma.rule.deleteMany({ where: { id: created.ruleId } });
    await prisma.$disconnect();
  });

  it("planifie les destinataires : exploitations de maïs, canaux selon consentement, agents", async () => {
    const summary = await planAlertRecipients(prisma, liveAlertId, DAY);
    const campaign = await prisma.agriculturalCampaign.findFirstOrThrow({
      where: { status: "OPEN" },
    });
    const expectedFarms = await prisma.farm.findMany({
      where: {
        archivedAt: null,
        commune: { code: DJOUGOU },
        parcels: {
          some: {
            archivedAt: null,
            crops: {
              some: {
                archivedAt: null,
                campaignId: campaign.id,
                crop: { code: "MAIZE" },
                stage: { in: ["SOWN", "GROWING", "FLOWERING"] },
              },
            },
          },
        },
      },
      select: { id: true, declaredAreaHa: true },
    });
    expect(expectedFarms.length).toBeGreaterThan(0);
    expect(summary.affectedFarmCount).toBe(expectedFarms.length);
    expect(summary.created).toBeGreaterThan(expectedFarms.length);

    const rows = await prisma.alertRecipient.findMany({
      where: { alertId: liveAlertId },
      include: {
        farm: { select: { farmer: { select: { channelConsents: true, phoneE164: true } } } },
      },
    });
    // Une et une seule ligne sortante (WhatsApp, SMS ou relais) par exploitation.
    const outbound = rows.filter((r) => r.channel !== "IN_APP");
    expect(outbound).toHaveLength(expectedFarms.length);
    for (const row of outbound) {
      const consents = new Set(
        row.farm?.farmer.channelConsents.filter((c) => c.granted).map((c) => c.channel),
      );
      if (row.channel === "WHATSAPP") expect(consents.has("WHATSAPP")).toBe(true);
      if (row.channel === "SMS") expect(consents.has("WHATSAPP")).toBe(false);
      if (row.channel === "RELAY")
        expect(consents.size === 0 || !row.farm?.farmer.phoneE164).toBe(true);
    }
    expect(summary.byChannel.WHATSAPP).toBeGreaterThan(0);
    // L'agent de Djougou reçoit l'alerte dans l'application.
    expect(rows.some((r) => r.channel === "IN_APP" && r.userId === agent.userId)).toBe(true);

    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: liveAlertId } });
    const area = expectedFarms.reduce((sum, f) => sum + Number(f.declaredAreaHa), 0);
    expect(alert.affectedFarmCount).toBe(expectedFarms.length);
    expect(Number(alert.affectedAreaHa)).toBeCloseTo(area, 1);
  });

  it("est idempotent : un second plan ne crée aucune ligne", async () => {
    const before = await prisma.alertRecipient.count({ where: { alertId: liveAlertId } });
    const again = await planAlertRecipients(prisma, liveAlertId, DAY);
    expect(again.created).toBe(0);
    expect(again.existing).toBe(before);
    expect(await prisma.alertRecipient.count({ where: { alertId: liveAlertId } })).toBe(before);
  });

  it("envoie les messages en journée, jamais ceux d'une alerte de démonstration", async () => {
    await planAlertRecipients(prisma, syntheticAlertId, DAY);
    // Une seule instance pour les deux canaux : les identifiants de message restent uniques,
    // comme chez le fournisseur réel.
    const channel = new FixtureMessagingChannel();
    const summary = await dispatchPendingDeliveries({
      now: DAY,
      messaging: { WHATSAPP: channel, SMS: channel },
      limit: 1000,
    });
    expect(summary.sent).toBeGreaterThan(0);

    const synthetic = await prisma.alertRecipient.findMany({
      where: { alertId: syntheticAlertId, channel: { in: ["WHATSAPP", "SMS"] } },
    });
    expect(synthetic.length).toBeGreaterThan(0);
    expect(synthetic.every((r) => r.status === "SKIPPED")).toBe(true);

    const live = await prisma.alertRecipient.findMany({
      where: { alertId: liveAlertId, channel: "WHATSAPP" },
    });
    expect(live.every((r) => r.status === "SENT" && r.providerMessageId && r.sentAt)).toBe(true);
    const sent = channel.sent;
    expect(
      sent.every((m) => m.kind === "TEXT" && m.idempotencyKey.startsWith(`alert-${liveAlertId}-`)),
    ).toBe(true);
  });

  it("enregistre l'accusé de lecture du destinataire et refuse un non-destinataire", async () => {
    const result = await acknowledgeAlert(agent, liveAlertId, DAY);
    expect(result.acknowledged).toBe(1);
    const row = await prisma.alertRecipient.findFirstOrThrow({
      where: { alertId: liveAlertId, userId: agent.userId },
    });
    expect(row.status).toBe("READ");
    await expect(acknowledgeAlert(buyer, liveAlertId, DAY)).rejects.toBeInstanceOf(
      AlertAccessError,
    );
  });

  it("met à jour la remise et la lecture depuis le webhook wapy.pro", async () => {
    const [first, second] = await prisma.alertRecipient.findMany({
      where: { alertId: liveAlertId, channel: "WHATSAPP", status: "SENT" },
      take: 2,
    });
    if (!first?.providerMessageId || !second?.phoneE164)
      throw new Error("Deux envois WhatsApp attendus");
    const delivered = await applyWapyEvent(
      { evenement: "remise", message_id: first.providerMessageId, remise: "lu" },
      DAY,
    );
    expect(delivered).toMatchObject({ handled: true, updated: 1 });
    expect(
      (await prisma.alertRecipient.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe("READ");

    const reply = await applyWapyEvent(
      { evenement: "reponse", de: second.phoneE164, texte: "OK" },
      DAY,
    );
    expect(reply).toMatchObject({ handled: true, kind: "reponse" });
    const secondRow = await prisma.alertRecipient.findUniqueOrThrow({ where: { id: second.id } });
    expect(secondRow.status).toBe("READ");
    expect(secondRow.acknowledgedAt).not.toBeNull();
    // Un message inconnu est ignoré sans erreur.
    expect(
      (await applyWapyEvent({ evenement: "remise", message_id: "inconnu", remise: "lu" }, DAY))
        .handled,
    ).toBe(false);
  });

  it("trace le relais de l'agent, en ligne et hors ligne, et le refuse au producteur", async () => {
    const farms = await prisma.alertRecipient.findMany({
      where: { alertId: liveAlertId, channel: { not: "IN_APP" }, farmId: { not: null } },
      select: { farmId: true },
      take: 2,
    });
    const [online, offline] = farms.map((f) => f.farmId as string);
    if (!online || !offline) throw new Error("Deux exploitations attendues");

    const first = await relayAlert(
      agent,
      { alertId: liveAlertId, farmId: online, mode: "CALL" },
      DAY,
    );
    expect(first.created).toBe(true);
    expect(
      (await relayAlert(agent, { alertId: liveAlertId, farmId: online, mode: "CALL" }, DAY))
        .created,
    ).toBe(false);
    const relayed = await prisma.alertRecipient.findUniqueOrThrow({
      where: { id: first.recipientId },
    });
    expect(relayed).toMatchObject({
      status: "RELAYED",
      relayedById: agent.userId,
      relayMode: "CALL",
    });
    await expect(
      relayAlert(farmer, { alertId: liveAlertId, farmId: online, mode: "VISIT" }, DAY),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const id = "019284a0-0000-7000-8000-00000000d001";
    const command = {
      id,
      type: "alert.relay",
      idempotencyKey: `it-${id}`,
      clientCreatedAt: DAY.toISOString(),
      deviceId: DEVICE,
      payload: {
        id,
        alertId: liveAlertId,
        farmId: offline,
        mode: "VISIT",
        note: "Prévenu au champ",
        relayedAt: DAY.toISOString(),
      },
    };
    const [applied] = await applySyncBatch(agent, DEVICE, [command]);
    expect(applied?.outcome).toBe("APPLIED");
    const [replayed] = await applySyncBatch(agent, DEVICE, [command]);
    expect(replayed?.outcome).toBe("DUPLICATE");
    const event = await prisma.farmEvent.findFirst({
      where: { farmId: offline, kind: "ALERT_RELAYED" },
    });
    expect(event).not.toBeNull();
  });
});
