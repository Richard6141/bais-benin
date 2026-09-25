import { z } from "zod";
import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/modules/audit";
import { scopeFilter, type Actor } from "@/modules/authorization";
import { AssistantError } from "./errors";

// Journal de l'assistant (assistant-parcours-ux §2.A3, A4, B3, D) : retours sur une réponse,
// demandes transmises à l'agent, historique personnel, journal anonymisé. Le journal ne montre
// jamais l'auteur d'une question : rôle, commune et date seulement.

export const feedbackSchema = z.object({
  messageId: z.uuid(),
  useful: z.boolean(),
  reason: z.enum(["UNCLEAR", "WRONG", "NOT_LOCAL", "OTHER"]).optional(),
  comment: z.string().trim().max(200).optional(),
});

async function ownAssistantMessage(actor: Actor, messageId: string) {
  const message = await prisma.assistantMessage.findFirst({
    where: { id: messageId, role: "ASSISTANT", conversation: { userId: actor.userId } },
    select: { id: true, conversation: { select: { communeId: true } } },
  });
  if (!message) throw new AssistantError("NOT_FOUND", "Réponse introuvable");
  return message;
}

export async function recordFeedback(actor: Actor, input: unknown): Promise<void> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) throw new AssistantError("INVALID", parsed.error.issues[0]!.message);
  const { messageId, useful, reason, comment } = parsed.data;
  await ownAssistantMessage(actor, messageId);
  await prisma.assistantFeedback.upsert({
    where: { messageId_userId: { messageId, userId: actor.userId } },
    create: { messageId, userId: actor.userId, useful, reason, comment },
    update: { useful, reason: reason ?? null, comment: comment ?? null },
  });
}

/** « Demander à mon agent » : transmet la question et la réponse aux agents de la commune. */
export async function requestAgent(
  actor: Actor,
  messageId: string,
): Promise<{ requestId: string; agentAvailable: boolean }> {
  const message = await ownAssistantMessage(actor, messageId);
  const communeId = message.conversation.communeId;
  if (!communeId)
    throw new AssistantError("NOT_FOUND", "Aucune commune rattachée à cette question");
  const commune = await prisma.commune.findUniqueOrThrow({
    where: { id: communeId },
    select: { departementId: true },
  });
  const request = await prisma.assistantAgentRequest.upsert({
    where: { messageId },
    create: { messageId, communeId },
    update: {},
  });
  const agents = await prisma.roleAssignment.count({
    where: {
      role: "AGENT_AGRICULTURE",
      revokedAt: null,
      OR: [
        { scopeType: "COMMUNE", scopeId: communeId },
        { scopeType: "DEPARTEMENT", scopeId: commune.departementId },
      ],
    },
  });
  return { requestId: request.id, agentAvailable: agents > 0 };
}

/** Communes du journal visibles par l'acteur : toutes (ministère) ou celles de son périmètre. */
async function journalCommunes(actor: Actor): Promise<"all" | string[]> {
  const filter = scopeFilter(actor, "assistant.journal.read");
  if (filter.kind === "all") return "all";
  if (filter.kind !== "territory") throw new AssistantError("FORBIDDEN", "Journal non autorisé");
  const communes = await prisma.commune.findMany({
    where: {
      archivedAt: null,
      OR: [{ id: { in: filter.communeIds } }, { departementId: { in: filter.departementIds } }],
    },
    select: { id: true },
  });
  return communes.map((c) => c.id);
}

