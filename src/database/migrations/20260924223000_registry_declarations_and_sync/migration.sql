-- Déclarations de récolte, vérifications de terrain, fil d'activité et journal des commandes
-- de synchronisation (docs/04 §6 et §10, ADR-0005). Index spatiaux manuels conservés.

-- CreateEnum
CREATE TYPE "HarvestUnit" AS ENUM ('KG', 'T', 'BAG_100KG', 'BAG_50KG', 'BUNCH', 'HEAP', 'BASIN');

-- CreateEnum
CREATE TYPE "DeclaredBy" AS ENUM ('FARMER', 'AGENT');

-- CreateEnum
CREATE TYPE "FieldVerificationKind" AS ENUM ('DESK_REVIEW', 'FIELD_VISIT', 'REMOTE_SENSING');

-- CreateEnum
CREATE TYPE "FieldVerificationOutcome" AS ENUM ('CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncOutcome" AS ENUM ('APPLIED', 'DUPLICATE', 'REJECTED', 'CONFLICT');

-- CreateTable
CREATE TABLE "production_declaration" (
    "id" UUID NOT NULL,
    "parcel_crop_id" UUID NOT NULL,
    "declared_quantity" DECIMAL(12,2) NOT NULL,
    "unit" "HarvestUnit" NOT NULL,
    "quantity_kg" DECIMAL(14,2) NOT NULL,
    "declared_on" DATE NOT NULL,
    "declared_by" "DeclaredBy" NOT NULL,
    "declared_by_user_id" UUID,
    "losses_pct" DECIMAL(5,2),
    "loss_cause" TEXT,
    "price_hint_fcfa_per_kg" DECIMAL(10,2),
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "production_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_verification" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "parcel_id" UUID,
    "kind" "FieldVerificationKind" NOT NULL,
    "outcome" "FieldVerificationOutcome" NOT NULL,
    "notes" TEXT,
    "identity_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "visited_at" TIMESTAMP(3) NOT NULL,
    "gps_point" geography(Point, 4326),
    "agent_id" UUID,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_event" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "actor_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_command" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "command_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "client_created_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "outcome" "SyncOutcome" NOT NULL,
    "result" JSONB,

    CONSTRAINT "sync_command_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_declaration_parcel_crop_id_idx" ON "production_declaration"("parcel_crop_id");

-- CreateIndex
CREATE INDEX "farm_verification_farm_id_visited_at_idx" ON "farm_verification"("farm_id", "visited_at");

-- CreateIndex
CREATE INDEX "farm_event_farm_id_occurred_at_idx" ON "farm_event"("farm_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_command_idempotency_key_key" ON "sync_command"("idempotency_key");

-- CreateIndex
CREATE INDEX "sync_command_user_id_received_at_idx" ON "sync_command"("user_id", "received_at");

-- AddForeignKey
ALTER TABLE "production_declaration" ADD CONSTRAINT "production_declaration_parcel_crop_id_fkey" FOREIGN KEY ("parcel_crop_id") REFERENCES "parcel_crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_declaration" ADD CONSTRAINT "production_declaration_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_verification" ADD CONSTRAINT "farm_verification_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_verification" ADD CONSTRAINT "farm_verification_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_verification" ADD CONSTRAINT "farm_verification_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_verification" ADD CONSTRAINT "farm_verification_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_event" ADD CONSTRAINT "farm_event_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index spatial de la position relevée lors des visites.
CREATE INDEX "farm_verification_gps_point_idx" ON "farm_verification" USING GIST ("gps_point");
