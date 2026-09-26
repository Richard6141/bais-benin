-- CreateTable
CREATE TABLE "commune_population" (
    "id" UUID NOT NULL,
    "commune_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "population" INTEGER NOT NULL,
    "source_id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "loaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commune_population_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commune_population_commune_id_year_source_id_key" ON "commune_population"("commune_id", "year", "source_id");

-- AddForeignKey
ALTER TABLE "commune_population" ADD CONSTRAINT "commune_population_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune_population" ADD CONSTRAINT "commune_population_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
