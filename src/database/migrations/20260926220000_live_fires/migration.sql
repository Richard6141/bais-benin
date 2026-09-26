-- Feux actifs en quasi temps réel (NASA FIRMS, ADR-0022) : détections sur le territoire du
-- Bénin, dédoublonnées entre satellites, suivi des passages d'ingestion, catégorie d'alerte FIRE.

-- CreateEnum
CREATE TYPE "FireSensor" AS ENUM ('VIIRS_SNPP', 'VIIRS_NOAA20', 'VIIRS_NOAA21', 'MODIS');

-- CreateEnum
CREATE TYPE "FireConfidence" AS ENUM ('LOW', 'NOMINAL', 'HIGH');

-- AlterEnum
ALTER TYPE "AlertCategory" ADD VALUE 'FIRE';

-- CreateTable
CREATE TABLE "fire_detection" (
    "id" UUID NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(8,5) NOT NULL,
    "longitude" DECIMAL(8,5) NOT NULL,
    "location" geography(Point, 4326),
    "commune_id" UUID NOT NULL,
    "sensors" "FireSensor"[],
    "confidence" "FireConfidence" NOT NULL,
    "frp_mw" DECIMAL(9,2),
    "brightness_k" DECIMAL(6,2),
    "daynight" TEXT,
    "source_keys" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fire_detection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fire_ingestion_run" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "merged" INTEGER NOT NULL DEFAULT 0,
    "failed_files" TEXT[],
    "error" TEXT,

    CONSTRAINT "fire_ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fire_detection_detected_at_idx" ON "fire_detection"("detected_at");

-- CreateIndex
CREATE INDEX "fire_detection_commune_id_detected_at_idx" ON "fire_detection"("commune_id", "detected_at");

-- CreateIndex
CREATE INDEX "fire_ingestion_run_started_at_idx" ON "fire_ingestion_run"("started_at");

-- AddForeignKey
ALTER TABLE "fire_detection" ADD CONSTRAINT "fire_detection_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Index spatial : recherche des parcelles à moins de 1 km d'un feu, affichage par emprise.
CREATE INDEX "fire_detection_location_idx" ON "fire_detection" USING GIST ("location");

-- Source des alertes de feu (aussi semée par le jeu de référence).
INSERT INTO "data_source" ("id", "name", "organization", "url", "licence", "kind", "created_at", "updated_at")
VALUES ('NASA_FIRMS', 'Feux actifs NASA FIRMS (VIIRS 375 m, MODIS)', 'NASA LANCE / FIRMS',
        'https://firms.modaps.eosdis.nasa.gov', 'Données ouvertes de la NASA, citation demandée',
        'SENSOR', now(), now())
ON CONFLICT ("id") DO NOTHING;
