-- Vue du ciel (ADR-0016) : cache des images Sentinel-2 calculées par le Copernicus Data Space
-- Ecosystem et décompte mensuel des requêtes de traitement (quota du compte gratuit). Tables
-- nouvelles seulement.

-- CreateEnum
CREATE TYPE "SatelliteLayer" AS ENUM ('TRUE_COLOR', 'NDVI');

-- CreateTable
CREATE TABLE "satellite_tile" (
    "layer" "SatelliteLayer" NOT NULL,
    "period" TEXT NOT NULL,
    "tile_key" TEXT NOT NULL,
    "image" BYTEA,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "satellite_tile_pkey" PRIMARY KEY ("layer","period","tile_key")
);

-- CreateTable
CREATE TABLE "satellite_usage" (
    "month" TEXT NOT NULL,
    "image_requests" INTEGER NOT NULL DEFAULT 0,
    "statistics_requests" INTEGER NOT NULL DEFAULT 0,
    "processing_units" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "satellite_usage_pkey" PRIMARY KEY ("month")
);
