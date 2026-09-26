-- Revue de sécurité R2 (quota Copernicus) : limiteur global sous le plafond de 300 requêtes par
-- minute du compte CDSE, vérifié dans la même requête que la réservation mensuelle.

-- AlterTable
ALTER TABLE "satellite_usage" ADD COLUMN "minute_bucket" TEXT,
ADD COLUMN "minute_requests" INTEGER NOT NULL DEFAULT 0;
