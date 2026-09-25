-- Signalements de terrain (phase 0, docs/modules/signalements.md) : problème signalé sur une
-- parcelle par le producteur ou l'agent (ravageur, maladie des cultures, maladie animale), avec
-- sa position et une photo facultative. Tables nouvelles seulement. L'identifiant vient de
-- l'appareil (saisie hors ligne). La photo est stockée à part, réencodée sans métadonnées.

-- CreateEnum
CREATE TYPE "FieldReportType" AS ENUM ('PEST', 'CROP_DISEASE', 'ANIMAL_DISEASE', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldReportStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "field_report" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "parcel_id" UUID,
    "commune_id" UUID NOT NULL,
    "type" "FieldReportType" NOT NULL,
    "crop_code" TEXT,
    "description" TEXT NOT NULL,
    "location" geography(Point, 4326),
    "location_source" TEXT NOT NULL,
    "gps_accuracy_m" DECIMAL(8,1),
    "observed_at" TIMESTAMP(3) NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "status" "FieldReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "field_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_report_photo" (
    "report_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "field_report_photo_pkey" PRIMARY KEY ("report_id")
);

-- CreateIndex
CREATE INDEX "field_report_commune_id_type_observed_at_idx" ON "field_report"("commune_id", "type", "observed_at");

-- CreateIndex
CREATE INDEX "field_report_farm_id_created_at_idx" ON "field_report"("farm_id", "created_at");

-- CreateIndex
CREATE INDEX "field_report_status_created_at_idx" ON "field_report"("status", "created_at");

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report_photo" ADD CONSTRAINT "field_report_photo_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "field_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index spatial pour la détection des regroupements de signalements (ADR-0015).
CREATE INDEX "field_report_location_idx" ON "field_report" USING GIST ("location");
