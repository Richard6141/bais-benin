import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, generateText, Output, type EmbeddingModel, type LanguageModel } from "ai";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "@/services/ports/embedding-provider";
import {
  LlmProviderError,
  modelAnswerSchema,
  type LlmProvider,
} from "@/services/ports/llm-provider";

// Adaptateurs de l'assistant sur le SDK d'IA (paquet « ai » 7). Aucun fournisseur ni modèle
// n'est écrit ici : les identifiants viennent de la configuration.
// - Avec une adresse de base (ASSISTANT_LLM_BASE_URL), le point d'accès est interrogé par
//   l'adaptateur compatible OpenAI : cela couvre un modèle hébergé sur une infrastructure
//   nationale ou tout service qui expose cette interface.
// - Sans adresse, l'identifiant est confié au fournisseur global du SDK, qui lit lui-même ses
//   identifiants d'accès dans l'environnement.

const PROVIDER_NAME = "assistant";

export interface SdkAssistantConfig {
  llmModel?: string;
  embeddingModel?: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions: number;
  timeoutMs: number;
}

function compatible(config: SdkAssistantConfig) {
  return config.baseUrl
    ? createOpenAICompatible({
        name: PROVIDER_NAME,
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })
    : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}

export function createSdkLlmProvider(
  config: SdkAssistantConfig & { llmModel: string },
  /** Modèle injecté (tests) ; sinon résolu depuis la configuration. */
  override?: LanguageModel,
): LlmProvider {
  const model: LanguageModel =
    override ?? compatible(config)?.chatModel(config.llmModel) ?? config.llmModel;
  return {
    modelRef: config.llmModel,
    demonstration: false,
    answer: async (request) => {
      try {
        const { output } = await generateText({
          model,
          instructions: request.instructions,
          prompt: request.prompt,
          output: Output.object({ schema: modelAnswerSchema }),
          temperature: 0,
          maxRetries: 2,
          timeout: config.timeoutMs,
        });
        return modelAnswerSchema.parse(output);
      } catch (error) {
        throw new LlmProviderError(`Modèle de langage indisponible : ${describe(error)}`, true);
      }
    },
  };
}

export function createSdkEmbeddingProvider(
  config: SdkAssistantConfig & { embeddingModel: string },
  override?: EmbeddingModel,
): EmbeddingProvider {
  const provider = compatible(config);
  const model: EmbeddingModel =
    override ?? provider?.embeddingModel(config.embeddingModel) ?? config.embeddingModel;
  return {
    modelRef: config.embeddingModel,
    dimensions: config.dimensions,
    embed: async (values) => {
      if (values.length === 0) return [];
      let embeddings: number[][];
      try {
        ({ embeddings } = await embedMany({
          model,
          values: [...values],
          maxRetries: 2,
          maxParallelCalls: 2,
          providerOptions: provider
            ? { [PROVIDER_NAME]: { dimensions: config.dimensions } }
            : undefined,
        }));
      } catch (error) {
        throw new EmbeddingProviderError(`Plongements indisponibles : ${describe(error)}`, true);
      }
      const wrong = embeddings.find((vector) => vector.length !== config.dimensions);
      if (wrong) {
        throw new EmbeddingProviderError(
          `Le modèle de plongement rend ${wrong.length} dimensions, ${config.dimensions} attendues`,
          false,
        );
      }
      return embeddings;
    },
  };
}
