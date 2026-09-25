import { z } from "zod";
import { prisma } from "@/database/client";
import { Prisma } from "@/generated/prisma/client";

// Extraits du corpus de l'assistant et recherche par similarité (pgvector, index HNSW,
// distance cosinus). La colonne embedding n'est pas lisible par Prisma : écriture et recherche
// passent par ces requêtes paramétrées. Un vecteur est transmis comme texte « [x,y,…] » puis
// converti en vector par PostgreSQL.

export interface ChunkInsert {
  ordinal: number;
  heading: string;
  content: string;
  tokenCount: number;
  contentHash: string;
  embedding: readonly number[];
}

export function vectorLiteral(values: readonly number[]): string {
  if (values.some((v) => !Number.isFinite(v))) throw new Error("Vecteur invalide");
  return `[${values.join(",")}]`;
}

/** Remplace les extraits d'une fiche, dans une transaction. */
export async function replaceDocumentChunks(
  documentId: string,
  chunks: readonly ChunkInsert[],
  embeddingModel: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "assistant_chunk" WHERE "document_id" = ${documentId}::uuid`;
    for (const chunk of chunks) {
      await tx.$executeRaw`
        INSERT INTO "assistant_chunk"
          ("id", "document_id", "ordinal", "heading", "content", "token_count", "content_hash",
           "embedding", "embedding_model")
        VALUES (gen_random_uuid(), ${documentId}::uuid, ${chunk.ordinal}, ${chunk.heading},
                ${chunk.content}, ${chunk.tokenCount}, ${chunk.contentHash},
                ${vectorLiteral(chunk.embedding)}::vector, ${embeddingModel})`;
    }
  });
}

const embeddedSchema = z.object({ model: z.string().nullable(), n: z.coerce.number() });

/** Modèle de plongement des extraits d'une fiche (null si aucun), et leur nombre. */
export async function readDocumentEmbedding(
  documentId: string,
): Promise<{ model: string | null; count: number }> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT min("embedding_model") AS model, count(*)::int AS n
    FROM "assistant_chunk" WHERE "document_id" = ${documentId}::uuid AND "embedding" IS NOT NULL`;
  const row = embeddedSchema.parse(rows[0] ?? { model: null, n: 0 });
  return { model: row.model, count: row.n };
}

const hitSchema = z.object({
  chunk_id: z.string(),
  heading: z.string(),
  content: z.string(),
  slug: z.string(),
  document_title: z.string(),
  organization: z.string(),
  source_title: z.string(),
  source_url: z.string(),
  licence: z.string(),
  demonstration: z.boolean(),
  checked_on: z.string(),
  similarity: z.coerce.number(),
});
export type ChunkHit = z.infer<typeof hitSchema>;

export interface ChunkSearch {
  embedding: readonly number[];
  embeddingModel: string;
  /** Ne garder que les fiches qui portent l'une de ces cultures, ou aucune culture (générales). */
  crops?: readonly string[];
  limit: number;
}

// Plus proches extraits des fiches publiées, produits par le même modèle de plongement que la
// question. Similarité = 1 − distance cosinus.
export async function searchChunks(search: ChunkSearch): Promise<ChunkHit[]> {
  const query = vectorLiteral(search.embedding);
  const cropFilter =
    search.crops && search.crops.length > 0
      ? Prisma.sql`AND (d."crops" && ${search.crops as string[]}::text[] OR cardinality(d."crops") = 0)`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT c."id" AS chunk_id, c."heading", c."content", d."slug", d."title" AS document_title,
           d."organization", d."source_title", d."source_url", d."licence", d."demonstration",
           to_char(d."checked_on", 'YYYY-MM-DD') AS checked_on,
           1 - (c."embedding" <=> ${query}::vector) AS similarity
    FROM "assistant_chunk" c
    JOIN "assistant_document" d ON d."id" = c."document_id"
    WHERE d."status" = 'PUBLISHED' AND c."embedding" IS NOT NULL
      AND c."embedding_model" = ${search.embeddingModel}
      ${cropFilter}
    ORDER BY c."embedding" <=> ${query}::vector
    LIMIT ${search.limit}`;
  return rows.map((row) => hitSchema.parse(row));
}
