-- Carte des cultures par satellite (ADR-0021) : surfaces estimées par commune, campagne et classe, et
-- couche d'image de la carte des cultures dans le cache. Table et valeurs nouvelles seulement.

-- CreateEnum
CREATE TYPE "CropMapClass" AS ENUM ('UNCLASSIFIED', 'RICE', 'ANNUAL', 'COTTON', 'PERENNIAL', 'GARDEN', 'FALLOW', 'NATURAL', 'WATER', 'BUILT');

-- AlterEnum
ALTER TYPE "SatelliteLayer" ADD VALUE 'CROP_CLASSES';


-- CreateTable
CREATE TABLE "crop_area_estimate" (
    "id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "crop_class" "CropMapClass" NOT NULL,
    "area_ha" DECIMAL(12,2) NOT NULL,
    "pixel_share" DECIMAL(6,4) NOT NULL,
    "unclassified_share" DECIMAL(6,4) NOT NULL,
    "resolution_m" INTEGER NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_area_estimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crop_area_estimate_campaign_id_crop_class_idx" ON "crop_area_estimate"("campaign_id", "crop_class");

-- CreateIndex
CREATE UNIQUE INDEX "crop_area_estimate_commune_id_campaign_id_crop_class_key" ON "crop_area_estimate"("commune_id", "campaign_id", "crop_class");

-- AddForeignKey
ALTER TABLE "crop_area_estimate" ADD CONSTRAINT "crop_area_estimate_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_area_estimate" ADD CONSTRAINT "crop_area_estimate_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_area_estimate" ADD CONSTRAINT "crop_area_estimate_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

