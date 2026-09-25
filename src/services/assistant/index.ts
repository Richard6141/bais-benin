import type { EmbeddingProvider } from "@/services/ports/embedding-provider";
import type { LlmProvider } from "@/services/ports/llm-provider";
import { createFixtureEmbeddingProvider } from "./fixture-embeddings";
import { createFixtureLlmProvider } from "./fixture-llm";
import { createSdkEmbeddingProvider, createSdkLlmProvider, type SdkAssistantConfig } from "./sdk";

export {
  FIXTURE_EMBEDDING_REF,
  createFixtureEmbeddingProvider,
  hashEmbedding,
} from "./fixture-embeddings";
export { createFixtureLlmProvider, looksAgricultural } from "./fixture-llm";
export { createSdkEmbeddingProvider, createSdkLlmProvider, type SdkAssistantConfig } from "./sdk";

export interface AssistantProviders {
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
}

// Choix des adaptateurs par configuration : chaque modèle absent est remplacé par l'adaptateur
// de démonstration, jamais par un fournisseur choisi à la place de l'exploitant. Les extraits
// enregistrent le modèle de plongement qui les a produits : changer ASSISTANT_EMBEDDING_MODEL
// demande de réindexer le corpus (la recherche ignore les extraits d'un autre modèle).
export function createAssistantProviders(
  config: Partial<SdkAssistantConfig> & {
    dimensions: number;
    timeoutMs: number;
  },
): AssistantProviders {
  return {
    llm: config.llmModel
      ? createSdkLlmProvider({ ...config, llmModel: config.llmModel })
      : createFixtureLlmProvider(),
    embeddings: config.embeddingModel
      ? createSdkEmbeddingProvider({ ...config, embeddingModel: config.embeddingModel })
      : createFixtureEmbeddingProvider(),
  };
}
