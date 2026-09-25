import { z } from "zod";
import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";
import type { Actor } from "@/modules/authorization";
import type { AssistantProviders } from "@/services/assistant";
import { LlmProviderError, type ModelAnswer } from "@/services/ports/llm-provider";
import { buildContext, type ContextFact } from "./context";
import { AssistantError } from "./errors";
import {
  CONFIDENCE_WORDS,
  checkCitations,
  confidenceLabel,
  confidenceScore,
  coverage,
  unsupportedDosages,
  type ConfidenceLabel,
} from "./guardrails";
import {
  MINISTRY_INDICATORS,
  isMinistryIndicator,
  readIndicator,
  type IndicatorBlock,
} from "./indicators";
import { ASSISTANT_INSTRUCTIONS, buildPrompt } from "./prompt";
import { getAssistantProviders } from "./providers";
import { retrievePassages, type RetrievedPassage } from "./retrieve";

// Réponse de l'assistant (assistant-parcours-ux §2.A à 2.C) : contexte limité au périmètre,
// recherche des extraits, appel du modèle, contrôles serveur, score de confiance, journal.
// Toute issue est enregistrée : réponse, confiance insuffisante, hors sujet, dose sans source,
// modèle indisponible.

export const QUESTION_MAX = 500;
export const QUESTIONS_PER_HOUR = 20;
const RETENTION_DAYS = 365;

export const askInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Question trop courte")
    .max(QUESTION_MAX, "500 caractères au plus"),
  farmCode: z.string().trim().max(40).optional(),
  conversationId: z.uuid().optional(),
});

export type AskOutcome =
  "ANSWERED" | "LOW_CONFIDENCE" | "OFF_TOPIC" | "UNSAFE_DOSAGE" | "PROVIDER_ERROR";

export interface ReplySource {
  slug: string;
  title: string;
  organization: string;
  sourceTitle: string;
  url: string;
  licence: string;
  demonstration: boolean;
  checkedOn: string;
  quotes: string[];
}

export interface AssistantReply {
  conversationId: string;
  messageId: string;
  outcome: AskOutcome;
  answer: string | null;
  advice: string | null;
  confidence: number | null;
  confidenceLabel: ConfidenceLabel | null;
  confidenceWords: string | null;
  /** Message affiché à la place de la réponse (refus, orientation vers l'agent). */
  notice: string | null;
  sources: ReplySource[];
  /** Faits du contexte affichés avec leur source (jamais produits par le modèle). */
  facts: ContextFact[];
  indicator: IndicatorBlock | null;
  /** Modèle ou fiches de démonstration : l'interface l'indique. */
  demonstration: boolean;
}

const NOTICES: Record<Exclude<AskOutcome, "ANSWERED">, string> = {
  LOW_CONFIDENCE:
    "Je ne dispose pas d'une information fiable sur ce point. Posez la question à votre agent agricole.",
  OFF_TOPIC:
    "Je réponds seulement aux questions sur l'agriculture, l'élevage, la météo agricole, la conservation et la vente des récoltes.",
  UNSAFE_DOSAGE:
    "Je ne peux pas vous donner de dose sans source fiable. Demandez à votre agent agricole le produit homologué et sa dose.",
  PROVIDER_ERROR: "L'assistant ne répond pas pour l'instant. Réessayez plus tard.",
};

function sourcesOf(cited: Map<string, string[]>, passages: RetrievedPassage[]): ReplySource[] {
  const bySlug = new Map<string, ReplySource>();
  for (const passage of passages) {
    const quotes = cited.get(passage.chunkId);
    if (!quotes) continue;
    const entry = bySlug.get(passage.slug) ?? {
      slug: passage.slug,
      title: passage.documentTitle,
      organization: passage.organization,
      sourceTitle: passage.sourceTitle,
      url: passage.sourceUrl,
      licence: passage.licence,
      demonstration: passage.demonstration,
      checkedOn: passage.checkedOn,
      quotes: [],
    };
    entry.quotes.push(...quotes);
    bySlug.set(passage.slug, entry);
  }
  return [...bySlug.values()];
}

