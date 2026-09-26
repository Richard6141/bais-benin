-- Confrontation déclaration / satellite (ADR-0016) : NDVI de saison de chaque parcelle relevée,
-- calculé par Copernicus, jugé face au profil de la culture principale déclarée. Table nouvelle
-- seulement.

-- CreateEnum
CREATE TYPE "VegetationCheckStatus" AS ENUM ('CONSISTENT', 'TO_VERIFY', 'INSUFFICIENT_DATA', 'PENDING');

-- CreateTable
CREATE TABLE "parcel_vegetation_check" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "sub_season" "SubSeason" NOT NULL,
    "crop_id" UUID NOT NULL,
    "status" "VegetationCheckStatus" NOT NULL,
    "reason" TEXT,
    "peak_ndvi" DECIMAL(4,3),
    "base_ndvi" DECIMAL(4,3),
    "expected_ndvi" DECIMAL(4,3) NOT NULL,
    "valid_intervals" INTEGER NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "series" JSONB NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_vegetation_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_vegetation_check_campaign_id_status_idx" ON "parcel_vegetation_check"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_vegetation_check_parcel_id_campaign_id_sub_season_key" ON "parcel_vegetation_check"("parcel_id", "campaign_id", "sub_season");

-- AddForeignKey
ALTER TABLE "parcel_vegetation_check" ADD CONSTRAINT "parcel_vegetation_check_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_vegetation_check" ADD CONSTRAINT "parcel_vegetation_check_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_vegetation_check" ADD CONSTRAINT "parcel_vegetation_check_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_vegetation_check" ADD CONSTRAINT "parcel_vegetation_check_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
