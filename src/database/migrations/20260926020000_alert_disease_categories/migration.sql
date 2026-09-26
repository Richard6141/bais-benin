-- Détection des foyers (ADR-0015) : deux catégories d'alerte à côté des ravageurs (PEST), pour
-- qu'une épidémie de maladie des cultures ou animale ait sa propre alerte active par commune,
-- sans remplacer ni prolonger une alerte d'une autre nature.
ALTER TYPE "AlertCategory" ADD VALUE IF NOT EXISTS 'CROP_DISEASE';
ALTER TYPE "AlertCategory" ADD VALUE IF NOT EXISTS 'ANIMAL_DISEASE';
