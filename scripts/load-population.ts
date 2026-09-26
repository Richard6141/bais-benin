import "dotenv/config";
import { prisma } from "@/database/client";
import { DATA_SOURCES } from "@/database/seed/reference/data-sources";
import { seedCommunePopulation } from "@/database/seed/steps/population.seed";

// Population par commune du bilan alimentaire (ADR-0035), sans rejouer le seed : la source WorldPop
// et les 77 totaux du référentiel, rien d'autre. Idempotent : relancé, il met les chiffres à jour
// sans doublon. Sur le serveur, depuis l'image tools :
//   docker run --rm --network bais_default --env-file app.env <registre>/tools:<sha> \
//     pnpm db:reference:population

async function main() {
  const source = DATA_SOURCES.find((entry) => entry.id === "WORLDPOP");
  if (!source) throw new Error("Source WORLDPOP absente du référentiel");
  await prisma.dataSource.upsert({
    where: { id: source.id },
    create: { ...source },
    update: { ...source },
  });
  const loaded = await seedCommunePopulation(prisma);
  const communes = await prisma.commune.count({ where: { archivedAt: null } });
  console.log(`Population WorldPop chargée pour ${loaded} communes sur ${communes}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
