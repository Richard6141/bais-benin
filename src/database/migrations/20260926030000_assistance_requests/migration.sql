-- Demandes d'assistance « Solliciter l'État » (phase 0, docs/modules/signalements.md) : demande
-- d'un producteur routée vers les agents de sa commune, suivie de la réception à la résolution.
-- Tables et types nouveaux seulement. L'identifiant vient de l'appareil (saisie hors ligne).

-- CreateEnum
CREATE TYPE "AssistanceCategory" AS ENUM ('ADVICE', 'INPUT', 'DISPUTE', 'DISASTER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssistanceStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "assistance_request" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "farm_id" UUID,
    "commune_id" UUID NOT NULL,
    "category" "AssistanceCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AssistanceStatus" NOT NULL DEFAULT 'RECEIVED',
    "handled_by_id" UUID,
    "taken_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "assistance_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistance_request_commune_id_status_created_at_idx" ON "assistance_request"("commune_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "assistance_request_requester_id_created_at_idx" ON "assistance_request"("requester_id", "created_at");

-- AddForeignKey
ALTER TABLE "assistance_request" ADD CONSTRAINT "assistance_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_request" ADD CONSTRAINT "assistance_request_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_request" ADD CONSTRAINT "assistance_request_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_request" ADD CONSTRAINT "assistance_request_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