export interface AgentRequestItem {
  id: string;
  status: "OPEN" | "HANDLED";
  communeName: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export async function listAgentRequests(actor: Actor): Promise<AgentRequestItem[]> {
  const communes = await journalCommunes(actor);
  const rows = await prisma.assistantAgentRequest.findMany({
    where: communes === "all" ? {} : { communeId: { in: communes } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      commune: { select: { name: true } },
      message: {
        select: {
          content: true,
          createdAt: true,
          conversation: {
            select: {
              messages: {
                where: { role: "USER" },
                orderBy: { createdAt: "desc" },
                select: { content: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    communeName: row.commune.name,
    // Question posée juste avant la réponse transmise.
    question:
      row.message.conversation.messages.find((m) => m.createdAt <= row.message.createdAt)
        ?.content ?? "",
    answer: row.message.content,
    createdAt: row.createdAt,
  }));
}

export async function markRequestHandled(actor: Actor, requestId: string): Promise<void> {
  const communes = await journalCommunes(actor);
  const where: Prisma.AssistantAgentRequestWhereInput = {
    id: requestId,
    ...(communes === "all" ? {} : { communeId: { in: communes } }),
  };
  const updated = await prisma.assistantAgentRequest.updateMany({
    where,
    data: { status: "HANDLED", handledById: actor.userId, handledAt: new Date() },
  });
  if (updated.count === 0) throw new AssistantError("NOT_FOUND", "Demande introuvable");
}

export async function listMyQuestions(actor: Actor, limit = 5) {
  return prisma.assistantMessage.findMany({
    where: { role: "USER", conversation: { userId: actor.userId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, content: true, createdAt: true, conversationId: true },
  });
}

export interface JournalEntry {
  messageId: string;
  createdAt: Date;
  role: string;
  communeName: string | null;
  question: string;
  answer: string;
  outcome: string | null;
  confidence: number | null;
  confidenceLabel: string | null;
  sources: string[];
  useful: number;
  notUseful: number;
}

export async function readJournal(
  actor: Actor,
  options: { outcome?: string; limit?: number } = {},
): Promise<JournalEntry[]> {
  const communes = await journalCommunes(actor);
  const rows = await prisma.assistantMessage.findMany({
    where: {
      role: "ASSISTANT",
      ...(options.outcome
        ? { outcome: options.outcome as Prisma.EnumAssistantOutcomeNullableFilter["equals"] }
        : {}),
      ...(communes === "all" ? {} : { conversation: { communeId: { in: communes } } }),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 50, 200),
    select: {
      id: true,
      createdAt: true,
      content: true,
      outcome: true,
      confidence: true,
      confidenceLabel: true,
      citations: true,
      feedback: { select: { useful: true } },
      conversation: {
        select: {
          role: true,
          commune: { select: { name: true } },
          messages: { where: { role: "USER" }, select: { content: true, createdAt: true } },
        },
      },
    },
  });
  await recordAudit({
    action: "assistant.journal.read",
    actorId: actor.userId,
    resourceType: "assistant_journal",
    details: { entries: rows.length, outcome: options.outcome ?? null },
  });
  return rows.map((row) => {
    const question = row.conversation.messages
      .filter((m) => m.createdAt <= row.createdAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const citations = Array.isArray(row.citations)
      ? (row.citations as Array<{ slug?: string | null }>)
      : [];
    return {
      messageId: row.id,
      createdAt: row.createdAt,
      role: row.conversation.role,
      communeName: row.conversation.commune?.name ?? null,
      question: question?.content ?? "",
      answer: row.content,
      outcome: row.outcome,
      confidence: row.confidence === null ? null : Number(row.confidence),
      confidenceLabel: row.confidenceLabel,
      sources: [...new Set(citations.map((c) => c.slug ?? "").filter(Boolean))],
      useful: row.feedback.filter((f) => f.useful).length,
      notUseful: row.feedback.filter((f) => !f.useful).length,
    };
  });
}

/** Texte des questions conservé 90 jours ; au-delà, seules l'issue et les sources restent. */
export const QUESTION_TEXT_RETENTION_DAYS = 90;
export const ERASED_QUESTION = "[texte effacé après 90 jours]";

export interface AssistantPurge {
  erasedQuestions: number;
  deletedConversations: number;
}

// Tâche planifiée quotidienne : efface le texte des questions de plus de 90 jours (il peut
// contenir des éléments personnels malgré le masquage), puis supprime les conversations arrivées
// à échéance (12 mois), avec leurs messages, retours et demandes.
export async function purgeExpiredConversations(now = new Date()): Promise<AssistantPurge> {
  const erased = await prisma.assistantMessage.updateMany({
    where: {
      role: "USER",
      createdAt: { lt: new Date(now.getTime() - QUESTION_TEXT_RETENTION_DAYS * 86_400_000) },
      content: { not: ERASED_QUESTION },
    },
    data: { content: ERASED_QUESTION },
  });
  const deleted = await prisma.assistantConversation.deleteMany({
    where: { purgeAfter: { lt: now } },
  });
  return { erasedQuestions: erased.count, deletedConversations: deleted.count };
}
