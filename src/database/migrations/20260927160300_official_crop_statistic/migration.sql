-- CreateEnum
CREATE TYPE "OfficialStatMetric" AS ENUM ('AREA_HA', 'PRODUCTION_T', 'YIELD_T_HA');

-- CreateEnum
CREATE TYPE "OfficialStatLevel" AS ENUM ('NATIONAL', 'DEPARTEMENT', 'COMMUNE');

-- CreateTable
CREATE TABLE "official_crop_statistic" (
    "id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "campaign_code" TEXT NOT NULL,
    "level" "OfficialStatLevel" NOT NULL,
    "territory_code" TEXT NOT NULL,
    "crop_id" UUID NOT NULL,
    "metric" "OfficialStatMetric" NOT NULL,
    "value" DECIMAL(14,3) NOT NULL,
    "reference" TEXT,
    "file_name" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by_id" UUID NOT NULL,

    CONSTRAINT "official_crop_statistic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "official_crop_statistic_territory_code_crop_id_idx" ON "official_crop_statistic"("territory_code", "crop_id");

-- CreateIndex
CREATE UNIQUE INDEX "official_crop_statistic_source_id_campaign_code_territory_c_key" ON "official_crop_statistic"("source_id", "campaign_code", "territory_code", "crop_id", "metric");

-- AddForeignKey
ALTER TABLE "official_crop_statistic" ADD CONSTRAINT "official_crop_statistic_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_crop_statistic" ADD CONSTRAINT "official_crop_statistic_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_crop_statistic" ADD CONSTRAINT "official_crop_statistic_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
