import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { seedReferenceData } from "@/database/seed";
import type { ChannelConsent, Reliability } from "@/generated/prisma/client";
import { AnalyticsError, getProducerRanking } from "@/modules/analytics";
import type { Actor } from "@/modules/authorization";
import { loadActor } from "@/modules/identity";
import { sendFarmerNotifications } from "@/modules/notifications";
import {
  archiveGroup,
  createGroupFromRanking,
  exportGroupCsv,
  getGroup,
  groupMessageSubjectId,
  listGroups,
  sendGroupMessage,
} from "@/modules/producer-groups";
import { FixtureMessagingChannel } from "@/services/messaging/fixture/fixture-channel";

// Groupes de producteurs (ADR-0024) sur le registre de démonstration : formation depuis le
// palmarès, refus hors ministère, lecture journalisée, message WhatsApp aux seuls membres
// consentants. Les fiches semées sont synthétiques : une seule est passée en « déclarée » le temps
// du test, pour vérifier qu'elle, et elle seule, reçoit le message. Groupes, messages, journal et
// accords modifiés ici sont retirés ou rétablis à la fin.

const since = new Date();
// 10 h 00 à Porto-Novo : hors silence nocturne.
const DAY = new Date("2026-09-25T09:00:00Z");
const CRITERIA = { cropCode: "COTTON", limit: "20" };
const fixture = new FixtureMessagingChannel();

let ministry: Actor;
let agent: Actor;
let farmer: Actor;
let groupId = "";
let memberIds: string[] = [];
const restore: {
  reliability: { id: string; value: Reliability } | null;
  consents: Array<{ farmerId: string; original: ChannelConsent | null }>;
} = { reliability: null, consents: [] };

async function actorFor(where: { phoneNumber?: string; email?: string }) {
  const user = await prisma.user.findFirstOrThrow({ where, select: { id: true } });
  return loadActor(user.id);
}

async function whatsappConsent(farmerId: string) {
  return prisma.channelConsent.findUnique({
    where: { farmerId_channel: { farmerId, channel: "WHATSAPP" } },
  });
}

