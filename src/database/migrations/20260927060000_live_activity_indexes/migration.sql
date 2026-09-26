-- Fil d'activité en direct : les lectures « depuis tel instant » portent sur tout le pays (ou un
-- périmètre de communes). Un événement d'exploitation porte l'heure de saisie sur l'appareil, parfois
-- bien antérieure à son arrivée (hors ligne) : on ajoute l'heure d'arrivée, recopiée de l'heure de
-- saisie pour l'existant.

-- AlterTable
ALTER TABLE "farm_event" ADD COLUMN "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "farm_event" SET "recorded_at" = "occurred_at";

-- CreateIndex
CREATE INDEX "farm_event_recorded_at_idx" ON "farm_event"("recorded_at");

-- CreateIndex
CREATE INDEX "fire_detection_created_at_idx" ON "fire_detection"("created_at");

-- CreateIndex
CREATE INDEX "alert_created_at_idx" ON "alert"("created_at");

-- CreateIndex
CREATE INDEX "assistance_request_created_at_idx" ON "assistance_request"("created_at");

-- CreateIndex
CREATE INDEX "field_report_created_at_idx" ON "field_report"("created_at");
