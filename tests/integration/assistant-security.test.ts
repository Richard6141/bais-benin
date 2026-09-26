import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import {
  ERASED_QUESTION,
  askAssistant,
  purgeExpiredConversations,
  reserveQuestion,
} from "@/modules/assistant";
import type { AssistantProviders } from "@/services/assistant";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "@/services/ports/embedding-provider";
import type { AnswerRequest, LlmProvider } from "@/services/ports/llm-provider";
import {
  cleanupAssistant,
  embeddings,
  providers,
  setupAssistant,
  type AssistantActors,
} from "./helpers/assistant";

// Sécurité de l'assistant (revue de sécurité, étape 8) : ce qui part au fournisseur et ce qui est
// écrit en base est masqué ; le code d'exploitation n'est jamais transmis ; une panne du modèle de
// plongement est une issue normale ; la limite de débit tient face à des requêtes simultanées ;
// plafond global du jour ; texte des questions effacé après 90 jours.

const started = new Date();
let actors: AssistantActors;

/** Adaptateurs de démonstration qui gardent une copie de ce qui leur est envoyé. */
function spying(): { providers: AssistantProviders; prompts: AnswerRequest[]; embedded: string[] } {
  const prompts: AnswerRequest[] = [];
  const embedded: string[] = [];
  const llm: LlmProvider = {
    ...providers.llm,
    answer: (request) => {
      prompts.push(request);
      return providers.llm.answer(request);
    },
  };
  const spy: EmbeddingProvider = {
    ...embeddings,
    embed: (values) => {
      embedded.push(...values);
      return embeddings.embed(values);
    },
  };
  return { providers: { llm, embeddings: spy }, prompts, embedded };
}

describe("assistant agricole : sécurité", () => {
  beforeAll(async () => {
    actors = await setupAssistant();
  }, 240_000);

  afterAll(async () => {
    await cleanupAssistant(actors, started);
    await prisma.$disconnect();
  });

  it("masque téléphone, NPI et adresse avant l'envoi et avant l'écriture en base", async () => {
    const spy = spying();
    const reply = await askAssistant(
      actors.farmer,
      {
        question:
          "Je suis au 01 97 12 34 56, NPI 1234567890123, kofi@exemple.bj : comment conserver le niébé ?",
      },
      spy.providers,
    );
    const sent = JSON.stringify([spy.prompts, spy.embedded]);
    expect(sent).not.toMatch(/97 12 34 56|1234567890123|kofi@exemple/);
    const stored = await prisma.assistantMessage.findFirstOrThrow({
      where: { conversationId: reply.conversationId, role: "USER" },
    });
    expect(stored.content).toContain("[numéro masqué]");
    expect(stored.content).not.toMatch(/97 12 34 56|1234567890123|kofi@exemple/);
  });

  it("n'envoie pas le code de l'exploitation choisie par l'agent", async () => {
    // Une exploitation que l'agent a enregistrée : il ne voit que celles-là (ADR-0014).
    const farm = await prisma.farm.findFirstOrThrow({
      where: {
        archivedAt: null,
        commune: { code: "BJ-DON-003" },
        registeredById: actors.agent.userId,
      },
      select: { code: true },
    });
    const spy = spying();
    const reply = await askAssistant(
      actors.agent,
      { question: "Comment lutter contre la chenille légionnaire du maïs ?", farmCode: farm.code },
      spy.providers,
    );
    expect(reply.farmCode).toBe(farm.code);
    expect(JSON.stringify(spy.prompts)).not.toContain(farm.code);
  });

  it("traite une panne du modèle de plongement comme une indisponibilité", async () => {
    const broken: EmbeddingProvider = {
      ...embeddings,
      embed: async () => {
        throw new EmbeddingProviderError("délai dépassé", true);
      },
    };
    const reply = await askAssistant(
      actors.farmer,
      { question: "Quand semer le maïs ?" },
      { llm: providers.llm, embeddings: broken },
    );
    expect(reply.outcome).toBe("PROVIDER_ERROR");
    expect(reply.notice).toMatch(/ne répond pas/);
  });

  it("ne laisse passer que la limite horaire face à des requêtes simultanées", async () => {
    const reserve = () =>
      reserveQuestion({
        userId: actors.agent.userId,
        newConversation: { role: "AGENT_AGRICULTURE", communeId: null, farmId: null },
        content: "Question simultanée",
        perHour: 5,
        perDay: 100_000,
        now: new Date(),
      });
    const before = await prisma.assistantMessage.count({
      where: {
        role: "USER",
        conversation: { userId: actors.agent.userId },
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    });
    const results = await Promise.allSettled(Array.from({ length: 12 }, reserve));
    const accepted = results.filter((r) => r.status === "fulfilled").length;
    expect(accepted).toBe(Math.max(0, 5 - before));
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(12 - accepted);
  });

  it("applique le plafond global du jour", async () => {
    await expect(
      reserveQuestion({
        userId: actors.ministry.userId,
        newConversation: { role: "ADMIN_STATE", communeId: null, farmId: null },
        content: "Question",
        perHour: 100,
        perDay: 0,
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("efface le texte des questions après 90 jours et garde l'issue", async () => {
    const old = new Date(Date.now() - 91 * 86_400_000);
    const { conversationId, messageId } = await reserveQuestion({
      userId: actors.ministry.userId,
      newConversation: { role: "ADMIN_STATE", communeId: null, farmId: null },
      content: "Question ancienne",
      perHour: 100,
      perDay: 100_000,
      now: old,
    });
    await prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { createdAt: new Date() },
    });
    const purge = await purgeExpiredConversations();
    expect(purge.erasedQuestions).toBeGreaterThanOrEqual(1);
    const message = await prisma.assistantMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.content).toBe(ERASED_QUESTION);
  });
});
