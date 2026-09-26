-- Palmarès public (complément d'ADR-0018) : accord du producteur, palmarès publiés par le
-- ministère et leurs lauréats.

-- CreateTable
CREATE TABLE "ranking_consent" (
    "farmer_id" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_consent_pkey" PRIMARY KEY ("farmer_id")
);

-- CreateTable
CREATE TABLE "published_ranking" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "crop_code" TEXT NOT NULL,
    "campaign_code" TEXT NOT NULL,
    "departement_code" TEXT,
    "commune_code" TEXT,
    "metric" TEXT NOT NULL,
    "verified_only" BOOLEAN NOT NULL,
    "requested_count" INTEGER NOT NULL,
    "published_by_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" UUID,

    CONSTRAINT "published_ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_ranking_entry" (
    "ranking_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "farmer_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "commune_name" TEXT NOT NULL,
    "departement_name" TEXT NOT NULL,
    "production_t" DECIMAL(12,3) NOT NULL,
    "area_ha" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "published_ranking_entry_pkey" PRIMARY KEY ("ranking_id","rank")
);

-- CreateIndex
CREATE INDEX "published_ranking_withdrawn_at_published_at_idx" ON "published_ranking"("withdrawn_at", "published_at");

-- CreateIndex
CREATE INDEX "published_ranking_entry_farmer_id_idx" ON "published_ranking_entry"("farmer_id");

-- AddForeignKey
ALTER TABLE "ranking_consent" ADD CONSTRAINT "ranking_consent_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_ranking" ADD CONSTRAINT "published_ranking_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_ranking" ADD CONSTRAINT "published_ranking_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_ranking_entry" ADD CONSTRAINT "published_ranking_entry_ranking_id_fkey" FOREIGN KEY ("ranking_id") REFERENCES "published_ranking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_ranking_entry" ADD CONSTRAINT "published_ranking_entry_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
