import "dotenv/config";
import { prisma } from "@/database/client";
import { logger } from "@/lib/logger";
import { runRetentionPurge } from "./retention";

// C4 : purge/anonymisation périodique des données personnelles au-delà de leur délai de
// conservation (voir retention.ts pour le détail par table et la justification APDP). Lancée
// manuellement (`pnpm db:purge`) ou par une tâche planifiée mensuelle — le scheduler du
// docker-compose fourni appelle déjà l'application sur un autre horaire pour le monitoring ;
// ce script peut être ajouté à côté sur un cron mensuel plutôt que quotidien, la fenêtre de
// conservation se comptant en mois.

const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("src/modules/privacy/run-purge.ts");

if (isDirectRun) {
  runRetentionPurge()
    .then((summary) => {
      logger.info(summary, "Purge des données personnelles terminée");
    })
    .catch((error: unknown) => {
      logger.error(error, "Échec de la purge des données personnelles");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
