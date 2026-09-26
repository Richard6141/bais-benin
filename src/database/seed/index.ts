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
import { seedAssistantCorpus } from "./steps/assistant.seed";
import { seedSyntheticFarms, type FarmSeedSummary } from "./steps/farms.seed";
import { seedSyntheticHarvests, type HarvestSeedSummary } from "./steps/harvests.seed";
import { refreshAnalyticsIfStale } from "@/modules/analytics/refresh";
import { seedMonitoring, type MonitoringSeedSummary } from "./steps/monitoring.seed";
import {
  seedCropAreaEstimates,
  seedCropClassChecks,
  seedParcelCrops,
  seedVegetationChecks,
} from "./steps/satellite.seed";
import { seedReferenceFields } from "./steps/reference-fields.seed";
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
  harvests: HarvestSeedSummary;
  monitoring: MonitoringSeedSummary;
  assistant: Awaited<ReturnType<typeof seedAssistantCorpus>>;
  vegetation: Awaited<ReturnType<typeof seedVegetationChecks>>;
  referenceFields: Awaited<ReturnType<typeof seedReferenceFields>>;
  cropAreaCommunes: number | null;
  cropClassChecks: number | null;
  parcelSignatures: number | null;
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
  const harvests = await seedSyntheticHarvests(prisma);
  // Les chiffres de production du pilotage lisent des vues matérialisées : elles doivent voir
  // les récoltes qui viennent d'être ajoutées.
  if (harvests.declarations > 0 || harvests.historyParcelCrops > 0) {
    await refreshAnalyticsIfStale({ force: true });
  }
  const monitoring = await seedMonitoring();
  const assistant = await seedAssistantCorpus();
  const vegetation = await seedVegetationChecks();
  const referenceFields = await seedReferenceFields();
  const cropAreaCommunes = await seedCropAreaEstimates();
  const cropClassChecks = await seedCropClassChecks();
  const parcelSignatures = await seedParcelCrops();
  return {
    dataSources,
    zones,
    ...territory,
    crops,
    campaigns,
    demoAccounts,
    registry,
    harvests,
    monitoring,
    assistant,
    vegetation,
    referenceFields,
    cropAreaCommunes,
    cropClassChecks,
    parcelSignatures,
  };
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
