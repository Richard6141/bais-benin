-- Délimitation assistée des champs (ADR-0016, phase 3) : mode de relevé des contours proposés
-- depuis l'image Sentinel-2 et validés par l'agent, et décompte des propositions, qui ont leur
-- part réservée du plafond mensuel de requêtes Copernicus.

-- AlterEnum
ALTER TYPE "ParcelCaptureMethod" ADD VALUE 'SATELLITE_ASSISTED';

-- AlterTable
ALTER TABLE "satellite_usage" ADD COLUMN "proposal_requests" INTEGER NOT NULL DEFAULT 0;
