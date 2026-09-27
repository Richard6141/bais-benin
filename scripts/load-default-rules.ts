import "dotenv/config";
import { prisma } from "@/database/client";
import { seedDefaultRules } from "@/modules/monitoring";

// Règles d'alerte par défaut seules, sans rejouer tout le seed : une nouvelle règle par défaut
// (par exemple le foyer de feux, ADR-0038) arrive ainsi sur un serveur déjà installé. Idempotent :
// une règle déjà en base à la même version garde son état ; une version modifiée par le ministère
// n'est jamais écrasée. Sur le serveur, depuis l'image tools :
//   docker run --rm --network bais_default --env-file app.env <registre>/tools:<sha> \
//     pnpm db:rules:default

async function main() {
  const created = await seedDefaultRules();
  console.log(`Règles par défaut à jour : ${created} créée(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
