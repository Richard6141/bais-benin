// Logique de présentation de l'assistant agricole, pure et testée : suggestions contextuelles,
// état du champ de question, texte court à copier pour le producteur, messages d'erreur de
// l'API. Aucune dépendance au serveur : les pages passent les données, ce module les lit.

export const QUESTION_MAX = 500;
export const FEEDBACK_COMMENT_MAX = 200;
export const SMS_MAX = 160;
export const MAX_SUGGESTIONS = 3;

export type Audience = "farmer" | "agent" | "ministry";

export type ConfidenceLabel = "sure" | "to_confirm" | "unreliable";

// --- Champ de question.

export interface QuestionState {
  length: number;
  remaining: number;
  canSend: boolean;
  tooLong: boolean;
}

export function questionState(question: string): QuestionState {
  const length = question.trim().length;
  return {
    length,
    remaining: QUESTION_MAX - question.length,
    canSend: length > 0 && question.length <= QUESTION_MAX,
    tooLong: question.length > QUESTION_MAX,
  };
}

// --- Suggestions contextuelles (A1, B2, C1).

export interface WeatherDayLike {
  rainMm: number | null;
  forecast: boolean;
}

/** Jours secs consécutifs observés jusqu'à hier (moins de 1 mm), prévisions exclues. */
export function dryDaysOf(days: readonly WeatherDayLike[]): number {
  const observed = days.filter((day) => !day.forecast);
  let count = 0;
  for (let i = observed.length - 1; i >= 0; i -= 1) {
    const rain = observed[i]?.rainMm;
    if (rain === null || rain === undefined || rain >= 1) break;
    count += 1;
  }
  return count;
}

export interface FarmerSuggestionInput {
  /** Noms des cultures de la campagne ouverte (« Maïs », « Niébé »). */
  crops: readonly string[];
  /** Alerte active la plus grave de sa commune. */
  alert: { title: string; communeName: string } | null;
  dryDays: number;
  rain10dMm: number | null;
}

/** Seuils des suggestions météo : une semaine sans pluie, ou plus de 100 mm en dix jours. */
export const DRY_SPELL_DAYS = 7;
export const HEAVY_RAIN_10D_MM = 100;

// Formulations neutres en genre (« Maïs : … ») : le nom de la culture n'a pas besoin d'article.
export function farmerSuggestions(input: FarmerSuggestionInput): string[] {
  const suggestions: string[] = [];
  const firstCrop = input.crops[0];
  if (firstCrop) suggestions.push(`${firstCrop} : quand semer et comment entretenir ?`);
  if (input.alert) {
    suggestions.push(`${input.alert.title} à ${input.alert.communeName} : que faire ?`);
  }
  if (input.dryDays >= DRY_SPELL_DAYS) {
    suggestions.push(`Pas de pluie depuis ${input.dryDays} jours : faut-il arroser mes cultures ?`);
  } else if (input.rain10dMm !== null && input.rain10dMm >= HEAVY_RAIN_10D_MM) {
    suggestions.push("Beaucoup de pluie ces derniers jours : comment protéger mes champs ?");
  }
  const secondCrop = input.crops[1];
  if (secondCrop) suggestions.push(`${secondCrop} : comment lutter contre les ravageurs ?`);
  suggestions.push("Comment bien sécher et conserver ma récolte ?");
  return unique(suggestions).slice(0, MAX_SUGGESTIONS);
}

export function agentSuggestions(input: {
  openRequests: readonly string[];
  alert: { title: string; communeName: string } | null;
  crops: readonly string[];
}): string[] {
  const suggestions = unique(input.openRequests).slice(0, 2);
  if (input.alert) {
    suggestions.push(`${input.alert.title} à ${input.alert.communeName} : que conseiller ?`);
  }
  const crop = input.crops[0];
  if (crop) suggestions.push(`${crop} : quand semer et comment entretenir ?`);
  suggestions.push("Comment limiter les pertes après récolte ?");
  return unique(suggestions).slice(0, MAX_SUGGESTIONS);
}

