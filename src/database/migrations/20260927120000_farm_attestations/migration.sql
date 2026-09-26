-- Attestations d'exploitation (plan d'action, chantier F) : table nouvelle seulement.

-- CreateTable
CREATE TABLE "farm_attestation" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "farm_id" UUID NOT NULL,
    "issued_by_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "farm_attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farm_attestation_code_key" ON "farm_attestation"("code");

-- CreateIndex
CREATE INDEX "farm_attestation_farm_id_issued_at_idx" ON "farm_attestation"("farm_id", "issued_at");

-- AddForeignKey
ALTER TABLE "farm_attestation" ADD CONSTRAINT "farm_attestation_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_attestation" ADD CONSTRAINT "farm_attestation_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
