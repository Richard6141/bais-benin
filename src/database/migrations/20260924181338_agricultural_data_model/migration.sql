-- CreateEnum
CREATE TYPE "Reliability" AS ENUM ('DECLARED', 'AGENT_VERIFIED', 'FIELD_VERIFIED', 'OFFICIAL', 'ESTIMATED', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('OFFICIAL', 'FIELD', 'PUBLIC_OPEN_DATA', 'SENSOR', 'MODEL', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "RainfallRegime" AS ENUM ('BIMODAL', 'UNIMODAL');

-- CreateEnum
CREATE TYPE "CropCategory" AS ENUM ('CEREAL', 'ROOT_TUBER', 'LEGUME', 'CASH_CROP', 'VEGETABLE', 'FRUIT', 'OILSEED');

-- CreateEnum
CREATE TYPE "CropCycle" AS ENUM ('ANNUAL', 'PERENNIAL', 'GATHERED');

-- CreateEnum
CREATE TYPE "TradeUnit" AS ENUM ('KG', 'T', 'BAG_100KG', 'BAG_50KG', 'BUNCH', 'HEAP', 'BASIN');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubSeason" AS ENUM ('MAIN_RAINY', 'SHORT_RAINY', 'DRY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN_STATE', 'AGENT_AGRICULTURE', 'FARMER', 'COOPERATIVE', 'BUYER');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('NATIONAL', 'DEPARTEMENT', 'COMMUNE', 'ORGANIZATION', 'SELF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "LandTenure" AS ENUM ('OWNED', 'RENTED', 'FAMILY', 'SHARED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FarmActivity" AS ENUM ('CROPS', 'MIXED', 'LIVESTOCK_DOMINANT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DECLARED', 'AGENT_VERIFIED', 'FIELD_VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ParcelCaptureMethod" AS ENUM ('GPS_WALK', 'MAP_DRAW', 'DECLARED_ONLY');

-- CreateEnum
CREATE TYPE "IrrigationType" AS ENUM ('NONE', 'MANUAL', 'DRIP', 'FLOOD');

-- CreateEnum
CREATE TYPE "CropStage" AS ENUM ('PLANNED', 'SOWN', 'GROWING', 'HARVESTED', 'FAILED');

-- CreateTable
CREATE TABLE "data_source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "url" TEXT,
    "licence" TEXT,
    "kind" "DataSourceKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agro_ecological_zone" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rainfall_regime" "RainfallRegime" NOT NULL,
    "dominant_systems" TEXT[],
    "indicative_rainfall_min_mm" INTEGER NOT NULL,
    "indicative_rainfall_max_mm" INTEGER NOT NULL,
    "departement_codes" TEXT[],
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "agro_ecological_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departement" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chef_lieu" TEXT NOT NULL,
    "geoboundaries_id" TEXT,
    "geom" geography(MultiPolygon, 4326),
    "centroid" geography(Point, 4326),
    "area_km2" DECIMAL(12,3),
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "departement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commune" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "departement_id" UUID NOT NULL,
    "agro_ecological_zone_id" UUID,
    "geoboundaries_id" TEXT,
    "geom" geography(MultiPolygon, 4326),
    "centroid" geography(Point, 4326),
    "area_km2" DECIMAL(12,3),
    "rural_population_estimate" INTEGER,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "commune_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "category" "CropCategory" NOT NULL,
    "cycle" "CropCycle" NOT NULL,
    "trade_unit" "TradeUnit" NOT NULL,
    "typical_yield_t_per_ha" DECIMAL(6,2),
    "main_zone_codes" TEXT[],
    "calendar" JSONB NOT NULL,
    "color_hex" TEXT,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "crop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agricultural_campaign" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "agricultural_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT,
    "email" CITEXT,
    "password_hash" TEXT,
    "display_name" TEXT NOT NULL,
    "preferred_locale" TEXT NOT NULL DEFAULT 'fr',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "npi_hash" BYTEA,
    "npi_encrypted" BYTEA,
    "npi_verified_at" TIMESTAMP(3),
    "npi_verification_provider" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" UUID,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "birth_year" INTEGER,
    "phone_e164" TEXT,
    "commune_id" UUID NOT NULL,
    "village" TEXT,
    "household_size" INTEGER,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "farmer_id" UUID NOT NULL,
    "name" TEXT,
    "commune_id" UUID NOT NULL,
    "village" TEXT,
    "location" geography(Point, 4326),
    "declared_area_ha" DECIMAL(10,3) NOT NULL,
    "computed_area_ha" DECIMAL(10,3),
    "tenure" "LandTenure" NOT NULL DEFAULT 'UNKNOWN',
    "main_activity" "FarmActivity" NOT NULL DEFAULT 'CROPS',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'DECLARED',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "registered_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "farm_id" UUID NOT NULL,
    "geom" geography(Polygon, 4326),
    "centroid" geography(Point, 4326),
    "declared_area_ha" DECIMAL(10,3) NOT NULL,
    "computed_area_ha" DECIMAL(10,3),
    "capture_method" "ParcelCaptureMethod" NOT NULL DEFAULT 'DECLARED_ONLY',
    "gps_accuracy_m" DECIMAL(6,1),
    "irrigation" "IrrigationType" NOT NULL DEFAULT 'NONE',
    "soil_type" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_crop" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "crop_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "sub_season" "SubSeason" NOT NULL DEFAULT 'MAIN_RAINY',
    "area_ha" DECIMAL(10,3) NOT NULL,
    "sowing_date" DATE,
    "expected_harvest_date" DATE,
    "stage" "CropStage" NOT NULL DEFAULT 'PLANNED',
    "variety" TEXT,
    "source_id" TEXT NOT NULL,
    "source_date" TIMESTAMP(3) NOT NULL,
    "reliability" "Reliability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "parcel_crop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agro_ecological_zone_code_key" ON "agro_ecological_zone"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departement_code_key" ON "departement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "commune_code_key" ON "commune"("code");

-- CreateIndex
CREATE INDEX "commune_departement_id_idx" ON "commune"("departement_id");

-- CreateIndex
CREATE INDEX "commune_agro_ecological_zone_id_idx" ON "commune"("agro_ecological_zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "crop_code_key" ON "crop"("code");

-- CreateIndex
CREATE UNIQUE INDEX "agricultural_campaign_code_key" ON "agricultural_campaign"("code");

-- CreateIndex
CREATE UNIQUE INDEX "agricultural_campaign_start_year_key" ON "agricultural_campaign"("start_year");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_e164_key" ON "user"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_npi_hash_key" ON "user"("npi_hash");

-- CreateIndex
CREATE INDEX "role_assignment_user_id_role_idx" ON "role_assignment"("user_id", "role");

-- CreateIndex
CREATE INDEX "role_assignment_scope_type_scope_id_idx" ON "role_assignment"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_code_key" ON "farmer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_user_id_key" ON "farmer"("user_id");

-- CreateIndex
CREATE INDEX "farmer_commune_id_idx" ON "farmer"("commune_id");

-- CreateIndex
CREATE INDEX "farmer_last_name_first_name_idx" ON "farmer"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "farm_code_key" ON "farm"("code");

-- CreateIndex
CREATE INDEX "farm_commune_id_verification_status_idx" ON "farm"("commune_id", "verification_status");

-- CreateIndex
CREATE INDEX "farm_farmer_id_idx" ON "farm"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_code_key" ON "parcel"("code");

-- CreateIndex
CREATE INDEX "parcel_farm_id_idx" ON "parcel"("farm_id");

-- CreateIndex
CREATE INDEX "parcel_crop_crop_id_campaign_id_idx" ON "parcel_crop"("crop_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_crop_parcel_id_crop_id_campaign_id_sub_season_key" ON "parcel_crop"("parcel_id", "crop_id", "campaign_id", "sub_season");

-- AddForeignKey
ALTER TABLE "agro_ecological_zone" ADD CONSTRAINT "agro_ecological_zone_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departement" ADD CONSTRAINT "departement_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune" ADD CONSTRAINT "commune_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "departement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune" ADD CONSTRAINT "commune_agro_ecological_zone_id_fkey" FOREIGN KEY ("agro_ecological_zone_id") REFERENCES "agro_ecological_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune" ADD CONSTRAINT "commune_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop" ADD CONSTRAINT "crop_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agricultural_campaign" ADD CONSTRAINT "agricultural_campaign_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer" ADD CONSTRAINT "farmer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer" ADD CONSTRAINT "farmer_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer" ADD CONSTRAINT "farmer_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm" ADD CONSTRAINT "farm_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel" ADD CONSTRAINT "parcel_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel" ADD CONSTRAINT "parcel_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop" ADD CONSTRAINT "parcel_crop_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop" ADD CONSTRAINT "parcel_crop_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop" ADD CONSTRAINT "parcel_crop_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "agricultural_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop" ADD CONSTRAINT "parcel_crop_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Index spatiaux et de recherche (ajoutés à la main : Prisma ne les connaît pas)
-- ---------------------------------------------------------------------------

-- Géométries : GiST est l'index adapté aux requêtes d'intersection et de proximité.
CREATE INDEX "departement_geom_idx" ON "departement" USING GIST ("geom");
CREATE INDEX "commune_geom_idx" ON "commune" USING GIST ("geom");
CREATE INDEX "commune_centroid_idx" ON "commune" USING GIST ("centroid");
CREATE INDEX "farm_location_idx" ON "farm" USING GIST ("location");
CREATE INDEX "parcel_geom_idx" ON "parcel" USING GIST ("geom");
CREATE INDEX "parcel_centroid_idx" ON "parcel" USING GIST ("centroid");

-- Recherche tolérante aux fautes sur les libellés saisis par les agents.
CREATE INDEX "commune_name_trgm_idx" ON "commune" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "farmer_last_name_trgm_idx" ON "farmer" USING GIN ("last_name" gin_trgm_ops);

-- Le registre n'est jamais purgé : la plupart des lectures excluent les lignes archivées.
CREATE INDEX "farm_active_idx" ON "farm" ("commune_id") WHERE "archived_at" IS NULL;
CREATE INDEX "farmer_active_idx" ON "farmer" ("commune_id") WHERE "archived_at" IS NULL;
