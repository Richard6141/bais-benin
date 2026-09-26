import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import { resolveRequest, takeChargeOfRequest } from "@/modules/assistance";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import {
  WHATSAPP_CONSENT_TEXT,
  sendFarmerNotifications,
  setWhatsappConsent,
  whatsappConsentOf,
} from "@/modules/notifications";
import { reviewReport } from "@/modules/reports";
import { applySyncBatch } from "@/modules/sync";
import { FixtureMessagingChannel } from "@/services/messaging/fixture/fixture-channel";

// Messages WhatsApp de suivi au producteur : demande prise en charge puis résolue, signalement
// écarté. La fiche de l'agricultrice de démonstration est synthétique (aucun envoi hors
// application) : le test la passe en « déclarée » le temps du parcours, puis la rétablit.

const AGENT_PHONE = "+2290190000001";
const FARMER_PHONE = "+2290190000002";
const DEVICE = "test-device-follow-up";
// Une heure avant l'exécution : une date d'observation de plus de 60 jours est refusée.
const AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();
// 10 h 00 à Porto-Novo : hors silence nocturne.
const DAY = new Date("2026-09-25T09:00:00Z");
const since = new Date();
const ids = {
  request: "019284a0-0000-7000-8000-0000000f1001",
  report: "019284a0-0000-7000-8000-0000000f1002",
};

let farmer: Actor;
let agent: Actor;
let ministry: Actor;
let farmerRecord: { id: string; reliability: string };
let farmId: string;
const fixture = new FixtureMessagingChannel();

async function actorFor(where: { phoneNumber?: string; email?: string }) {
  const user = await prisma.user.findFirstOrThrow({ where, select: { id: true } });
  return loadActor(user.id);
}

function command(id: string, type: string, payload: unknown) {
  return {
    id,
    type,
    payload,
    idempotencyKey: `follow-${id}`,
    clientCreatedAt: AT,
    deviceId: DEVICE,
  };
}

