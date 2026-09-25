-- Monitoring agricole (étape 6) : météo par commune, règles versionnées, évaluations, alertes,
-- destinataires, consentement aux canaux, simulations et journal d'ingestion.
-- Les index spatiaux et trigrammes créés à la main par les migrations précédentes sont conservés.

-- CreateEnum
CREATE TYPE "WeatherKind" AS ENUM ('OBSERVED', 'FORECAST', 'REANALYSIS');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WATCH', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('WATER_STRESS', 'FLOOD', 'HEAT', 'PEST', 'MARKET', 'ADMIN');

-- CreateEnum
CREATE TYPE "RuleTarget" AS ENUM ('COMMUNE', 'FARM');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'SMS', 'RELAY');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RELAYED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('AGENT_FORM', 'OTP', 'WHATSAPP_REPLY');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterEnum
ALTER TYPE "CropStage" ADD VALUE 'FLOWERING';

-- CreateTable
CREATE TABLE "weather_observation" (
    "id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "observed_on" DATE NOT NULL,
    "kind" "WeatherKind" NOT NULL,
    "issued_on" DATE NOT NULL,
    "temp_max_c" DECIMAL(4,1),
    "temp_min_c" DECIMAL(4,1),
    "precipitation_mm" DECIMAL(6,1),
    "et0_mm" DECIMAL(5,2),
    "relative_humidity_pct" DECIMAL(5,1),
    "wind_kmh" DECIMAL(5,1),
    "soil_moisture_pct" DECIMAL(5,2),
    "source_id" TEXT NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "ingestion_run_id" UUID,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "target" "RuleTarget" NOT NULL DEFAULT 'COMMUNE',
    "definition" JSONB NOT NULL,
    "message_fr" TEXT NOT NULL,
    "message_short" VARCHAR(160) NOT NULL,
    "advice_fr" TEXT NOT NULL,
    "cooldown_hours" INTEGER NOT NULL DEFAULT 72,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "created_by_id" UUID,
    "source_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_evaluation" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched" BOOLEAN NOT NULL,
    "indicators_snapshot" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "missing" TEXT[],
    "data_stale" BOOLEAN NOT NULL DEFAULT false,
    "simulation_id" UUID,
    "alert_id" UUID,

    CONSTRAINT "rule_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message_fr" TEXT NOT NULL,
    "message_short" VARCHAR(160) NOT NULL,
    "advice_fr" TEXT NOT NULL,
    "commune_id" UUID NOT NULL,
    "affected_farm_count" INTEGER NOT NULL DEFAULT 0,
    "affected_area_ha" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "indicators" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "raised_by_evaluation_id" UUID,
    "superseded_by_id" UUID,
    "resolved_reason" TEXT,
    "resolved_by_id" UUID,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_recipient" (
    "id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "farm_id" UUID,
    "user_id" UUID,
    "phone_e164" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "relayed_by_id" UUID,
    "relay_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_consent" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "method" "ConsentMethod" NOT NULL,
    "evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_run" (
    "id" UUID NOT NULL,
    "rule_id" UUID,
    "draft_definition" JSONB,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "requested_by_id" UUID,
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "simulation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_run" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "reference_date" DATE NOT NULL,
    "communes_ok" INTEGER NOT NULL DEFAULT 0,
    "communes_failed" INTEGER NOT NULL DEFAULT 0,
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weather_observation_commune_id_observed_on_idx" ON "weather_observation"("commune_id", "observed_on");

-- CreateIndex
CREATE UNIQUE INDEX "weather_observation_commune_id_observed_on_kind_source_id_i_key" ON "weather_observation"("commune_id", "observed_on", "kind", "source_id", "issued_on");

-- CreateIndex
CREATE INDEX "rule_enabled_idx" ON "rule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "rule_code_version_key" ON "rule"("code", "version");

-- CreateIndex
CREATE INDEX "rule_evaluation_rule_id_commune_id_reference_date_idx" ON "rule_evaluation"("rule_id", "commune_id", "reference_date");

-- CreateIndex
CREATE INDEX "rule_evaluation_simulation_id_idx" ON "rule_evaluation"("simulation_id");

-- CreateIndex
CREATE INDEX "alert_commune_id_status_idx" ON "alert"("commune_id", "status");

-- CreateIndex
CREATE INDEX "alert_status_severity_idx" ON "alert"("status", "severity");

-- CreateIndex
CREATE INDEX "alert_rule_id_commune_id_starts_at_idx" ON "alert"("rule_id", "commune_id", "starts_at");

-- CreateIndex
CREATE INDEX "alert_recipient_status_next_attempt_at_idx" ON "alert_recipient"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "alert_recipient_user_id_acknowledged_at_idx" ON "alert_recipient"("user_id", "acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "alert_recipient_alert_id_farm_id_user_id_channel_key" ON "alert_recipient"("alert_id", "farm_id", "user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "channel_consent_farmer_id_channel_key" ON "channel_consent"("farmer_id", "channel");

-- CreateIndex
CREATE INDEX "ingestion_run_started_at_idx" ON "ingestion_run"("started_at");

-- AddForeignKey
ALTER TABLE "weather_observation" ADD CONSTRAINT "weather_observation_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_observation" ADD CONSTRAINT "weather_observation_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_evaluation" ADD CONSTRAINT "rule_evaluation_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_evaluation" ADD CONSTRAINT "rule_evaluation_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_evaluation" ADD CONSTRAINT "rule_evaluation_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_recipient" ADD CONSTRAINT "alert_recipient_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_recipient" ADD CONSTRAINT "alert_recipient_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_consent" ADD CONSTRAINT "channel_consent_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_run" ADD CONSTRAINT "simulation_run_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
