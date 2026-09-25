import { getServerEnv } from "@/lib/env";
import { createAssistantProviders, type AssistantProviders } from "@/services/assistant";

// Adaptateurs de l'assistant selon la configuration (voir src/lib/env.ts). Sans modèle
// configuré : adaptateurs de démonstration. Créés une fois par processus.

let cached: AssistantProviders | undefined;

export function getAssistantProviders(): AssistantProviders {
  if (!cached) {
    const env = getServerEnv();
    cached = createAssistantProviders({
      llmModel: env.ASSISTANT_LLM_MODEL,
      embeddingModel: env.ASSISTANT_EMBEDDING_MODEL,
      baseUrl: env.ASSISTANT_LLM_BASE_URL,
      apiKey: env.ASSISTANT_LLM_API_KEY,
      dimensions: env.ASSISTANT_EMBEDDING_DIMENSIONS,
      timeoutMs: env.ASSISTANT_TIMEOUT_MS,
    });
  }
  return cached;
}
