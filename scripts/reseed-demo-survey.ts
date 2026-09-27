import "dotenv/config";
import { prisma } from "@/database/client";
import { seedAreaSurvey } from "@/database/seed/steps/satellite.seed";

// Enquête aréolaire de démonstration seule (ADR-0033, ADR-0036), sans rejouer tout le seed :
// constats synthétiques, classe de la carte aux points et carte de démonstration des communes
// d'enquête. Idempotent : les lignes de démonstration sont refaites, un vrai constat ou une vraie
// mesure n'est jamais effacé. Après pnpm db:reference:population (les parts suivent la
// population). Sur le serveur, depuis l'image tools :
//   docker run --rm --network bais_default --env-file app.env <registre>/tools:<sha> \
//     pnpm db:demo:survey

async function main() {
  const points = await seedAreaSurvey();
  if (points === null) {
    console.log("Rien à faire : démonstration désactivée (production ou SEED_VEGETATION=0).");
    return;
  }
  console.log(`Enquête de démonstration refaite sur ${points} points.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