describe("groupes de producteurs", () => {
  beforeAll(async () => {
    await seedReferenceData();
    ministry = await actorFor({ email: "ministere@bais.demo" });
    agent = await actorFor({ phoneNumber: "+2290190000001" });
    farmer = await actorFor({ phoneNumber: "+2290190000002" });
  }, 240_000);

  afterAll(async () => {
    await prisma.farmerNotification.deleteMany({
      where: { kind: "GROUP_MESSAGE", createdAt: { gte: since } },
    });
    await prisma.producerGroup.deleteMany({ where: { createdAt: { gte: since } } });
    if (restore.reliability) {
      await prisma.farmer.update({
        where: { id: restore.reliability.id },
        data: { reliability: restore.reliability.value },
      });
    }
    for (const { farmerId, original } of restore.consents) {
      if (!original) {
        await prisma.channelConsent.deleteMany({ where: { farmerId, channel: "WHATSAPP" } });
        continue;
      }
      const { id, ...values } = original;
      await prisma.channelConsent.update({ where: { id }, data: values });
    }
    await prisma.auditLog.deleteMany({
      where: {
        action: {
          in: [
            "analytics.ranking.read",
            "group.created",
            "group.read",
            "group.exported",
            "group.messaged",
            "group.archived",
          ],
        },
        occurredAt: { gte: since },
      },
    });
    await prisma.$disconnect();
  });

  it("forme un groupe avec les producteurs du palmarès, dans son ordre", async () => {
    expect(await createGroupFromRanking(ministry, CRITERIA, "  ", 20)).toEqual({
      ok: false,
      code: "INVALID_NAME",
    });
    expect(await createGroupFromRanking(ministry, CRITERIA, "Coton test", 0)).toEqual({
      ok: false,
      code: "INVALID",
    });
    expect(
      await createGroupFromRanking(ministry, { ...CRITERIA, campaignCode: "1990-1991" }, "Test", 5),
    ).toEqual({ ok: false, code: "INVALID" });

    const ranking = await getProducerRanking(ministry, CRITERIA);
    expect(ranking.rows.length).toBeGreaterThanOrEqual(3);
    // Même si le navigateur envoyait autre chose, seuls les critères comptent.
    const created = await createGroupFromRanking(
      ministry,
      { ...CRITERIA, members: ["00000000-0000-4000-8000-000000000000"] },
      "Coton, Bénin, test d'intégration",
      20,
    );
    expect(created).toMatchObject({ ok: true, members: ranking.rows.length });
    groupId = created.ok ? created.id : "";

    const stored = await prisma.producerGroupMember.findMany({
      where: { groupId },
      orderBy: { rank: "asc" },
    });
    memberIds = stored.map((m) => m.farmerId);
    expect(memberIds).toEqual(ranking.rows.map((r) => r.farmerId));
    expect(stored.map((m) => m.rank)).toEqual(ranking.rows.map((r) => r.rank));
    expect(Number(stored[0]!.producedKg) / 1000).toBeCloseTo(ranking.rows[0]!.productionT, 2);

    const group = await prisma.producerGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: { crop: true, campaign: true },
    });
    expect(group.crop.code).toBe("COTTON");
    expect(group.campaign.code).toBe(ranking.campaign.code);
    expect(group.criteria).toMatchObject({ cropCode: "COTTON", verifiedOnly: true, limit: 20 });

    const listed = await listGroups(ministry);
    expect(listed.find((g) => g.id === groupId)).toMatchObject({
      members: ranking.rows.length,
      cropName: group.crop.nameFr,
      archivedAt: null,
    });
  });

  it("refuse les groupes à l'agent et au producteur", async () => {
    for (const actor of [agent, farmer]) {
      expect(await createGroupFromRanking(actor, CRITERIA, "Groupe interdit", 10)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      await expect(listGroups(actor)).rejects.toBeInstanceOf(AnalyticsError);
      await expect(getGroup(actor, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(exportGroupCsv(actor, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await sendGroupMessage(actor, groupId, "Bonjour")).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await archiveGroup(actor, groupId)).toEqual({ ok: false, code: "FORBIDDEN" });
    }
    expect(await prisma.producerGroupMessage.count({ where: { groupId } })).toBe(0);
  });

  it("journalise chaque lecture et chaque export de la liste nominative", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "group.read", resourceId: groupId },
    });
    const group = await getGroup(ministry, groupId);
    expect(group?.members.map((m) => m.farmerId)).toEqual(memberIds);
    expect(group?.members.every((m) => m.parcelId !== null)).toBe(true);
    expect(group?.figures.members).toBe(memberIds.length);
    const reads = await prisma.auditLog.findMany({
      where: { action: "group.read", resourceId: groupId },
      orderBy: { occurredAt: "desc" },
    });
    expect(reads).toHaveLength(before + 1);
    expect(reads[0]).toMatchObject({
      actorId: ministry.userId,
      resourceType: "producerGroup",
      details: { groupId, rows: memberIds.length },
    });

    const file = await exportGroupCsv(ministry, groupId);
    expect(file?.filename).toMatch(/^groupe-cotton-\d{4}-\d{4}-[0-9a-f]{8}\.csv$/);
    const lines = file!.content.trim().split("\r\n");
    expect(lines[0]).toContain("rang;code_producteur;producteur;telephone");
    expect(lines).toHaveLength(memberIds.length + 1);
    expect(
      await prisma.auditLog.count({ where: { action: "group.exported", resourceId: groupId } }),
    ).toBe(1);

    expect(await getGroup(ministry, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getGroup(ministry, "pas-un-identifiant")).toBeNull();
  });

  it("n'écrit qu'aux membres consentants et jamais aux fiches de démonstration", async () => {
    const members = await prisma.farmer.findMany({
      where: { id: { in: memberIds }, phoneE164: { not: null } },
      select: { id: true, phoneE164: true, reliability: true },
    });
    expect(members.length).toBeGreaterThanOrEqual(2);
    const [real, mute] = [members[0]!, members[1]!];
    // Un membre consentant sur une fiche « déclarée » (numéro réel), un membre sans accord.
    restore.reliability = { id: real.id, value: real.reliability };
    await prisma.farmer.update({ where: { id: real.id }, data: { reliability: "DECLARED" } });
    for (const id of [real.id, mute.id]) {
      restore.consents.push({ farmerId: id, original: await whatsappConsent(id) });
    }
    await prisma.channelConsent.upsert({
      where: { farmerId_channel: { farmerId: real.id, channel: "WHATSAPP" } },
      create: {
        farmerId: real.id,
        channel: "WHATSAPP",
        granted: true,
        grantedAt: since,
        method: "AGENT_FORM",
        evidence: "test-groupes",
      },
      update: { granted: true, revokedAt: null },
    });
    await prisma.channelConsent.updateMany({
      where: { farmerId: mute.id, channel: "WHATSAPP" },
      data: { granted: false, revokedAt: since },
    });
    const expected = (
      await prisma.channelConsent.findMany({
        where: { farmerId: { in: memberIds }, channel: "WHATSAPP", granted: true, revokedAt: null },
        select: { farmerId: true },
      })
    ).map((c) => c.farmerId);
    expect(expected).toContain(real.id);
    expect(expected).not.toContain(mute.id);

    expect(await sendGroupMessage(ministry, groupId, "   ")).toEqual({
      ok: false,
      code: "EMPTY",
    });
    expect(await sendGroupMessage(ministry, groupId, "x".repeat(501))).toEqual({
      ok: false,
      code: "TOO_LONG",
    });
    expect(await sendGroupMessage(ministry, groupId, "Voir www.prime-coton.com")).toEqual({
      ok: false,
      code: "LINK",
    });

    const text = "Réunion des meilleurs producteurs de coton lundi à 9 h, à la mairie.";
    const sent = await sendGroupMessage(ministry, groupId, `  ${text}  `, DAY);
    expect(sent).toMatchObject({
      ok: true,
      members: memberIds.length,
      consented: expected.length,
      queued: expected.length,
      demo: expected.length - 1,
    });
    if (!sent.ok) throw new Error("envoi refusé");
    // Double clic : le même texte n'est pas renvoyé au même groupe.
    expect(await sendGroupMessage(ministry, groupId, text, DAY)).toEqual({
      ok: false,
      code: "DUPLICATE",
    });

    const queued = await prisma.farmerNotification.findMany({
      where: { id: { in: sent.notificationIds } },
    });
    expect(queued.map((n) => n.farmerId).sort()).toEqual([...expected].sort());
    for (const notification of queued) {
      expect(notification).toMatchObject({
        kind: "GROUP_MESSAGE",
        subjectId: groupMessageSubjectId(sent.messageId, notification.farmerId),
        text: `BAIS, ministère de l'Agriculture : ${text}`,
      });
    }

    const summary = await sendFarmerNotifications({
      messaging: fixture,
      now: DAY,
      ids: sent.notificationIds,
      limit: 500,
    });
    expect(summary).toMatchObject({ sent: 1, skipped: expected.length - 1, failed: 0 });
    expect(fixture.sent).toHaveLength(1);
    expect(fixture.sent[0]).toMatchObject({ kind: "TEXT", to: real.phoneE164 });
    const skipped = await prisma.farmerNotification.findMany({
      where: { id: { in: sent.notificationIds }, status: "SKIPPED" },
      select: { farmerId: true, failureReason: true },
    });
    expect(skipped.map((n) => n.farmerId)).not.toContain(real.id);
    expect(skipped.every((n) => n.failureReason?.includes("démonstration"))).toBe(true);

    const detail = await getGroup(ministry, groupId);
    expect(detail?.messages[0]).toMatchObject({
      text,
      recipients: expected.length,
      sent: 1,
      pending: 0,
      notSent: expected.length - 1,
    });
    expect(
      await prisma.auditLog.findFirst({ where: { action: "group.messaged", resourceId: groupId } }),
    ).toMatchObject({ details: { consented: expected.length, queued: expected.length } });
  });

  it("archive un groupe : consultable, mais plus de message", async () => {
    expect(await archiveGroup(ministry, groupId)).toEqual({ ok: true });
    expect(await archiveGroup(ministry, groupId)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await sendGroupMessage(ministry, groupId, "Encore un message")).toEqual({
      ok: false,
      code: "ARCHIVED",
    });
    expect((await getGroup(ministry, groupId))?.archivedAt).not.toBeNull();
    expect((await listGroups(ministry)).find((g) => g.id === groupId)?.archivedAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: "group.archived", resourceId: groupId } }),
    ).toBe(1);
  });
});
