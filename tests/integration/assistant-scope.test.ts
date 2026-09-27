import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { askAssistant, readJournal, recordFeedback, requestAgent } from "@/modules/assistant";
import {
  cleanupAssistant,
  providers,
  setupAssistant,
  type AssistantActors,
} from "./helpers/assistant";

// Assistant : périmètre de l'agent, indicateurs du ministère calculés par la plateforme, retours,
// demandes à l'agent, journal sans auteur, limite de questions par heure.

const started = new Date();
let actors: AssistantActors;

describe("assistant agricole : périmètre et journal", () => {
  beforeAll(async () => {
    actors = await setupAssistant();
  }, 240_000);

  afterAll(async () => {
    await cleanupAssistant(actors, started);
    await prisma.$disconnect();
  });

  it("limite le contexte de l'actors.agent à son périmètre", async () => {
    const outside = await prisma.farm.findFirstOrThrow({
      where: { archivedAt: null, commune: { code: { not: "BJ-DON-003" } } },
      select: { code: true },
    });
    await expect(
      askAssistant(
        actors.agent,
        { question: "Quand semer le maïs ?", farmCode: outside.code },
        providers,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Une exploitation que l'agent a enregistrée : il ne voit que celles-là (ADR-0014).
    const inside = await prisma.farm.findFirstOrThrow({
      where: {
        archivedAt: null,
        commune: { code: "BJ-DON-003" },
        registeredById: actors.agent.userId,
      },
      select: { code: true },
    });
    const reply = await askAssistant(
      actors.agent,
      {
        question: "Comment lutter contre la chenille légionnaire du maïs ?",
        farmCode: inside.code,
      },
      providers,
    );
    expect(reply.farmCode).toBe(inside.code);
    expect(JSON.stringify(reply.facts)).not.toMatch(/\+229|NPI/);
  });

  it("affiche au ministère un indicateur calculé par la plateforme, pas par le modèle", async () => {
    const reply = await askAssistant(
      actors.ministry,
      { question: "Combien d'exploitations de maïs sont enregistrées ?" },
      providers,
    );
    expect(reply.indicator).toMatchObject({ indicator: "overview", available: true });
    const count = await prisma.farm.count({
      where: {
        archivedAt: null,
        parcels: {
          some: {
            archivedAt: null,
            crops: { some: { archivedAt: null, crop: { code: "MAIZE" } } },
          },
        },
      },
    });
    expect(reply.indicator?.figures[0]).toMatchObject({ label: "Exploitations", value: count });
  });

  it("enregistre retours et demandes à l'actors.agent, et tient un journal sans auteur", async () => {
    const reply = await askAssistant(
      actors.farmer,
      { question: "Comment conserver le niébé contre les bruches ?" },
      providers,
    );
    await recordFeedback(actors.farmer, {
      messageId: reply.messageId,
      useful: false,
      reason: "UNCLEAR",
    });
    await recordFeedback(actors.farmer, { messageId: reply.messageId, useful: true });
    expect(await prisma.assistantFeedback.count({ where: { messageId: reply.messageId } })).toBe(1);
    await expect(
      recordFeedback(actors.agent, { messageId: reply.messageId, useful: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const request = await requestAgent(actors.farmer, reply.messageId);
    expect(request.requestId).toBeTruthy();
    const journal = await readJournal(actors.ministry, { limit: 200 });
    const entry = journal.find((e) => e.messageId === reply.messageId);
    expect(entry).toMatchObject({ role: "FARMER", useful: 1, notUseful: 0 });
    expect(entry?.question).toBe("Comment conserver le niébé contre les bruches ?");
    expect(Object.keys(entry ?? {})).not.toContain("userId");
    await expect(readJournal(actors.farmer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("limite le nombre de questions par heure", async () => {
    const conversation = await prisma.assistantConversation.create({
      data: {
        userId: actors.agent.userId,
        role: "AGENT_AGRICULTURE",
        purgeAfter: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.assistantMessage.createMany({
      data: Array.from({ length: 20 }, () => ({
        conversationId: conversation.id,
        role: "USER" as const,
        content: "Question",
      })),
    });
    await expect(
      askAssistant(actors.agent, { question: "Quand semer le maïs ?" }, providers),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
