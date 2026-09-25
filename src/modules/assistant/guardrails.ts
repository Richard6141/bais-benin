import { contentWords, foldText, isNegated, sentences } from "@/lib/text/normalize";
import type { AssistantPassage, ModelAnswer } from "@/services/ports/llm-provider";
import { checkQuantities, type Quantity } from "./quantities";

// Contrôles côté serveur de la réponse du modèle, indépendants du modèle : ce qu'une consigne
// glissée dans une question ou un extrait ne peut pas contourner (revue de sécurité, étape 8).
// 1. Citations : une citation désigne un extrait retrouvé et recopie une ou plusieurs phrases
//    entières et consécutives de cet extrait (pas un morceau de phrase qui en inverserait le sens).
// 2. Soutien : chaque phrase affichée est portée par une phrase (ou deux consécutives) d'un extrait
//    cité, avec au moins 60 % de ses mots et la même polarité (négative ou non) ; une phrase non
//    soutenue n'est pas affichée.
// 3. Couverture : part des phrases soutenues ; en dessous de 0,8, pas de réponse.
// 4. Quantités : toute dose, et tout nombre d'une réponse qui parle de dose, doit figurer dans un
//    extrait cité avec la même valeur et la même unité ; sinon refus.
// 5. Confiance : 0,5 × pertinence des extraits cités + 0,3 × couverture + 0,2 × auto-évaluation,
//    celle-ci plafonnée à la pertinence (le modèle ne peut pas se donner plus de crédit que ses
//    sources).

export const CONFIDENCE_WEIGHTS = { similarity: 0.5, coverage: 0.3, self: 0.2 } as const;
export const SURE_THRESHOLD = 0.8;
export const MIN_COVERAGE = 0.8;
const MIN_QUOTE_LENGTH = 12;
const SENTENCE_OVERLAP = 0.6;
const MAX_QUOTED_SENTENCES = 4;

export interface CheckedCitation {
  chunkId: string;
  quote: string;
}

/** Forme comparable d'une phrase : sans casse, accents, puce ni ponctuation finale. */
function comparable(text: string): string {
  return foldText(text)
    .replace(/^[-*•]\s*/, "")
    .replace(/[\s.!?;:…]+$/, "")
    .replace(/\s+/g, " ");
}

/** Toutes les suites d'une à quatre phrases consécutives d'un extrait, sous forme comparable. */
function quotableSpans(content: string): Set<string> {
  const list = sentences(content).map(comparable);
  const spans = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    for (let n = 1; n <= MAX_QUOTED_SENTENCES && i + n <= list.length; n += 1) {
      spans.add(list.slice(i, i + n).join(" "));
    }
  }
  return spans;
}

export function checkCitations(
  citations: ModelAnswer["citations"],
  passages: readonly AssistantPassage[],
): { valid: CheckedCitation[]; rejected: number } {
  const spans = new Map(passages.map((p) => [p.chunkId, quotableSpans(p.content)]));
  const valid: CheckedCitation[] = [];
  let rejected = 0;
  for (const citation of citations) {
    const quote = sentences(citation.quote).map(comparable).join(" ");
    const ok = quote.length >= MIN_QUOTE_LENGTH && spans.get(citation.chunkId)?.has(quote);
    if (ok) valid.push({ chunkId: citation.chunkId, quote: citation.quote.trim() });
    else rejected += 1;
  }
  return { valid, rejected };
}

interface SupportWindow {
  words: Set<string>;
  negated: boolean;
}

/** Fenêtres d'une ou deux phrases consécutives des sources, avec leur polarité. */
function supportWindows(sources: readonly string[]): SupportWindow[] {
  const windows: SupportWindow[] = [];
  for (const source of sources) {
    const list = sentences(source);
    for (let i = 0; i < list.length; i += 1) {
      for (const text of [list[i]!, i + 1 < list.length ? `${list[i]} ${list[i + 1]}` : null]) {
        if (text) windows.push({ words: new Set(contentWords(text)), negated: isNegated(text) });
      }
    }
  }
  return windows;
}

export function isSupported(sentence: string, windows: readonly SupportWindow[]): boolean {
  const words = contentWords(sentence);
  if (words.length === 0) return true;
  const negated = isNegated(sentence);
  return windows.some(
    (w) =>
      w.negated === negated &&
      words.filter((word) => w.words.has(word)).length / words.length >= SENTENCE_OVERLAP,
  );
}