export async function askAssistant(
  actor: Actor,
  input: unknown,
  providers: AssistantProviders = getAssistantProviders(),
  now = new Date(),
): Promise<AssistantReply> {
  const parsed = askInputSchema.safeParse(input);
  if (!parsed.success) throw new AssistantError("INVALID", parsed.error.issues[0]!.message);
  const { question, farmCode, conversationId } = parsed.data;
  const started = performance.now();

  const recent = await prisma.assistantMessage.count({
    where: {
      role: "USER",
      createdAt: { gte: new Date(now.getTime() - 3_600_000) },
      conversation: { userId: actor.userId },
    },
  });
  if (recent >= QUESTIONS_PER_HOUR) {
    throw new AssistantError(
      "RATE_LIMITED",
      "Vous avez posé beaucoup de questions : réessayez dans une heure",
    );
  }
  const context = await buildContext(actor, farmCode);

  let conversation = conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: actor.userId },
      })
    : null;
  if (conversationId && !conversation)
    throw new AssistantError("NOT_FOUND", "Conversation introuvable");
  conversation ??= await prisma.assistantConversation.create({
    data: {
      userId: actor.userId,
      role:
        context.audience === "MINISTRY"
          ? "ADMIN_STATE"
          : context.audience === "AGENT"
            ? "AGENT_AGRICULTURE"
            : "FARMER",
      communeId: context.communeId,
      farmId: context.farmId,
      purgeAfter: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
    },
  });
  await prisma.assistantMessage.create({
    data: { conversationId: conversation.id, role: "USER", content: question },
  });

  const passages = await retrievePassages(question, providers.embeddings, { crops: context.crops });
  const indicators = context.audience === "MINISTRY" ? [...MINISTRY_INDICATORS] : [];
  const facts = context.facts.map((f) => f.text);
  let model: ModelAnswer | null = null;
  let outcome: AskOutcome = "ANSWERED";
  try {
    model = await providers.llm.answer({
      instructions: ASSISTANT_INSTRUCTIONS,
      prompt: buildPrompt({ question, passages, facts, indicators }),
      question,
      passages,
      facts,
      indicators,
    });
  } catch (error) {
    if (!(error instanceof LlmProviderError)) throw error;
    outcome = "PROVIDER_ERROR";
  }

  let indicator: IndicatorBlock | null = null;
  if (
    model?.indicatorRequest &&
    isMinistryIndicator(model.indicatorRequest.indicator) &&
    indicators.length > 0
  ) {
    indicator = await readIndicator(
      actor,
      model.indicatorRequest.indicator,
      model.indicatorRequest.filters,
      now,
    );
  }

  const { valid } = model ? checkCitations(model.citations, passages) : { valid: [] };
  const citedIds = new Set(valid.map((c) => c.chunkId));
  const cited = passages.filter((p) => citedIds.has(p.chunkId));
  const texts = model ? [model.answer, model.advice].filter((t) => t.trim().length > 0) : [];
  let score: number | null = null;
  if (model && outcome === "ANSWERED") {
    if (model.offTopic) outcome = "OFF_TOPIC";
    else if (unsupportedDosages(texts, cited).length > 0) outcome = "UNSAFE_DOSAGE";
    else if (texts.length === 0 || valid.length === 0)
      outcome = indicator ? "ANSWERED" : "LOW_CONFIDENCE";
    else {
      score = confidenceScore({
        citedSimilarities: cited.map((p) => p.similarity),
        coverage: coverage(texts, cited, facts),
        selfConfidence: model.selfConfidence,
      });
      if (confidenceLabel(score, getServerEnv().ASSISTANT_CONFIDENCE_THRESHOLD) === "unreliable") {
        outcome = "LOW_CONFIDENCE";
      }
    }
  }
  const answered = outcome === "ANSWERED" && score !== null;
  const label = answered
    ? confidenceLabel(score!, getServerEnv().ASSISTANT_CONFIDENCE_THRESHOLD)
    : null;
  const quotes = new Map<string, string[]>();
  for (const c of valid) quotes.set(c.chunkId, [...(quotes.get(c.chunkId) ?? []), c.quote]);
  const sources = answered ? sourcesOf(quotes, passages) : [];

  const message = await prisma.assistantMessage.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: answered
        ? [model!.answer, model!.advice].join("\n").trim()
        : outcome === "ANSWERED"
          ? `Indicateur affiché : ${indicator?.title ?? ""}`
          : NOTICES[outcome],
      citations: answered
        ? (valid.map((c) => ({
            ...c,
            slug: passages.find((p) => p.chunkId === c.chunkId)?.slug ?? null,
          })) as Prisma.InputJsonValue)
        : undefined,
      confidence: score,
      confidenceLabel: label,
      outcome,
      modelRef: providers.llm.modelRef,
      latencyMs: Math.round(performance.now() - started),
    },
  });

  return {
    conversationId: conversation.id,
    messageId: message.id,
    outcome,
    answer: answered ? model!.answer : null,
    advice: answered && model!.advice ? model!.advice : null,
    confidence: score,
    confidenceLabel: label,
    confidenceWords: label ? CONFIDENCE_WORDS[label] : null,
    notice: outcome === "ANSWERED" ? null : NOTICES[outcome],
    sources,
    facts: context.facts,
    indicator,
    demonstration: providers.llm.demonstration || sources.some((s) => s.demonstration),
  };
}
