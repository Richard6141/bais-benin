import "dotenv/config";
import { prisma } from "@/database/client";
import { logger } from "@/lib/logger";
import {
  seedAgroEcologicalZones,
  seedCampaigns,
  seedCrops,
  seedDataSources,
} from "./steps/reference.seed";
import { seedDemoAccounts } from "./steps/accounts.seed";
import { seedSyntheticFarms, type FarmSeedSummary } from "./steps/farms.seed";
import { seedTerritory } from "./steps/territory.seed";

export interface SeedSummary {
  dataSources: number;
  zones: number;
  departements: number;
  communes: number;
  crops: number;
  campaigns: number;
  demoAccounts: number;
  registry: FarmSeedSummary;
}

// Chargement des référentiels. Chaque étape est idempotente (upsert) : relancer le seed
// met à jour les libellés et géométries sans dupliquer ni toucher aux données de terrain.
export async function seedReferenceData(): Promise<SeedSummary> {
  const dataSources = await seedDataSources(prisma);
  const zones = await seedAgroEcologicalZones(prisma);
  const territory = await seedTerritory(prisma);
  const crops = await seedCrops(prisma);
  const campaigns = await seedCampaigns(prisma);
  const demoAccounts = await seedDemoAccounts(prisma);
  const registry = await seedSyntheticFarms(prisma);
  return { dataSources, zones, ...territory, crops, campaigns, demoAccounts, registry };
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/database/seed/index.ts");

if (isDirectRun) {
  seedReferenceData()
    .then((summary) => {
      logger.info(summary, "Référentiels chargés");
    })
    .catch((error: unknown) => {
      logger.error(error, "Échec du seed");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
