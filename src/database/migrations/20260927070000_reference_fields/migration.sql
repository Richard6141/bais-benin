-- Contours de champs de référence (ADR-0029). Migration additive : une table, ses index, rien
-- d'existant n'est modifié.
CREATE TABLE "reference_field" (
    "id" BIGSERIAL NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "confidence" DECIMAL(5,2),
    "area_ha" DECIMAL(10,3) NOT NULL,
    "commune_id" UUID,
    "geom" geography(Polygon, 4326) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_field_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_field_source_id_year_source_ref_key" ON "reference_field"("source_id", "year", "source_ref");
CREATE INDEX "reference_field_commune_id_year_idx" ON "reference_field"("commune_id", "year");
CREATE INDEX "reference_field_geom_idx" ON "reference_field" USING GIST ("geom");

ALTER TABLE "reference_field" ADD CONSTRAINT "reference_field_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_field" ADD CONSTRAINT "reference_field_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;
