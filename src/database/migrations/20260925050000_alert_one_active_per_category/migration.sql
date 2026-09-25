-- Au plus une alerte active par commune et par catégorie (monitoring §0, sobriété). Filet de
-- sécurité en base contre deux évaluations concurrentes : l'application remplace l'alerte en
-- cours (SUPERSEDED) avant d'en créer une plus grave, dans la même transaction.
CREATE UNIQUE INDEX "alert_one_active_per_category"
  ON "alert" ("commune_id", "category")
  WHERE "status" = 'ACTIVE';
