-- CreateEnum
CREATE TYPE "AreaLandCover" AS ENUM ('CROP', 'FALLOW', 'NATURAL', 'WATER', 'BUILT', 'INACCESSIBLE');

-- CreateTable
CREATE TABLE "area_frame_point" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "geom" geography(Point, 4326) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "spacing_m" INTEGER NOT NULL,
    "origin_x_m" INTEGER NOT NULL,
    "origin_y_m" INTEGER NOT NULL,
    "drawn_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "map_class" "CropMapClass",
    "map_method_version" INTEGER,
    "map_computed_at" TIMESTAMP(3),
    "map_source_id" TEXT,
    "map_reliability" "Reliability",

    CONSTRAINT "area_frame_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_frame_observation" (
    "id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "land_cover" "AreaLandCover" NOT NULL,
    "crop_id" UUID,
    "reason" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "distance_m" INTEGER,
    "observed_by_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_frame_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "area_frame_point_commune_id_campaign_id_idx" ON "area_frame_point"("commune_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "area_frame_point_campaign_id_code_key" ON "area_frame_point"("campaign_id", "code");

-- CreateIndex
CREATE INDEX "area_frame_point_geom_idx" ON "area_frame_point" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "area_frame_observation_point_id_observed_at_idx" ON "area_frame_observation"("point_id", "observed_at");

-- AddForeignKey
ALTER TABLE "area_frame_point" ADD CONSTRAINT "area_frame_point_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_point" ADD CONSTRAINT "area_frame_point_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_point" ADD CONSTRAINT "area_frame_point_map_source_id_fkey" FOREIGN KEY ("map_source_id") REFERENCES "data_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_observation" ADD CONSTRAINT "area_frame_observation_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "area_frame_point"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_observation" ADD CONSTRAINT "area_frame_observation_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_observation" ADD CONSTRAINT "area_frame_observation_observed_by_id_fkey" FOREIGN KEY ("observed_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_frame_observation" ADD CONSTRAINT "area_frame_observation_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
