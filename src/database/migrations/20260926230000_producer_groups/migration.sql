-- Groupes de producteurs (ADR-0024) : groupes formés depuis le palmarès, leurs membres et les
-- messages WhatsApp du ministère. Tables et valeur d'énumération nouvelles seulement.

-- AlterEnum
ALTER TYPE "FarmerNotificationKind" ADD VALUE 'GROUP_MESSAGE';

-- CreateTable
CREATE TABLE "producer_group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "crop_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "departement_id" UUID,
    "criteria" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "producer_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_group_member" (
    "group_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "yield_t_per_ha" DECIMAL(8,3),
    "produced_kg" DECIMAL(14,2) NOT NULL,
    "area_ha" DECIMAL(10,3) NOT NULL,
    "verified" BOOLEAN NOT NULL,

    CONSTRAINT "producer_group_member_pkey" PRIMARY KEY ("group_id","farmer_id")
);

-- CreateTable
CREATE TABLE "producer_group_message" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producer_group_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producer_group_archived_at_created_at_idx" ON "producer_group"("archived_at", "created_at");

-- CreateIndex
CREATE INDEX "producer_group_member_farmer_id_idx" ON "producer_group_member"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_group_member_group_id_rank_key" ON "producer_group_member"("group_id", "rank");

-- CreateIndex
CREATE INDEX "producer_group_message_group_id_created_at_idx" ON "producer_group_message"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "producer_group" ADD CONSTRAINT "producer_group_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group" ADD CONSTRAINT "producer_group_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group" ADD CONSTRAINT "producer_group_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group" ADD CONSTRAINT "producer_group_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group_member" ADD CONSTRAINT "producer_group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "producer_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group_member" ADD CONSTRAINT "producer_group_member_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group_message" ADD CONSTRAINT "producer_group_message_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "producer_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_group_message" ADD CONSTRAINT "producer_group_message_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