export const MINISTRY_SUGGESTIONS = [
  "Combien d'exploitations sont enregistrées dans le registre ?",
  "Quelles alertes agro-climatiques sont en cours ?",
  "Quelle est la production déclarée de maïs ?",
] as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

// --- « Copier pour le producteur » (B2) : texte court, 160 caractères si possible.

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "")}…`;
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return (match?.[0] ?? text).trim();
}

/**
 * Réponse et conseil en un texte court : les deux s'ils tiennent, sinon le conseil seul (la
 * consigne pratique prime), sinon la première phrase de la réponse, tronquée au mot.
 */
export function shortForProducer(answer: string | null, advice: string | null): string {
  const parts = [answer?.trim(), advice?.trim()].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "";
  const both = parts.join(" ");
  if (both.length <= SMS_MAX) return both;
  if (advice && advice.trim().length <= SMS_MAX) return advice.trim();
  return truncateAtWord(firstSentence(answer ?? advice ?? ""), SMS_MAX);
}

interface ReplyLike {
  outcome: string;
  answer: string | null;
  advice: string | null;
  notice: string | null;
  indicator?: { available: boolean } | null;
}

/**
 * Message du serveur à afficher à la place d'une réponse. Quand un indicateur du ministère est
 * disponible, c'est lui la réponse : l'orientation « posez la question à votre agent » d'une
 * réponse rédigée sous le seuil n'a pas de sens au-dessus de chiffres sourcés.
 */
export function visibleNotice(reply: ReplyLike): string | null {
  if (reply.outcome === "ANSWERED") return null;
  if (reply.outcome === "LOW_CONFIDENCE" && reply.indicator?.available) return null;
  return reply.notice;
}

/** Texte lu par « Écouter » : la réponse et le conseil, jamais les sources. */
export function speechText(reply: ReplyLike) {
  if (reply.answer && reply.outcome === "ANSWERED") {
    return reply.advice ? `${reply.answer} Conseil : ${reply.advice}` : reply.answer;
  }
  return visibleNotice(reply) ?? "";
}

export const QUESTION_PLACEHOLDERS: Record<Audience, string> = {
  farmer: "Par exemple : quand semer le maïs ?",
  agent: "Posez une question agricole",
  ministry: "Par exemple : combien d'exploitations sont enregistrées ?",
};

// --- Erreurs de l'API.

export function errorMessage(status: number, code?: string): string {
  if (status === 401) return "Votre session a expiré : reconnectez-vous puis réessayez.";
  if (status === 429 || code === "RATE_LIMITED") {
    return "Vous avez posé beaucoup de questions : réessayez dans une heure.";
  }
  if (status === 400 || code === "INVALID") {
    return `Votre question doit faire entre 1 et ${QUESTION_MAX} caractères.`;
  }
  if (status === 404 || code === "NOT_FOUND") {
    return "Cette exploitation n'est pas dans votre périmètre.";
  }
  if (status === 403) return "Cette action ne vous est pas autorisée.";
  return "L'assistant ne répond pas pour l'instant, réessayez plus tard.";
}

// --- Retours (A3).

export const FEEDBACK_REASONS = [
  { value: "UNCLEAR", label: "Pas clair" },
  { value: "WRONG", label: "Faux" },
  { value: "NOT_LOCAL", label: "Pas adapté à ma région" },
  { value: "OTHER", label: "Autre" },
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]["value"];

// --- Journal.

export const OUTCOME_LABELS: Record<string, string> = {
  ANSWERED: "Répondue",
  LOW_CONFIDENCE: "Sans réponse fiable",
  OFF_TOPIC: "Hors sujet",
  UNSAFE_DOSAGE: "Dose sans source",
  PROVIDER_ERROR: "Service indisponible",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLabel, string> = {
  sure: "Réponse sûre",
  to_confirm: "À confirmer avec votre agent",
  unreliable: "Information non fiable",
};

export function outcomeFilter(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first in OUTCOME_LABELS ? first : undefined;
}
