import { prisma } from "@/database/client";
import { getServerEnv } from "@/lib/env";
import {
  runVegetationChecks,
  writeDemoCropAreaEstimates,
  type VegetationRunResult,
} from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Confrontation déclaration / satellite de démonstration (ADR-0016) : verdicts calculés sur des
// séries NDVI synthétiques (fixture), pour que le ministère et les agents voient des parcelles
// « à vérifier » dès l'installation, sans compte Copernicus. Marqués BAIS_SEED / SYNTHETIC : la
// tâche planifiée les remplace par une mesure réelle dès que le compte CDSE est configuré.
// SEED_VEGETATION=0 saute l'étape ; jamais en production.

const DEMO_PARCELS = 3000;

export async function seedVegetationChecks(): Promise<VegetationRunResult | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  // Les verdicts de démonstration sont recalculés à chaque seed, pour suivre les règles du jour ;
  // une mesure réelle de Copernicus n'est jamais effacée.
  await prisma.parcelVegetationCheck.deleteMany({ where: { sourceId: "BAIS_SEED" } });
  return runVegetationChecks({
    provider: createFixtureRemoteSensingProvider(),
    limit: DEMO_PARCELS,
  });
}

// Surfaces des cultures de démonstration (ADR-0021) : déduites des surfaces déclarées, pour que
// la vue du ministère montre des taux d'enrôlement et un classement dès l'installation. Même
// garde que les verdicts : jamais en production, et une mesure réelle n'est jamais remplacée.
export async function seedCropAreaEstimates(): Promise<number | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  return writeDemoCropAreaEstimates();
}
