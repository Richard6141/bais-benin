import { prisma } from "@/database/client";
import { readDocumentEmbedding, replaceDocumentChunks } from "@/database/sql/assistant.sql";
import type { EmbeddingProvider } from "@/services/ports/embedding-provider";
import { chunkFiche, embeddingText, type Fiche } from "./corpus";

// Chargement du corpus en base : une fiche par document (clé : slug), ses extraits et leurs
// plongements. Idempotent : une fiche dont le contenu et le modèle de plongement n'ont pas
// changé n'est pas recalculée. Une fiche retirée du corpus est archivée (plus jamais citée),
// pas supprimée : les anciennes réponses gardent leur référence.

const EMBED_BATCH = 32;

export interface CorpusIngestion {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  chunks: number;
  embeddingModel: string;
}

async function embedAll(values: string[], embeddings: EmbeddingProvider): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < values.length; i += EMBED_BATCH) {
    vectors.push(...(await embeddings.embed(values.slice(i, i + EMBED_BATCH))));
  }
  return vectors;
}

export async function ingestCorpus(
  fiches: readonly Fiche[],
  embeddings: EmbeddingProvider,
  options: { archiveMissing?: boolean } = {},
): Promise<CorpusIngestion> {
  const slugs = new Set<string>();
  const result: CorpusIngestion = {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    chunks: 0,
    embeddingModel: embeddings.modelRef,
  };
  for (const fiche of fiches) {
    const { meta } = fiche;
    if (slugs.has(meta.slug)) throw new Error(`Fiche en double : ${meta.slug}`);
    slugs.add(meta.slug);
    const data = {
      title: meta.title,
      organization: meta.source.organization,
      sourceTitle: meta.source.title,
      sourceUrl: meta.source.url,
      licence: meta.source.licence,
      publishedOn: meta.source.published,
      checkedOn: new Date(`${meta.source.checkedOn}T00:00:00Z`),
      demonstration: meta.demonstration,
      crops: meta.crops,
      zoneCodes: meta.zones,
      topics: meta.topics,
      alertCategories: meta.alertCategories,
      contentHash: fiche.contentHash,
      status: "PUBLISHED" as const,
      reviewedBy: meta.reviewedBy,
    };
    const existing = await prisma.assistantDocument.findUnique({ where: { slug: meta.slug } });
    const document = existing
      ? await prisma.assistantDocument.update({ where: { id: existing.id }, data })
      : await prisma.assistantDocument.create({ data: { slug: meta.slug, ...data } });
    const embedded = await readDocumentEmbedding(document.id);
    if (
      existing &&
      existing.contentHash === fiche.contentHash &&
      existing.status === "PUBLISHED" &&
      embedded.model === embeddings.modelRef &&
      embedded.count > 0
    ) {
      result.unchanged += 1;
      result.chunks += embedded.count;
      continue;
    }
    const chunks = chunkFiche(fiche);
    const vectors = await embedAll(chunks.map(embeddingText), embeddings);
    await replaceDocumentChunks(
      document.id,
      chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i]! })),
      embeddings.modelRef,
    );
    result.chunks += chunks.length;
    if (existing) result.updated += 1;
    else result.created += 1;
  }
  if (options.archiveMissing) {
    const archived = await prisma.assistantDocument.updateMany({
      where: { slug: { notIn: [...slugs] }, status: { not: "ARCHIVED" } },
      data: { status: "ARCHIVED" },
    });
    result.archived = archived.count;
  }
  return result;
}
