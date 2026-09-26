-- CreateEnum
CREATE TYPE "PredictionAgreement" AS ENUM ('AGREES', 'DIFFERS', 'UNCERTAIN');

-- CreateTable
CREATE TABLE "parcel_signature" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "window_from" DATE NOT NULL,
    "observed_until" DATE NOT NULL,
    "s2_series" JSONB NOT NULL,
    "s1_series" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "feature_version" INTEGER NOT NULL,
    "processing_units" DECIMAL(8,3),
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_model" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "campaign_id" UUID NOT NULL,
    "algorithm" TEXT NOT NULL,
    "feature_version" INTEGER NOT NULL,
    "classes" TEXT[],
    "feature_names" TEXT[],
    "params" JSONB NOT NULL,
    "model" JSONB NOT NULL,
    "training_parcels" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_crop_prediction" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "crop_group" TEXT NOT NULL,
    "crop_id" UUID,
    "confidence" DECIMAL(4,3) NOT NULL,
    "probabilities" JSONB NOT NULL,
    "declared_group" TEXT,
    "agreement" "PredictionAgreement" NOT NULL,
    "observed_until" DATE NOT NULL,
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_crop_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_signature_campaign_id_idx" ON "parcel_signature"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_signature_parcel_id_campaign_id_key" ON "parcel_signature"("parcel_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "crop_model_version_key" ON "crop_model"("version");

-- CreateIndex
CREATE INDEX "parcel_crop_prediction_campaign_id_agreement_idx" ON "parcel_crop_prediction"("campaign_id", "agreement");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_crop_prediction_parcel_id_campaign_id_key" ON "parcel_crop_prediction"("parcel_id", "campaign_id");

-- AddForeignKey
ALTER TABLE "parcel_signature" ADD CONSTRAINT "parcel_signature_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_signature" ADD CONSTRAINT "parcel_signature_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_signature" ADD CONSTRAINT "parcel_signature_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_model" ADD CONSTRAINT "crop_model_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_model" ADD CONSTRAINT "crop_model_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_prediction" ADD CONSTRAINT "parcel_crop_prediction_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_prediction" ADD CONSTRAINT "parcel_crop_prediction_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_prediction" ADD CONSTRAINT "parcel_crop_prediction_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "crop_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_prediction" ADD CONSTRAINT "parcel_crop_prediction_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_prediction" ADD CONSTRAINT "parcel_crop_prediction_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
