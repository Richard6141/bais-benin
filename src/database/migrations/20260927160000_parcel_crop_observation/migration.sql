-- CreateTable
CREATE TABLE "parcel_crop_observation" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "crop_id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_crop_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_crop_observation_parcel_id_campaign_id_observed_at_idx" ON "parcel_crop_observation"("parcel_id", "campaign_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_crop_observation_verification_id_parcel_id_key" ON "parcel_crop_observation"("verification_id", "parcel_id");

-- AddForeignKey
ALTER TABLE "parcel_crop_observation" ADD CONSTRAINT "parcel_crop_observation_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_observation" ADD CONSTRAINT "parcel_crop_observation_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_observation" ADD CONSTRAINT "parcel_crop_observation_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_observation" ADD CONSTRAINT "parcel_crop_observation_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "farm_verification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_observation" ADD CONSTRAINT "parcel_crop_observation_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
