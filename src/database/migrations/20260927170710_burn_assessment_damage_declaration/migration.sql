-- CreateEnum
CREATE TYPE "BurnAssessmentStatus" AS ENUM ('PENDING', 'MEASURED', 'INSUFFICIENT_IMAGE', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "BurnAssessmentTrigger" AS ENUM ('ALERT', 'REQUEST');

-- CreateEnum
CREATE TYPE "DamageCause" AS ENUM ('FIRE');

-- CreateEnum
CREATE TYPE "DamageDeclarationStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "burn_assessment" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "fire_detection_id" UUID,
    "fire_detected_at" TIMESTAMP(3) NOT NULL,
    "fire_distance_m" INTEGER NOT NULL,
    "trigger" "BurnAssessmentTrigger" NOT NULL,
    "alert_id" UUID,
    "requested_by_id" UUID,
    "status" "BurnAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "measure_after" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "valid_share" DECIMAL(5,4),
    "burned_share_low" DECIMAL(5,4),
    "burned_share_high" DECIMAL(5,4),
    "severe_share" DECIMAL(5,4),
    "burned_area_low_ha" DECIMAL(10,3),
    "burned_area_high_ha" DECIMAL(10,3),
    "pixels" INTEGER,
    "processing_units" DECIMAL(9,4),
    "source_id" TEXT,
    "reliability" "Reliability",
    "measured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "burn_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_declaration" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "burn_assessment_id" UUID NOT NULL,
    "cause" "DamageCause" NOT NULL DEFAULT 'FIRE',
    "status" "DamageDeclarationStatus" NOT NULL DEFAULT 'PROPOSED',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "estimated_low_ha" DECIMAL(10,3) NOT NULL,
    "estimated_high_ha" DECIMAL(10,3) NOT NULL,
    "observed_area_ha" DECIMAL(10,3),
    "crop_id" UUID,
    "crop_stage" "CropStage",
    "note" TEXT,
    "reject_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "burn_assessment_status_measure_after_idx" ON "burn_assessment"("status", "measure_after");

-- CreateIndex
CREATE INDEX "burn_assessment_measured_at_idx" ON "burn_assessment"("measured_at");

-- CreateIndex
CREATE UNIQUE INDEX "burn_assessment_parcel_id_fire_detected_at_key" ON "burn_assessment"("parcel_id", "fire_detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "damage_declaration_burn_assessment_id_key" ON "damage_declaration"("burn_assessment_id");

-- CreateIndex
CREATE INDEX "damage_declaration_status_created_at_idx" ON "damage_declaration"("status", "created_at");

-- CreateIndex
CREATE INDEX "damage_declaration_farm_id_idx" ON "damage_declaration"("farm_id");

-- AddForeignKey
ALTER TABLE "burn_assessment" ADD CONSTRAINT "burn_assessment_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "burn_assessment" ADD CONSTRAINT "burn_assessment_fire_detection_id_fkey" FOREIGN KEY ("fire_detection_id") REFERENCES "fire_detection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "burn_assessment" ADD CONSTRAINT "burn_assessment_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "burn_assessment" ADD CONSTRAINT "burn_assessment_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "burn_assessment" ADD CONSTRAINT "burn_assessment_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_declaration" ADD CONSTRAINT "damage_declaration_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_declaration" ADD CONSTRAINT "damage_declaration_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_declaration" ADD CONSTRAINT "damage_declaration_burn_assessment_id_fkey" FOREIGN KEY ("burn_assessment_id") REFERENCES "burn_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_declaration" ADD CONSTRAINT "damage_declaration_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_declaration" ADD CONSTRAINT "damage_declaration_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

