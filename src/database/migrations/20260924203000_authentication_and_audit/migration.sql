-- Authentification (better-auth) et journal d'audit.
-- Les colonnes NPI changent de forme : index aveugle HMAC + chiffré versionné, statut de vérification.
-- L'énumération UserStatus est remplacée par un texte géré par better-auth (PENDING, ACTIVE, SUSPENDED, DELETED).
-- Généré par `prisma migrate diff` puis relu : les index spatiaux créés à la main sont conservés.

-- CreateEnum
CREATE TYPE "NpiStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'MISMATCH');

-- DropIndex
DROP INDEX "user_npi_hash_key";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "npi_encrypted",
DROP COLUMN "npi_hash",
DROP COLUMN "password_hash",
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "npi_ciphertext" TEXT,
ADD COLUMN     "npi_index" BYTEA,
ADD COLUMN     "npi_status" "NpiStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "phone_verified" BOOLEAN,
ADD COLUMN     "two_factor_enabled" BOOLEAN DEFAULT false,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "preferred_locale" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE IF EXISTS "UserStatus";

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_two_factor" (
    "id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failed_verification_count" INTEGER DEFAULT 0,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "auth_two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "details" JSONB,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "correlation_id" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_account_user_id_idx" ON "auth_account"("user_id");

-- CreateIndex
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification"("identifier");

-- CreateIndex
CREATE INDEX "auth_two_factor_secret_idx" ON "auth_two_factor"("secret");

-- CreateIndex
CREATE INDEX "auth_two_factor_user_id_idx" ON "auth_two_factor"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_key_key" ON "auth_rate_limit"("key");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_occurred_at_idx" ON "audit_log"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_action_occurred_at_idx" ON "audit_log"("action", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_npi_index_key" ON "user"("npi_index");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
