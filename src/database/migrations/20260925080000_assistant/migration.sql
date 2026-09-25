-- Assistant agricole (étape 8, docs/modules/assistant-parcours-ux.md) : corpus de fiches
-- techniques découpé en extraits avec leur plongement (pgvector), conversations, retours et
-- demandes transmises aux agents. Tables nouvelles seulement ; l'extension vector est créée
-- par la migration enable_extensions.
--
-- Dimension des plongements : 1024. Le modèle de plongement configuré (variable
-- ASSISTANT_EMBEDDING_MODEL) doit produire cette dimension ; l'application le vérifie au
-- démarrage (ASSISTANT_EMBEDDING_DIMENSIONS). En changer demande une migration de colonne et
-- une réindexation du corpus.

-- CreateEnum
CREATE TYPE "AssistantDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistantOutcome" AS ENUM ('ANSWERED', 'LOW_CONFIDENCE', 'OFF_TOPIC', 'UNSAFE_DOSAGE', 'PROVIDER_ERROR');

-- CreateEnum
CREATE TYPE "AssistantRequestStatus" AS ENUM ('OPEN', 'HANDLED');

-- CreateTable
CREATE TABLE "assistant_document" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "source_title" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "licence" TEXT NOT NULL,
    "published_on" TEXT,
    "checked_on" DATE NOT NULL,
    "demonstration" BOOLEAN NOT NULL DEFAULT false,
    "crops" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zone_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alert_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content_hash" TEXT NOT NULL,
    "status" "AssistantDocumentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_chunk" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1024),
    "embedding_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_conversation" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "role" "Role" NOT NULL,
    "commune_id" UUID,
    "farm_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purge_after" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "confidence" DECIMAL(4,3),
    "confidence_label" TEXT,
    "outcome" "AssistantOutcome",
    "model_ref" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_feedback" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID,
    "useful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_agent_request" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "status" "AssistantRequestStatus" NOT NULL DEFAULT 'OPEN',
    "handled_by_id" UUID,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_agent_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_document_slug_key" ON "assistant_document"("slug");

-- CreateIndex
CREATE INDEX "assistant_document_status_idx" ON "assistant_document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_chunk_document_id_ordinal_key" ON "assistant_chunk"("document_id", "ordinal");

-- CreateIndex
CREATE INDEX "assistant_conversation_user_id_created_at_idx" ON "assistant_conversation"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_conversation_commune_id_created_at_idx" ON "assistant_conversation"("commune_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_conversation_purge_after_idx" ON "assistant_conversation"("purge_after");

-- CreateIndex
CREATE INDEX "assistant_message_conversation_id_created_at_idx" ON "assistant_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_message_outcome_created_at_idx" ON "assistant_message"("outcome", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_feedback_message_id_user_id_key" ON "assistant_feedback"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_agent_request_message_id_key" ON "assistant_agent_request"("message_id");

-- CreateIndex
CREATE INDEX "assistant_agent_request_commune_id_status_created_at_idx" ON "assistant_agent_request"("commune_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "assistant_chunk" ADD CONSTRAINT "assistant_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "assistant_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_feedback" ADD CONSTRAINT "assistant_feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "assistant_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_feedback" ADD CONSTRAINT "assistant_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_agent_request" ADD CONSTRAINT "assistant_agent_request_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "assistant_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_agent_request" ADD CONSTRAINT "assistant_agent_request_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_agent_request" ADD CONSTRAINT "assistant_agent_request_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Recherche par similarité cosinus (index HNSW, non représentable dans schema.prisma :
-- `prisma migrate diff` propose de le supprimer, ne pas appliquer cette suppression).
CREATE INDEX "assistant_chunk_embedding_hnsw_idx"
  ON "assistant_chunk" USING hnsw ("embedding" vector_cosine_ops);

-- Filtre des fiches par culture avant la recherche.
CREATE INDEX "assistant_document_crops_idx" ON "assistant_document" USING gin ("crops");
