import { contentWords, foldText, sentences } from "@/lib/text/normalize";
import type { AssistantPassage, ModelAnswer } from "@/services/ports/llm-provider";

// Contrôles côté serveur de la réponse du modèle, indépendants du modèle lui-même : ce qu'une
// consigne glissée dans une question ou dans un extrait ne peut pas contourner.
// 1. Citations : chaque citation désigne un extrait effectivement retrouvé, et son texte figure
//    dans cet extrait (à la casse, aux accents et aux espaces près).
// 2. Couverture : part des phrases de la réponse et du conseil portées par les extraits cités.
// 3. Doses : toute dose, concentration ou délai avant récolte doit figurer dans un extrait cité.
// 4. Confiance : 0,5 × similarité des extraits cités + 0,3 × couverture + 0,2 × auto-évaluation.

export const CONFIDENCE_WEIGHTS = { similarity: 0.5, coverage: 0.3, self: 0.2 } as const;
export const SURE_THRESHOLD = 0.8;
const MIN_QUOTE_LENGTH = 12;
/** Part des mots d'une phrase qui doivent se retrouver dans un extrait cité pour la couvrir. */
const SENTENCE_OVERLAP = 0.6;

export interface CheckedCitation {
  chunkId: string;
  quote: string;
}

function flat(text: string): string {
  return foldText(text)
    .replace(/^[-*•]\s*/gm, "")
    .replace(/\s+/g, " ");
}

export function checkCitations(
  citations: ModelAnswer["citations"],
  passages: readonly AssistantPassage[],
): { valid: CheckedCitation[]; rejected: number } {
  const byId = new Map(passages.map((p) => [p.chunkId, flat(p.content)]));
  const valid: CheckedCitation[] = [];
  let rejected = 0;
  for (const citation of citations) {
    const content = byId.get(citation.chunkId);
    const quote = flat(citation.quote);
    if (content && quote.length >= MIN_QUOTE_LENGTH && content.includes(quote)) {
      valid.push({ chunkId: citation.chunkId, quote: citation.quote.trim() });
    } else {
      rejected += 1;
    }
  }
  return { valid, rejected };
}

/** Part des phrases (réponse et conseil) dont les mots se retrouvent dans un extrait cité. */
export function coverage(
  texts: readonly string[],
  cited: readonly AssistantPassage[],
  facts: readonly string[] = [],
): number {
  const sources = [
    ...cited.map((p) => new Set(contentWords(p.content))),
    ...facts.map((f) => new Set(contentWords(f))),
  ];
  const all = texts.flatMap((t) => sentences(t));
  if (all.length === 0) return 0;
  const covered = all.filter((sentence) => {
    const words = contentWords(sentence);
    if (words.length === 0) return true;
    return sources.some(
      (source) => words.filter((w) => source.has(w)).length / words.length >= SENTENCE_OVERLAP,
    );
  });
  return covered.length / all.length;
}

// Doses et délais : quantité par surface ou par volume, concentration, délai avant récolte.
const DOSAGE_PATTERNS = [
  /\d+(?:[.,]\d+)?\s*(?:kg|g|t|l|litres?|ml|cl|cc|sacs?)\s*(?:\/|par|l'|de\s+produit\s+par)\s*(?:ha|hectares?|l|litres?|pieds?|plants?|poquets?|m2|m²|pulverisateurs?|pulvérisateurs?)\b/giu,
  /\d+(?:[.,]\d+)?\s*(?:g|ml|cl|cc)\s*(?:\/|par|dans)\s*\d*\s*(?:l|litres?)\b/giu,
  /\d+\s*jours?\s+avant\s+(?:la\s+)?r[ée]colte/giu,
  /\d+(?:[.,]\d+)?\s*%\s*(?:de\s+)?(?:matiere|matière)\s+active/giu,
];

function dosages(text: string): string[] {
  return DOSAGE_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[0]));
}

/** Doses de la réponse absentes des extraits cités (liste vide = rien à reprocher). */
export function unsupportedDosages(
  texts: readonly string[],
  cited: readonly AssistantPassage[],
): string[] {
  const sources = cited.map((p) => flat(p.content).replace(/,/g, "."));
  return texts
    .flatMap(dosages)
    .filter((dose) => !sources.some((s) => s.includes(flat(dose).replace(/,/g, "."))));
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
  const score =
    CONFIDENCE_WEIGHTS.similarity * similarity +
    CONFIDENCE_WEIGHTS.coverage * input.coverage +
    CONFIDENCE_WEIGHTS.self * input.selfConfidence;
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
