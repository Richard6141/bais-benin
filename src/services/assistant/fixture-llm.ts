import { foldText, sentences } from "@/lib/text/normalize";
import type {
  AnswerRequest,
  AssistantPassage,
  LlmProvider,
  ModelAnswer,
} from "@/services/ports/llm-provider";

// Modèle de démonstration, extractif et déterministe : il ne rédige rien, il recopie. La réponse
// est la ou les premières phrases de l'extrait le plus proche, le conseil la première consigne
// (ligne de liste) de cet extrait, la citation le texte recopié. Il ignore les consignes de la
// question comme le ferait un modèle bien réglé : elles ne changent pas l'extrait retenu.
// Sert aux tests et au fonctionnement sans modèle configuré (l'interface dit « démonstration »).

const AGRICULTURE_TERMS = [
  "agri",
  "cultur",
  "semi",
  "semer",
  "recolt",
  "champ",
  "parcell",
  "sol",
  "engrais",
  "fumur",
  "compost",
  "pluie",
  "secheress",
  "irrig",
  "arros",
  "ravageur",
  "chenill",
  "insect",
  "maladi",
  "mais",
  "manioc",
  "igname",
  "riz",
  "niebe",
  "soja",
  "anacard",
  "cajou",
  "coton",
  "tomat",
  "piment",
  "oignon",
  "gombo",
  "maraich",
  "arachid",
  "sorgho",
  "mil",
  "stock",
  "conserv",
  "grenier",
  "sac",
  "bouture",
  "semence",
  "variet",
  "desherb",
  "sarcl",
  "rendement",
  "elevag",
  "betail",
  "volaill",
  "meteo",
  "inond",
  "chaleur",
  "vente",
  "march",
  "prix",
  "plant",
];

const INDICATOR_KEYWORDS: Array<[string, string[]]> = [
  ["crop_production", ["production", "rendement", "tonne", "recolt"]],
  ["territory_ranking", ["classement", "departement", "compar"]],
  ["data_quality", ["qualit", "ecart", "doublon", "fiabilit"]],
  ["active_alerts", ["alert"]],
  ["overview", ["exploitation", "producteur", "superficie", "combien"]],
];

const CROP_NAMES: Record<string, string> = {
  mais: "MAIZE",
  manioc: "CASSAVA",
  igname: "YAM",
  riz: "RICE",
  niebe: "COWPEA",
  soja: "SOYBEAN",
  anacarde: "CASHEW",
  coton: "COTTON",
  arachide: "GROUNDNUT",
  sorgho: "SORGHUM",
  tomate: "TOMATO",
};

export function looksAgricultural(question: string): boolean {
  const folded = foldText(question);
  return AGRICULTURE_TERMS.some((term) => folded.includes(term));
}

function indicatorFor(
  question: string,
  indicators: readonly string[],
): ModelAnswer["indicatorRequest"] {
  if (indicators.length === 0) return null;
  const folded = foldText(question);
  const match = INDICATOR_KEYWORDS.find(
    ([indicator, words]) => indicators.includes(indicator) && words.some((w) => folded.includes(w)),
  );
  if (!match) return null;
  const filters: Record<string, string> = {};
  // Mots bruts (et non racinisés) : « maïs » est aussi le mot vide « mais ».
  for (const word of folded.split(/[^a-z]+/)) {
    const crop = CROP_NAMES[word] ?? CROP_NAMES[word.replace(/s$/, "")];
    if (crop) filters.cropCode = crop;
  }
  return { indicator: match[0], filters };
}

/** Passage contigu de l'extrait : ses premières phrases, jusqu'à 320 caractères. */
function leadingText(passage: AssistantPassage): string {
  const body = sentences(passage.content).filter((s) => !s.startsWith("#"));
  let text = "";
  for (const sentence of body) {
    if (text && text.length + sentence.length > 320) break;
    if (!passage.content.includes(`${text}${text ? " " : ""}${sentence}`)) break;
    text = text ? `${text} ${sentence}` : sentence;
  }
  return text || body[0] || "";
}

function adviceFrom(passage: AssistantPassage): string {
  const bullet = passage.content.split("\n").find((line) => /^\s*[-*•]\s+\S/.test(line));
  return bullet ? bullet.replace(/^\s*[-*•]\s+/, "").trim() : "";
}

export function createFixtureLlmProvider(): LlmProvider {
  return {
    modelRef: "fixture",
    demonstration: true,
    answer: async (request: AnswerRequest): Promise<ModelAnswer> => {
      const indicatorRequest = indicatorFor(request.question, request.indicators);
      const best = [...request.passages].sort((a, b) => b.similarity - a.similarity)[0];
      const offTopic = !looksAgricultural(request.question) && !indicatorRequest;
      if (offTopic || !best) {
        return {
          offTopic,
          answer: "",
          advice: "",
          citations: [],
          selfConfidence: 0,
          indicatorRequest,
        };
      }
      const answer = leadingText(best);
      const advice = adviceFrom(best);
      const citations = [{ chunkId: best.chunkId, quote: answer }];
      if (advice && advice !== answer) citations.push({ chunkId: best.chunkId, quote: advice });
      return {
        offTopic: false,
        answer,
        advice,
        citations,
        selfConfidence: Math.min(1, Math.round(best.similarity * 150) / 100),
        indicatorRequest,
      };
    },
  };
}