export type ConfidenceLabel = "sure" | "to_confirm" | "unreliable";

export function confidenceScore(input: {
  citedSimilarities: readonly number[];
  coverage: number;
  selfConfidence: number;
}): number {
  const { citedSimilarities } = input;
  const similarity =
    citedSimilarities.length > 0
      ? citedSimilarities.reduce((sum, s) => sum + s, 0) / citedSimilarities.length
      : 0;
  const self = Math.min(input.selfConfidence, similarity);
  const score =
    CONFIDENCE_WEIGHTS.similarity * similarity +
    CONFIDENCE_WEIGHTS.coverage * input.coverage +
    CONFIDENCE_WEIGHTS.self * self;
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

export function confidenceLabel(score: number, threshold: number): ConfidenceLabel {
  if (score >= SURE_THRESHOLD) return "sure";
  if (score >= threshold) return "to_confirm";
  return "unreliable";
}

export const CONFIDENCE_WORDS: Record<ConfidenceLabel, string> = {
  sure: "Réponse sûre",
  to_confirm: "À confirmer avec votre agent",
  unreliable: "Information non fiable",
};

export interface AnswerAnalysis {
  outcome: "ANSWERED" | "LOW_CONFIDENCE" | "UNSAFE_DOSAGE";
  /** Phrases soutenues seulement ; null si la réponse n'est pas affichée. */
  answer: string | null;
  advice: string | null;
  citations: CheckedCitation[];
  citedChunkIds: string[];
  coverage: number;
  score: number | null;
  label: ConfidenceLabel | null;
  unsafeQuantities: Quantity[];
}

export function analyzeAnswer(input: {
  model: Pick<ModelAnswer, "answer" | "advice" | "citations" | "selfConfidence">;
  passages: readonly AssistantPassage[];
  facts: readonly string[];
  threshold: number;
}): AnswerAnalysis {
  const { model, passages, facts, threshold } = input;
  const { valid } = checkCitations(model.citations, passages);
  const citedIds = new Set(valid.map((c) => c.chunkId));
  const cited = passages.filter((p) => citedIds.has(p.chunkId));
  const refused = (
    outcome: AnswerAnalysis["outcome"],
    coverageValue = 0,
    unsafe: Quantity[] = [],
  ) => ({
    outcome,
    answer: null,
    advice: null,
    citations: [],
    citedChunkIds: [],
    coverage: coverageValue,
    score: null,
    label: null,
    unsafeQuantities: unsafe,
  });

  const answerSentences = sentences(model.answer);
  const adviceSentences = sentences(model.advice);
  const all = [...answerSentences, ...adviceSentences];
  if (all.length === 0 || valid.length === 0) return refused("LOW_CONFIDENCE");

  const sources = cited.map((p) => p.content);
  const { unsafe, unsupported } = checkQuantities(
    [model.answer, model.advice],
    [...sources, ...facts],
  );
  if (unsafe.length > 0) return refused("UNSAFE_DOSAGE", 0, unsafe);

  const windows = supportWindows([...sources, ...facts]);
  const inventedNumbers = new Set(unsupported.map((q) => q.value));
  const supported = (sentence: string) =>
    isSupported(sentence, windows) &&
    !sentence
      .match(/\d+(?:[.,]\d+)?/g)
      ?.some((n) => inventedNumbers.has(Number(n.replace(",", "."))));
  const kept = all.filter(supported);
  const coverageValue = kept.length / all.length;
  if (coverageValue < MIN_COVERAGE) return refused("LOW_CONFIDENCE", coverageValue);

  const score = confidenceScore({
    citedSimilarities: cited.map((p) => p.similarity),
    coverage: coverageValue,
    selfConfidence: model.selfConfidence,
  });
  const label = confidenceLabel(score, threshold);
  if (label === "unreliable") return refused("LOW_CONFIDENCE", coverageValue);
  const answer = answerSentences.filter(supported).join(" ");
  const advice = adviceSentences.filter(supported).join(" ");
  return {
    outcome: "ANSWERED",
    answer: answer || null,
    advice: advice || null,
    citations: valid,
    citedChunkIds: [...citedIds],
    coverage: coverageValue,
    score,
    label,
    unsafeQuantities: [],
  };
}
