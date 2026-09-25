import { z } from "zod";

// Port du modèle de langage de l'assistant (docs/modules/assistant-parcours-ux.md). Le module
// assistant ne connaît que ce contrat : il fournit les consignes, les extraits retrouvés et les
// faits du contexte, et reçoit une réponse structurée qu'il vérifie lui-même (citations, doses,
// confiance). Adaptateurs : SDK configuré par variables d'environnement, et fixture extractive
// déterministe (tests, fonctionnement sans clé). Aucun fournisseur n'est nommé ici.

/** Extrait du corpus transmis au modèle comme donnée citable. */
export interface AssistantPassage {
  chunkId: string;
  /** Titre de la fiche et intertitre de l'extrait. */
  heading: string;
  content: string;
  /** Organisme et titre de la source, pour la citation. */
  source: string;
  /** Similarité cosinus avec la question, de 0 à 1. */
  similarity: number;
}

export interface AnswerRequest {
  /** Consignes fixes de l'assistant (règles, format, refus). */
  instructions: string;
  /** Message utilisateur complet : question délimitée, extraits, faits, indicateurs. */
  prompt: string;
  /** Question brute, telle que saisie. */
  question: string;
  passages: readonly AssistantPassage[];
  /** Faits du contexte de l'utilisateur, en phrases (cultures, alertes, météo). */
  facts: readonly string[];
  /** Indicateurs que le modèle peut demander (ministère) ; vide ailleurs. */
  indicators: readonly string[];
}

export const modelAnswerSchema = z.object({
  /** Vrai quand la question sort de l'agriculture : aucune réponse sur le fond. */
  offTopic: z.boolean(),
  /** Réponse courte, trois phrases au plus. */
  answer: z.string().max(800),
  /** Conseil pratique en une phrase. */
  advice: z.string().max(400),
  citations: z
    .array(
      z.object({
        chunkId: z.string(),
        /** Passage recopié mot pour mot de l'extrait. */
        quote: z.string().max(500),
      }),
    )
    .max(6),
  /** Confiance que le modèle accorde à sa propre réponse, de 0 à 1. */
  selfConfidence: z.number().min(0).max(1),
  /** Ministère : indicateur choisi dans la liste fermée, et ses filtres. */
  indicatorRequest: z
    .object({ indicator: z.string(), filters: z.record(z.string(), z.string()) })
    .nullable(),
});

export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export interface LlmProvider {
  /** Référence du modèle telle que configurée, ou « fixture ». Journalisée avec chaque réponse. */
  readonly modelRef: string;
  /** Vrai pour l'adaptateur fixture : l'interface affiche « démonstration ». */
  readonly demonstration: boolean;
  answer(request: AnswerRequest): Promise<ModelAnswer>;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}
