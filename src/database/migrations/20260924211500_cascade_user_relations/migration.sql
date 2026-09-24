-- La suppression d'un compte entraîne celle de ses affectations de rôle ; les entrées
-- d'audit, elles, conservent l'action et perdent seulement la référence à l'acteur
-- (contrainte déjà en ON DELETE SET NULL). Les index spatiaux manuels sont conservés.

-- DropForeignKey
ALTER TABLE "role_assignment" DROP CONSTRAINT "role_assignment_user_id_fkey";

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
