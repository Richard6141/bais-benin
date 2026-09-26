-- Suite de la revue de sécurité des phases 0 à 2 :
-- - R1 : un foyer levé sur des signalements non vérifiés attend la confirmation d'un agent avant
--   d'être diffusé aux producteurs (ADR-0015) ;
-- - R7 : version du texte accepté dans chaque consentement (preuve APDP).

-- AlterTable
ALTER TABLE "alert" ADD COLUMN     "awaiting_confirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "released_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "channel_consent" ADD COLUMN     "text_version" TEXT;

-- AlterTable
ALTER TABLE "ranking_consent" ADD COLUMN     "text_version" TEXT;
