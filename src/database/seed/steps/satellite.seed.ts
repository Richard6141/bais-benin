import { getServerEnv } from "@/lib/env";
import { runVegetationChecks, type VegetationRunResult } from "@/modules/satellite";
import { createFixtureRemoteSensingProvider } from "@/services/remote-sensing";

// Confrontation déclaration / satellite de démonstration (ADR-0016) : verdicts calculés sur des
// séries NDVI synthétiques (fixture), pour que le ministère et les agents voient des parcelles
// « à vérifier » dès l'installation, sans compte Copernicus. Marqués BAIS_SEED / SYNTHETIC : la
// tâche planifiée les remplace par une mesure réelle dès que le compte CDSE est configuré.
// SEED_VEGETATION=0 saute l'étape ; jamais en production.

const DEMO_PARCELS = 3000;

export async function seedVegetationChecks(): Promise<VegetationRunResult | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  return runVegetationChecks({
    provider: createFixtureRemoteSensingProvider(),
    limit: DEMO_PARCELS,
  });
}
