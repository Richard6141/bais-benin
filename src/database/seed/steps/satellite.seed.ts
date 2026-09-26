import { prisma } from "@/database/client";
import { getServerEnv } from "@/lib/env";
import {
  collectParcelSeries,
  runCropClassChecks,
  trainAndPredictCrops,
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

/** Parcelles vérifiées contrôlées en démonstration : assez pour une matrice lisible. */
const DEMO_ACCURACY_PARCELS = 1500;

// Précision de la carte des cultures de démonstration : classes tirées par la fixture autour de
// la culture déclarée (quatre fois sur cinq la bonne), pour que le ministère voie une matrice de
// confusion dès l'installation. Mêmes gardes ; les contrôles réels ne sont jamais effacés.
export async function seedCropClassChecks(): Promise<number | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  await prisma.parcelCropClassCheck.deleteMany({ where: { sourceId: "BAIS_SEED" } });
  const result = await runCropClassChecks({
    provider: createFixtureRemoteSensingProvider(),
    limit: DEMO_ACCURACY_PARCELS,
  });
  return result.checked;
}

// Cultures par parcelle de démonstration (ADR-0030) : séries synthétiques des parcelles des
// communes pilotes, puis un modèle entraîné sur leurs parcelles vérifiées. Mêmes gardes. Les
// séries déjà présentes ne sont pas refaites (une quarantaine de secondes) : le seed complète ce
// qui manque, et le modèle n'est réentraîné que si les données ont changé.
export async function seedParcelCrops(): Promise<number | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  const series = await collectParcelSeries({
    provider: createFixtureRemoteSensingProvider(),
    limit: 5000,
  });
  await trainAndPredictCrops();
  return series.read;
}
