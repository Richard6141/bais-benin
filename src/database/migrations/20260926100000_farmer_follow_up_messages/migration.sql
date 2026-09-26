-- Messages WhatsApp de suivi au producteur : demande d'assistance prise en charge ou résolue,
-- signalement confirmé ou écarté (docs/modules/suivi-et-palmares.md).

-- CreateEnum
CREATE TYPE "FarmerNotificationKind" AS ENUM ('ASSISTANCE_TAKEN', 'ASSISTANCE_RESOLVED', 'REPORT_CONFIRMED', 'REPORT_DISMISSED');

-- CreateTable
CREATE TABLE "farmer_notification" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "kind" "FarmerNotificationKind" NOT NULL,
    "subject_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmer_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farmer_notification_status_next_attempt_at_idx" ON "farmer_notification"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "farmer_notification_farmer_id_created_at_idx" ON "farmer_notification"("farmer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_notification_kind_subject_id_key" ON "farmer_notification"("kind", "subject_id");

-- AddForeignKey
ALTER TABLE "farmer_notification" ADD CONSTRAINT "farmer_notification_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
