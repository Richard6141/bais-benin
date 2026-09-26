import { prisma } from "@/database/client";
import {
  communesWithMeasuredCropAreas,
  upsertCropAreas,
  type CropAreaRow,
} from "@/database/sql/crop-areas.sql";
import { getServerEnv } from "@/lib/env";
import { seededRandom } from "@/lib/ml/random-forest";
import { classifyFramePoints, drawAreaFrame } from "@/modules/area-survey";
import {
  collectParcelSeries,
  runCropClassChecks,
  trainAndPredictCrops,
  runVegetationChecks,
  writeDemoCropAreaEstimates,
  type VegetationRunResult,
} from "@/modules/satellite";
import {
  CROP_CLASS_CODES,
  CROP_CLASSES,
  FIXTURE_CLASS_CONFUSION,
  createFixtureRemoteSensingProvider,
} from "@/services/remote-sensing";
import { CROP_AREA_METHOD_VERSION, CROP_AREA_RESOLUTION_M } from "@/modules/satellite/crop-areas";

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

// Enquête aréolaire de démonstration (ADR-0033) : points tirés dans les communes pilotes, constats
// synthétiques tirés de parts d'occupation du sol plausibles (une fois sur vingt-cinq
// inaccessible), classe de la carte aux points par la fixture (quatre fois sur cinq la bonne),
// et carte de démonstration des communes d'enquête recalée sur ce que la fixture y verrait, pour
// que l'estimateur par régression ait une moyenne connue cohérente. Refait à chaque seed ; un vrai
// constat, une vraie lecture de la carte ou une vraie surface par commune n'est jamais effacé.

/** Parts d'occupation du sol de démonstration ; le coton ne pousse qu'au centre et au nord. */
function demoLandShares(latitude: number): [string, number][] {
  const cotton = latitude >= 8.5 ? 0.08 : 0;
  return [
    ["RICE", 0.02],
    ["ANNUAL", 0.3 + (0.08 - cotton)],
    ["COTTON", cotton],
    ["PERENNIAL", 0.06],
    ["GARDEN", 0.01],
    ["FALLOW", 0.15],
    ["NATURAL", 0.38],
    ["WATER", 0.02],
    ["BUILT", 0.02],
  ];
}

/** Cultures d'une classe de la carte, avec leur poids dans les constats de démonstration. */
const DEMO_CROPS: Record<string, [string, number][]> = {
  ANNUAL: [
    ["MAIZE", 0.45],
    ["SORGHUM", 0.12],
    ["MILLET", 0.05],
    ["SOYBEAN", 0.1],
    ["COWPEA", 0.08],
    ["GROUNDNUT", 0.08],
    ["YAM", 0.07],
    ["CASSAVA", 0.05],
  ],
  RICE: [["RICE", 1]],
  COTTON: [["COTTON", 1]],
  PERENNIAL: [["CASHEW", 1]],
  GARDEN: [["TOMATO", 1]],
};
const INACCESSIBLE_SHARE = 0.04;

interface DemoObservation {
  pointId: string;
  observedAt: Date;
  observedById: string;
  landCover: "CROP" | "FALLOW" | "NATURAL" | "WATER" | "BUILT" | "INACCESSIBLE";
  cropId: string | null;
  reason: string | null;
  distanceM: number | null;
}
/** Part des points où la fixture voit la bonne classe (sinon sa confusion la plus plausible). */
const FIXTURE_RIGHT = 0.8;
const DEMO_AGENT_PHONE = "+2290190000001";

function demoHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function pick<T>(entries: readonly [T, number][], draw: number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = draw * total;
  for (const [value, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Part de chaque classe que la fixture verrait sur une commune aux parts `shares`. */
function expectedMapShares(shares: readonly [string, number][]): Map<string, number> {
  const codeOf = CROP_CLASS_CODES as Record<string, number>;
  const keyOf = new Map(Object.entries(codeOf).map(([key, code]) => [code, key]));
  const map = new Map<string, number>();
  for (const [key, share] of shares) {
    const confused = keyOf.get(FIXTURE_CLASS_CONFUSION[codeOf[key]!] ?? codeOf.FALLOW!)!;
    map.set(key, (map.get(key) ?? 0) + share * FIXTURE_RIGHT);
    map.set(confused, (map.get(confused) ?? 0) + share * (1 - FIXTURE_RIGHT));
  }
  return map;
}

export async function seedAreaSurvey(): Promise<number | null> {
  if (process.env.SEED_VEGETATION === "0" || getServerEnv().APP_ENV === "production") return null;
  const now = new Date();
  await drawAreaFrame({ now });
  const campaign = await prisma.agriculturalCampaign.findFirst({
    where: { status: "OPEN" },
    select: { id: true },
  });
  const agent = await prisma.user.findFirst({
    where: { phoneNumber: DEMO_AGENT_PHONE },
    select: { id: true },
  });
  if (!campaign || !agent) return 0;
  await prisma.areaFrameObservation.deleteMany({
    where: { sourceId: "BAIS_SEED", point: { campaignId: campaign.id } },
  });
  await prisma.areaFramePoint.updateMany({
    where: { campaignId: campaign.id, mapSourceId: "BAIS_SEED" },
    data: { mapClass: null, mapMethodVersion: null, mapSourceId: null, mapReliability: null },
  });
  const points = await prisma.areaFramePoint.findMany({
    where: { campaignId: campaign.id },
    select: {
      id: true,
      code: true,
      communeId: true,
      latitude: true,
      observations: { select: { id: true }, take: 1 },
    },
  });
  const crops = new Map(
    (await prisma.crop.findMany({ select: { id: true, code: true } })).map((crop) => [
      crop.code,
      crop.id,
    ]),
  );
  const rows = points.flatMap((point): DemoObservation[] => {
    if (point.observations.length > 0) return [];
    const random = seededRandom(demoHash(point.code));
    const base = { pointId: point.id, observedAt: now, observedById: agent.id };
    if (random() < INACCESSIBLE_SHARE) {
      return [
        {
          ...base,
          landCover: "INACCESSIBLE" as const,
          cropId: null,
          reason: "Rivière en crue",
          distanceM: null,
        },
      ];
    }
    const seen = pick(demoLandShares(Number(point.latitude)), random());
    const cropCode = DEMO_CROPS[seen] ? pick(DEMO_CROPS[seen], random()) : null;
    const cropId = cropCode ? (crops.get(cropCode) ?? null) : null;
    if (cropCode && !cropId) return [];
    const landCover = cropCode
      ? ("CROP" as const)
      : (seen as "FALLOW" | "NATURAL" | "WATER" | "BUILT");
    return [{ ...base, landCover, cropId, reason: null, distanceM: 8 }];
  });
  await prisma.areaFrameObservation.createMany({
    data: rows.map((row) => ({
      id: crypto.randomUUID(),
      ...row,
      sourceId: "BAIS_SEED",
      reliability: "SYNTHETIC" as const,
    })),
  });

  // Carte de démonstration des communes d'enquête, sauf celles déjà mesurées par Copernicus.
  const measured = await communesWithMeasuredCropAreas(campaign.id);
  const byCommune = new Map<string, number[]>();
  for (const point of points) {
    if (measured.has(point.communeId)) continue;
    const list = byCommune.get(point.communeId) ?? [];
    list.push(Number(point.latitude));
    byCommune.set(point.communeId, list);
  }
  const areas = new Map(
    (
      await prisma.$queryRaw<{ id: string; area_ha: number }[]>`
        SELECT "id", ST_Area("geom") / 10000 AS area_ha
          FROM "commune" WHERE "id" = ANY(${[...byCommune.keys()]}::uuid[])`
    ).map((row) => [row.id, Number(row.area_ha)]),
  );
  const windowFrom = new Date(now.getTime() - 365 * 86_400_000);
  const estimates: CropAreaRow[] = [];
  for (const [communeId, latitudes] of byCommune) {
    const latitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
    const shares = expectedMapShares(demoLandShares(latitude));
    const areaHa = areas.get(communeId) ?? 0;
    for (const key of CROP_CLASSES) {
      const share = shares.get(key) ?? 0;
      estimates.push({
        communeId,
        campaignId: campaign.id,
        cropClass: key,
        areaHa: Math.round(share * areaHa * 100) / 100,
        pixelShare: Math.round(share * 10_000) / 10_000,
        unclassifiedShare: 0,
        resolutionM: CROP_AREA_RESOLUTION_M,
        windowFrom,
        windowTo: now,
        sourceId: "BAIS_SEED",
        reliability: "SYNTHETIC",
        computedAt: now,
        methodVersion: CROP_AREA_METHOD_VERSION,
        rainyMonthsSeen: latitude >= 9 ? 3.8 : 2.6,
      });
    }
  }
  await upsertCropAreas(estimates);
  await classifyFramePoints({ provider: createFixtureRemoteSensingProvider(), limit: 5000, now });
  return points.length;
}
