import { z } from "zod";
import { prisma } from "@/database/client";
import type { Prisma } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env";
import type { Actor } from "@/modules/authorization";
import type { AssistantProviders } from "@/services/assistant";
import { EmbeddingProviderError } from "@/services/ports/embedding-provider";
import { LlmProviderError, type ModelAnswer } from "@/services/ports/llm-provider";
import { buildContext, type ContextFact } from "./context";
import { AssistantError } from "./errors";
import { CONFIDENCE_WORDS, analyzeAnswer, type ConfidenceLabel } from "./guardrails";
import {
  MINISTRY_INDICATORS,
  isMinistryIndicator,
  readIndicator,
  type IndicatorBlock,
} from "./indicators";
import { redactPersonalData } from "./privacy";
import { ASSISTANT_INSTRUCTIONS, buildPrompt } from "./prompt";
import { getAssistantProviders } from "./providers";
import { reserveQuestion } from "./quota";
import { retrievePassages, type RetrievedPassage } from "./retrieve";

// Réponse de l'assistant (assistant-parcours-ux §2.A à 2.C) : contexte limité au périmètre,
// réservation atomique de la question (limites), masquage des numéros et adresses saisis,
// recherche des extraits, appel du modèle, contrôles serveur (guardrails.ts), journal.
// Toute issue est enregistrée : réponse, confiance insuffisante, hors sujet, dose sans source,
// fournisseur indisponible.

export const QUESTION_MAX = 500;
export const QUESTIONS_PER_HOUR = 20;

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
  /** Exploitation choisie par l'agent : affichée, jamais transmise au modèle. */
  farmCode: string | null;
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

function sourcesOf(
  citations: ReadonlyArray<{ chunkId: string; quote: string }>,
  passages: readonly RetrievedPassage[],
): ReplySource[] {
  const bySlug = new Map<string, ReplySource>();
  for (const citation of citations) {
    const passage = passages.find((p) => p.chunkId === citation.chunkId);
    if (!passage) continue;
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
    entry.quotes.push(citation.quote);
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
  const { farmCode, conversationId } = parsed.data;
  // Numéros et adresses saisis ne partent ni au fournisseur ni au journal.
  const question = redactPersonalData(parsed.data.question);
  const started = performance.now();
  const env = getServerEnv();

  const context = await buildContext(actor, farmCode);
  const reservation = await reserveQuestion({
    userId: actor.userId,
    conversationId,
    newConversation: {
      role:
        context.audience === "MINISTRY"
          ? "ADMIN_STATE"
          : context.audience === "AGENT"
            ? "AGENT_AGRICULTURE"
            : "FARMER",
      communeId: context.communeId,
      farmId: context.farmId,
    },
    content: question,
    perHour: QUESTIONS_PER_HOUR,
    perDay: env.ASSISTANT_DAILY_LIMIT,
    now,
  });

  const indicators = context.audience === "MINISTRY" ? [...MINISTRY_INDICATORS] : [];
  const facts = context.facts.map((f) => f.text);
  let passages: RetrievedPassage[] = [];
  let model: ModelAnswer | null = null;
  let outcome: AskOutcome = "ANSWERED";
  try {
    passages = await retrievePassages(question, providers.embeddings, { crops: context.crops });
    model = await providers.llm.answer({
      instructions: ASSISTANT_INSTRUCTIONS,
      prompt: buildPrompt({ question, passages, facts, indicators }),
      question,
      passages,
      facts,
      indicators,
    });
  } catch (error) {
    if (!(error instanceof LlmProviderError) && !(error instanceof EmbeddingProviderError)) {
      throw error;
    }
    outcome = "PROVIDER_ERROR";
  }

  let indicator: IndicatorBlock | null = null;
  const request = model?.indicatorRequest;
  if (request && isMinistryIndicator(request.indicator) && indicators.length > 0) {
    indicator = await readIndicator(actor, request.indicator, request.filters, now);
  }

  const analysis =
    model && outcome === "ANSWERED" && !model.offTopic
      ? analyzeAnswer({ model, passages, facts, threshold: env.ASSISTANT_CONFIDENCE_THRESHOLD })
      : null;
  if (model?.offTopic && outcome === "ANSWERED") outcome = "OFF_TOPIC";
  if (analysis) {
    // Indicateur du ministère sans texte : l'indicateur suffit comme réponse.
    const indicatorOnly =
      indicator !== null && analysis.outcome === "LOW_CONFIDENCE" && !model?.answer.trim();
    outcome = indicatorOnly ? "ANSWERED" : analysis.outcome;
  }
  const answered = outcome === "ANSWERED" && analysis?.outcome === "ANSWERED";
  const sources = answered ? sourcesOf(analysis.citations, passages) : [];

  const message = await prisma.assistantMessage.create({
    data: {
      conversationId: reservation.conversationId,
      role: "ASSISTANT",
      content: answered
        ? [analysis.answer, analysis.advice].filter(Boolean).join("\n")
        : outcome === "ANSWERED"
          ? `Indicateur affiché : ${indicator?.title ?? ""}`
          : NOTICES[outcome],
      citations: answered
        ? (analysis.citations.map((c) => ({
            ...c,
            slug: passages.find((p) => p.chunkId === c.chunkId)?.slug ?? null,
          })) as Prisma.InputJsonValue)
        : undefined,
      confidence: answered ? analysis.score : null,
      confidenceLabel: answered ? analysis.label : null,
      outcome,
      modelRef: providers.llm.modelRef,
      latencyMs: Math.round(performance.now() - started),
    },
  });

  return {
    conversationId: reservation.conversationId,
    messageId: message.id,
    outcome,
    answer: answered ? analysis.answer : null,
    advice: answered ? analysis.advice : null,
    confidence: answered ? analysis.score : null,
    confidenceLabel: answered ? analysis.label : null,
    confidenceWords: answered && analysis.label ? CONFIDENCE_WORDS[analysis.label] : null,
    notice: outcome === "ANSWERED" ? null : NOTICES[outcome],
    sources,
    facts: context.facts,
    farmCode: context.farmCode,
    indicator,
    demonstration: providers.llm.demonstration || sources.some((s) => s.demonstration),
  };
}
