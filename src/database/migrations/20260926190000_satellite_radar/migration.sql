-- Sentinel-1 radar pour la saison des pluies (ADR-0019) : capteur qui a tranché la confrontation
-- (S2 par défaut, S1 quand les nuages ont empêché Sentinel-2 de conclure) et série radar gardée à
-- part. La source COPERNICUS_S1 est créée ici pour que la clé étrangère tienne sans nouveau seed.

-- AlterTable
ALTER TABLE "parcel_vegetation_check" ADD COLUMN "sensor" TEXT NOT NULL DEFAULT 'S2',
ADD COLUMN "radar_series" JSONB;

ALTER TABLE "parcel_vegetation_check"
  ADD CONSTRAINT "parcel_vegetation_check_sensor_check" CHECK ("sensor" IN ('S2', 'S1'));

-- Source de données
INSERT INTO "data_source" ("id", "name", "organization", "url", "licence", "kind", "created_at", "updated_at")
VALUES (
  'COPERNICUS_S1',
  'Copernicus Sentinel-1 GRD (radar) — Copernicus Data Space Ecosystem',
  'Commission européenne et Agence spatiale européenne (programme Copernicus)',
  'https://dataspace.copernicus.eu',
  'Licence Copernicus (accès libre et gratuit) — « Contains modified Copernicus Sentinel data »',
  'SENSOR',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
