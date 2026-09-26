-- CreateTable
CREATE TABLE "parcel_crop_class_check" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "crop_id" UUID NOT NULL,
    "declared_class" "CropMapClass" NOT NULL,
    "observed_class" "CropMapClass" NOT NULL,
    "class_pixels" JSONB NOT NULL,
    "classified_pixels" INTEGER NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_crop_class_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_crop_class_check_campaign_id_declared_class_idx" ON "parcel_crop_class_check"("campaign_id", "declared_class");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_crop_class_check_parcel_id_campaign_id_key" ON "parcel_crop_class_check"("parcel_id", "campaign_id");

-- AddForeignKey
ALTER TABLE "parcel_crop_class_check" ADD CONSTRAINT "parcel_crop_class_check_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_class_check" ADD CONSTRAINT "parcel_crop_class_check_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_class_check" ADD CONSTRAINT "parcel_crop_class_check_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_class_check" ADD CONSTRAINT "parcel_crop_class_check_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

