import { prisma } from "@/database/client";
import type { Role } from "@/generated/prisma/client";
import { AssistantError } from "./errors";

// Réservation d'une question (revue de sécurité, étape 8) : les limites sont vérifiées et la
// question écrite dans la même transaction, sous verrous consultatifs (un par utilisateur, un
// global). Des requêtes simultanées ne peuvent donc pas toutes passer le décompte : la N+1e voit
// les N précédentes. Deux limites : par utilisateur et par heure, et plafond global par jour
// (heure de Porto-Novo), qui borne le coût d'un modèle payant.

const GLOBAL_LOCK = 740_201;
/** Porto-Novo : UTC+1 toute l'année. */
const BENIN_OFFSET_MS = 3_600_000;
export const RETENTION_DAYS = 365;

export function startOfBeninDay(now: Date): Date {
  const local = new Date(now.getTime() + BENIN_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - BENIN_OFFSET_MS);
}

export interface QuestionReservation {
  conversationId: string;
  messageId: string;
}

export async function reserveQuestion(input: {
  userId: string;
  conversationId?: string;
  newConversation: { role: Role; communeId: string | null; farmId: string | null };
  content: string;
  perHour: number;
  perDay: number;
  now: Date;
}): Promise<QuestionReservation> {
  const { userId, now } = input;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`assistant:${userId}`}))`;
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(${GLOBAL_LOCK}::bigint)`;
    const [lastHour, today] = await Promise.all([
      tx.assistantMessage.count({
        where: {
          role: "USER",
          createdAt: { gte: new Date(now.getTime() - 3_600_000) },
          conversation: { userId },
        },
      }),
      tx.assistantMessage.count({
        where: { role: "USER", createdAt: { gte: startOfBeninDay(now) } },
      }),
    ]);
    if (lastHour >= input.perHour) {
      throw new AssistantError(
        "RATE_LIMITED",
        "Vous avez posé beaucoup de questions : réessayez dans une heure",
      );
    }
    if (today >= input.perDay) {
      throw new AssistantError(
        "RATE_LIMITED",
        "L'assistant a atteint sa limite de questions pour aujourd'hui : réessayez demain",
      );
    }
    let conversationId = input.conversationId;
    if (conversationId) {
      const own = await tx.assistantConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!own) throw new AssistantError("NOT_FOUND", "Conversation introuvable");
    } else {
      const created = await tx.assistantConversation.create({
        data: {
          userId,
          ...input.newConversation,
          purgeAfter: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
        },
        select: { id: true },
      });
      conversationId = created.id;
    }
    const message = await tx.assistantMessage.create({
      data: { conversationId, role: "USER", content: input.content, createdAt: now },
      select: { id: true },
    });
    return { conversationId, messageId: message.id };
  });
}