describe("messages de suivi au producteur", () => {
  beforeAll(async () => {
    await seedReferenceData();
    farmer = await actorFor({ phoneNumber: FARMER_PHONE });
    agent = await actorFor({ phoneNumber: AGENT_PHONE });
    ministry = await actorFor({ email: "ministere@bais.demo" });
    farmerRecord = await prisma.farmer.findUniqueOrThrow({
      where: { userId: farmer.userId },
      select: { id: true, reliability: true },
    });
    await prisma.farmer.update({
      where: { id: farmerRecord.id },
      data: { reliability: "DECLARED" },
    });
    const farm = await prisma.farm.findFirstOrThrow({
      where: { farmerId: farmerRecord.id, archivedAt: null },
      select: { id: true },
    });
    farmId = farm.id;
  }, 180_000);

  afterAll(async () => {
    await prisma.farmer.update({
      where: { id: farmerRecord.id },
      data: { reliability: farmerRecord.reliability as "SYNTHETIC" },
    });
    await setWhatsappConsent(farmer, true);
    await prisma.farmerNotification.deleteMany({
      where: { subjectId: { in: Object.values(ids) } },
    });
    await prisma.assistanceRequest.deleteMany({ where: { id: ids.request } });
    await prisma.fieldReport.deleteMany({ where: { id: ids.report } });
    await prisma.farmEvent.deleteMany({
      where: {
        farmId,
        kind: { in: ["ASSISTANCE_REQUESTED", "REPORT_SUBMITTED", "REPORT_REVIEWED"] },
      },
    });
    await prisma.syncCommand.deleteMany({ where: { deviceId: DEVICE } });
    await prisma.auditLog.deleteMany({
      where: { action: { startsWith: "consent." }, occurredAt: { gte: since } },
    });
    await prisma.$disconnect();
  });

  it("laisse le producteur, et lui seul, donner son accord depuis son compte", async () => {
    expect(await setWhatsappConsent(agent, true)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await setWhatsappConsent(farmer, true, DAY)).toEqual({ ok: true });
    expect(await whatsappConsentOf(farmer)).toEqual({ available: true, grantedAt: DAY });
    // La version du texte accepté est gardée avec l'accord (preuve APDP).
    const stored = await prisma.channelConsent.findUniqueOrThrow({
      where: { farmerId_channel: { farmerId: farmerRecord.id, channel: "WHATSAPP" } },
    });
    expect(stored).toMatchObject({ method: "OTP", textVersion: WHATSAPP_CONSENT_TEXT.version });
  });

  it("prévient le producteur quand sa demande est prise en charge, une seule fois", async () => {
    const [created] = await applySyncBatch(farmer, DEVICE, [
      command(ids.request, "assistance.request", {
        id: ids.request,
        category: "INPUT",
        description: "Engrais promis toujours pas livrés",
        farmId,
        requestedAt: AT,
      }),
    ]);
    expect(created?.outcome).toBe("APPLIED");

    const taken = await takeChargeOfRequest(agent, ids.request, DAY);
    expect(taken).toMatchObject({ ok: true, notificationId: expect.any(String) });
    const summary = await sendFarmerNotifications({ messaging: fixture, now: DAY });
    expect(summary).toMatchObject({ sent: 1, quotaReached: false });
    expect(fixture.sent).toHaveLength(1);
    const consent = await prisma.channelConsent.findUniqueOrThrow({
      where: { farmerId_channel: { farmerId: farmerRecord.id, channel: "WHATSAPP" } },
    });
    expect(fixture.sent[0]).toMatchObject({
      kind: "TEXT",
      to: FARMER_PHONE,
      consentReference: consent.id,
    });
    expect(fixture.sent[0]?.kind === "TEXT" && fixture.sent[0].text).toContain("(intrants)");

    // Deuxième passage (tâche planifiée après l'envoi immédiat) : rien ne repart.
    expect((await sendFarmerNotifications({ messaging: fixture, now: DAY })).considered).toBe(0);
    expect(fixture.sent).toHaveLength(1);
  });

  it("n'envoie plus rien une fois l'accord retiré", async () => {
    expect(await setWhatsappConsent(farmer, false, DAY)).toEqual({ ok: true });
    expect((await whatsappConsentOf(farmer)).grantedAt).toBeNull();
    const resolved = await resolveRequest(agent, ids.request, "Engrais livrés au magasin", DAY);
    expect(resolved.ok && resolved.notificationId).toBeTruthy();
    const summary = await sendFarmerNotifications({ messaging: fixture, now: DAY });
    expect(summary).toMatchObject({ skipped: 1, sent: 0 });
    expect(fixture.sent).toHaveLength(1);
    const row = await prisma.farmerNotification.findUniqueOrThrow({
      where: { kind_subjectId: { kind: "ASSISTANCE_RESOLVED", subjectId: ids.request } },
    });
    expect(row).toMatchObject({
      status: "SKIPPED",
      failureReason: expect.stringContaining("retiré"),
    });
  });

  it("met en file le motif d'un signalement écarté, pour le producteur de l'exploitation", async () => {
    await setWhatsappConsent(farmer, true, DAY);
    const [created] = await applySyncBatch(farmer, DEVICE, [
      command(ids.report, "fieldReport.create", {
        id: ids.report,
        farmId,
        type: "PEST",
        description: "Criquets sur le sorgho",
        observedAt: AT,
      }),
    ]);
    expect(created?.outcome).toBe("APPLIED");
    const reviewed = await reviewReport(ministry, ids.report, "DISMISSED", "Aucun criquet vu", DAY);
    expect(reviewed).toMatchObject({ ok: true, notificationId: expect.any(String) });
    await sendFarmerNotifications({ messaging: fixture, now: DAY });
    const last = fixture.sent.at(-1);
    expect(last?.kind === "TEXT" && last.text).toContain("Motif : « Aucun criquet vu »");
  });
});
