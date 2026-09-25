import { searchChunks, type ChunkHit } from "@/database/sql/assistant.sql";
import type { EmbeddingProvider } from "@/services/ports/embedding-provider";
import type { AssistantPassage } from "@/services/ports/llm-provider";

// Recherche des extraits qui répondent à une question : plongement de la question avec le même
// modèle que le corpus, plus proches voisins dans pgvector, puis léger avantage aux fiches des
// cultures du contexte de l'utilisateur. La similarité rendue est la pertinence calibrée par
// l'adaptateur de plongement (relevance), sur une échelle commune de 0 à 1.

export const RETRIEVE_LIMIT = 8;
/** En dessous, un extrait n'est pas transmis au modèle : trop éloigné pour appuyer une réponse. */
export const MIN_PASSAGE_SIMILARITY = 0.2;
/** Avantage de classement d'une fiche qui porte une culture de l'utilisateur. */
const CROP_BOOST = 0.05;

export interface RetrievedPassage extends AssistantPassage {
  slug: string;
  documentTitle: string;
  organization: string;
  sourceTitle: string;
  sourceUrl: string;
  licence: string;
  demonstration: boolean;
  checkedOn: string;
}

function toPassage(hit: ChunkHit): RetrievedPassage {
  return {
    chunkId: hit.chunk_id,
    heading: hit.heading,
    content: hit.content,
    source: `${hit.organization}, « ${hit.source_title} »${hit.demonstration ? " (fiche de démonstration)" : ""}`,
    similarity: hit.similarity,
    slug: hit.slug,
    documentTitle: hit.document_title,
    organization: hit.organization,
    sourceTitle: hit.source_title,
    sourceUrl: hit.source_url,
    licence: hit.licence,
    demonstration: hit.demonstration,
    checkedOn: hit.checked_on,
  };
}

export async function retrievePassages(
  question: string,
  embeddings: EmbeddingProvider,
  options: { crops?: readonly string[]; limit?: number } = {},
): Promise<RetrievedPassage[]> {
  const [embedding] = await embeddings.embed([question]);
  if (!embedding) return [];
  const limit = options.limit ?? RETRIEVE_LIMIT;
  // Pas de filtre strict : un producteur de maïs peut interroger sur l'igname. Les fiches des
  // cultures du contexte sont seulement avantagées au classement.
  const relevance = (similarity: number) => embeddings.relevance?.(similarity) ?? similarity;
  const hits = await searchChunks({
    embedding,
    embeddingModel: embeddings.modelRef,
    limit: limit * 2,
  });
  const crops = new Set(options.crops ?? []);
  const boost = (hit: ChunkHit) => (hit.crops.some((c) => crops.has(c)) ? CROP_BOOST : 0);
  return hits
    .map((h) => ({ ...h, similarity: relevance(h.similarity) }))
    .filter((h) => h.similarity >= MIN_PASSAGE_SIMILARITY)
    .sort((a, b) => b.similarity + boost(b) - (a.similarity + boost(a)))
    .slice(0, limit)
    .map(toPassage);
}
