import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  FeedbackError,
  countNewFeedback,
  createFeedback,
  exportFeedbackCsv,
  listFeedback,
  setFeedbackStatus,
} from "@/modules/feedback";
import { loadActor } from "@/modules/identity";

// Avis des testeurs (chantier J) sur la vraie base : un agriculteur dépose un avis masqué, un
// agent ne lit pas la liste, le ministère change l'état (journalisé), la limite de débit tient.

const FARMER_PHONE = "+2290190000002";
const AGENT_PHONE = "+2290190000001";
const MINISTRY_PHONE = "+2290190000003";
const MARKER = "test-integration-avis";

async function account(phone: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { phoneNumber: phone },
    select: { id: true },
  });
  return { id: user.id, actor: await loadActor(user.id) };
}

describe("avis des testeurs", () => {
  beforeAll(async () => {
    const farmer = await account(FARMER_PHONE);
    await prisma.rateLimit.deleteMany({ where: { key: `feedback:${farmer.id}` } });
  });

  afterAll(async () => {
    const farmer = await account(FARMER_PHONE);
    await prisma.testerFeedback.deleteMany({ where: { message: { contains: MARKER } } });
    await prisma.rateLimit.deleteMany({ where: { key: `feedback:${farmer.id}` } });
    await prisma.$disconnect();
  });

  it("enregistre l'avis d'un agriculteur, numéros masqués, rôle et page ajoutés", async () => {
    const farmer = await account(FARMER_PHONE);
    const { id } = await createFeedback(farmer.actor, {
      kind: "CONFUSING",
      message: `${MARKER} je ne comprends pas la carte, rappelez-moi au 01 97 12 34 56`,
      rating: 3,
      pagePath: "/agriculteur/champs?parcelle=abc#haut",
      device: "MOBILE",
    });
    const stored = await prisma.testerFeedback.findUniqueOrThrow({ where: { id } });
    expect(stored.message).toContain("[numéro masqué]");
    expect(stored.message).not.toContain("97 12 34 56");
    expect(stored).toMatchObject({
      role: "FARMER",
      kind: "CONFUSING",
      rating: 3,
      pagePath: "/agriculteur/champs",
      device: "MOBILE",
      status: "NEW",
      authorId: farmer.id,
    });
  });

  it("refuse la liste à un agent, la donne au ministère sans l'auteur", async () => {
    const agent = await account(AGENT_PHONE);
    await expect(listFeedback(agent.actor)).rejects.toBeInstanceOf(FeedbackError);
    expect(await countNewFeedback(agent.actor)).toBeNull();
    await expect(exportFeedbackCsv(agent.actor)).rejects.toBeInstanceOf(FeedbackError);

    const ministry = await account(MINISTRY_PHONE);
    const rows = await listFeedback(ministry.actor, { role: "FARMER", kind: "CONFUSING" });
    const mine = rows.find((row) => row.message.includes(MARKER))!;
    expect(mine).toBeDefined();
    expect(Object.keys(mine)).not.toContain("authorId");
    expect(await countNewFeedback(ministry.actor)).toBeGreaterThanOrEqual(1);
    const exportedFrom = new Date(Date.now() - 1000);
    const csv = await exportFeedbackCsv(ministry.actor, { role: "FARMER" });
    expect(csv.content).toContain("C'est difficile à comprendre");
    const exported = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "feedback.exported",
        actorId: ministry.id,
        occurredAt: { gte: exportedFrom },
      },
      select: { details: true },
    });
    expect(exported.details).toMatchObject({ role: "FARMER" });
    expect((exported.details as { rows: number }).rows).toBeGreaterThanOrEqual(1);
  });

  it("laisse le ministère changer l'état, et le journalise", async () => {
    const ministry = await account(MINISTRY_PHONE);
    const target = await prisma.testerFeedback.findFirstOrThrow({
      where: { message: { contains: MARKER } },
      select: { id: true },
    });
    await setFeedbackStatus(ministry.actor, target.id, "SEEN");
    await setFeedbackStatus(ministry.actor, target.id, "DONE");
    const stored = await prisma.testerFeedback.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.status).toBe("DONE");
    expect(stored.statusChangedById).toBe(ministry.id);
    const audits = await prisma.auditLog.findMany({
      where: { action: "feedback.status.changed", resourceId: target.id },
      orderBy: { occurredAt: "asc" },
      select: { details: true },
    });
    expect(audits.map((entry) => entry.details)).toEqual([
      { from: "NEW", to: "SEEN" },
      { from: "SEEN", to: "DONE" },
    ]);
    const agent = await account(AGENT_PHONE);
    await expect(setFeedbackStatus(agent.actor, target.id, "NEW")).rejects.toBeInstanceOf(
      FeedbackError,
    );
  });

  it("limite les avis d'un même compte à dix par heure", async () => {
    const farmer = await account(FARMER_PHONE);
    await prisma.rateLimit.deleteMany({ where: { key: `feedback:${farmer.id}` } });
    const send = () =>
      createFeedback(farmer.actor, {
        kind: "IDEA",
        message: `${MARKER} une idée`,
        pagePath: "/agriculteur",
        device: "DESKTOP",
      });
    for (let index = 0; index < 10; index += 1) await send();
    await expect(send()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
