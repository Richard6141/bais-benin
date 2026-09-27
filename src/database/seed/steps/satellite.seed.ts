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
import {
  CROP_AREA_METHOD_VERSION,
  CROP_AREA_RESOLUTION_M,
  cropMapClassOf,
} from "@/modules/satellite/crop-areas";

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
// synthétiques (une fois sur vingt-cinq inaccessible), classe de la carte aux points par la
// fixture (quatre fois sur cinq la bonne), et carte de démonstration des communes d'enquête recalée
// sur ce que la fixture y verrait, pour que l'estimateur par régression ait une moyenne connue
// cohérente. Refait à chaque seed ; un vrai constat, une vraie lecture de la carte ou une vraie
// surface par commune n'est jamais effacé.
//
// Vraisemblance (ADR-0036) : la surface vivrière de chaque commune suit sa population, à raison
// de 0,178 ha par habitant (FAOSTAT 2024 rapporté à WorldPop 2026), multipliée par un facteur de
// 0,5 à 1,5 propre à la commune. Le bilan alimentaire de démonstration tombe ainsi entre 80 et
// 250 % environ, autour du contrôle national de 161 %.

/** Surface de céréales, racines et tubercules par habitant : 2,66 Mha (FAOSTAT 2024) / 14,99 M. */
const STAPLE_HA_PER_PERSON = 0.178;
/** Répartition nationale des surfaces vivrières (FAOSTAT 2024). */
const STAPLE_MIX: readonly [string, number][] = [
  ["MAIZE", 0.661],
  ["SORGHUM", 0.08],
  ["MILLET", 0.016],
  ["RICE", 0.048],
  ["YAM", 0.079],
  ["CASSAVA", 0.112],
  ["SWEET_POTATO", 0.005],
];
/** Une commune qu'on ne sait pas peupler garde une part vivrière modeste. */
const DEFAULT_STAPLE_SHARE = 0.1;
const INACCESSIBLE_SHARE = 0.04;

type DemoLandCover = "CROP" | "FALLOW" | "NATURAL" | "WATER" | "BUILT";

interface DemoEntry {
  landCover: DemoLandCover;
  cropCode: string | null;
  /** Classe de la carte où tombe ce constat. */
  mapClass: string;
  weight: number;
}

/**
 * Occupation du sol de démonstration d'une commune : sa part vivrière, puis le coton (centre et
 * nord), les autres cultures, jachères, eau et bâti ; la savane et la forêt prennent le reste.
 */
function demoDistribution(latitude: number, stapleShare: number): DemoEntry[] {
  const crop = (cropCode: string, weight: number): DemoEntry => ({
    landCover: "CROP",
    cropCode,
    mapClass: cropMapClassOf(cropCode),
    weight,
  });
  const land = (landCover: DemoLandCover, weight: number): DemoEntry => ({
    landCover,
    cropCode: null,
    mapClass: landCover,
    weight,
  });
  const entries: DemoEntry[] = [
    ...STAPLE_MIX.map(([code, share]) => crop(code, stapleShare * share)),
    crop("COTTON", latitude >= 8.5 ? 0.04 : 0),
    crop("SOYBEAN", 0.02),
    crop("COWPEA", 0.015),
    crop("GROUNDNUT", 0.01),
    crop("CASHEW", 0.03),
    crop("TOMATO", 0.005),
    land("FALLOW", 0.12),
    land("WATER", 0.01),
    land("BUILT", 0.01),
  ];
  const used = entries.reduce((sum, entry) => sum + entry.weight, 0);
  entries.push(land("NATURAL", Math.max(0.05, 1 - used)));
  return entries;
}

interface DemoObservation {
  pointId: string;
  observedAt: Date;
  observedById: string;
  landCover: DemoLandCover | "INACCESSIBLE";
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

function pick<T>(entries: readonly T[], weight: (entry: T) => number, draw: number): T {
  const total = entries.reduce((sum, entry) => sum + weight(entry), 0);
  let cursor = draw * total;
  for (const entry of entries) {
    cursor -= weight(entry);
    if (cursor <= 0) return entry;
  }
  return entries[entries.length - 1]!;
}

/** Part de chaque classe que la fixture verrait sur une commune à cette occupation du sol. */
function expectedMapShares(entries: readonly DemoEntry[]): Map<string, number> {
  const codeOf = CROP_CLASS_CODES as Record<string, number>;
  const keyOf = new Map(Object.entries(codeOf).map(([key, code]) => [code, key]));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const map = new Map<string, number>();
  for (const entry of entries) {
    const share = entry.weight / total;
    const confused = keyOf.get(FIXTURE_CLASS_CONFUSION[codeOf[entry.mapClass]!] ?? codeOf.FALLOW!)!;
    map.set(entry.mapClass, (map.get(entry.mapClass) ?? 0) + share * FIXTURE_RIGHT);
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
      commune: { select: { code: true } },
      observations: { select: { id: true }, take: 1 },
    },
  });

  // Occupation du sol de chaque commune d'enquête, d'après sa population et sa surface.
  const communeIds = [...new Set(points.map((point) => point.communeId))];
  const [areaRows, populations] = await Promise.all([
    prisma.$queryRaw<{ id: string; area_ha: number }[]>`
      SELECT "id", ST_Area("geom") / 10000 AS area_ha
        FROM "commune" WHERE "id" = ANY(${communeIds}::uuid[])`,
    prisma.communePopulation.findMany({
      where: { communeId: { in: communeIds } },
      select: { communeId: true, population: true },
      orderBy: { year: "desc" },
    }),
  ]);
  const areas = new Map(areaRows.map((row) => [row.id, Number(row.area_ha)]));
  const population = new Map<string, number>();
  for (const row of populations) {
    if (!population.has(row.communeId)) population.set(row.communeId, row.population);
  }
  const distributions = new Map<string, DemoEntry[]>();
  for (const communeId of communeIds) {
    const communePoints = points.filter((point) => point.communeId === communeId);
    const latitude =
      communePoints.reduce((sum, point) => sum + Number(point.latitude), 0) /
      Math.max(1, communePoints.length);
    const code = communePoints[0]?.commune.code ?? communeId;
    const factor = 0.5 + seededRandom(demoHash(`vivrier:${code}`))();
    const people = population.get(communeId);
    const areaHa = areas.get(communeId) ?? 0;
    const stapleShare =
      people && areaHa > 0
        ? Math.min(0.3, (people * STAPLE_HA_PER_PERSON * factor) / areaHa)
        : DEFAULT_STAPLE_SHARE;
    distributions.set(communeId, demoDistribution(latitude, stapleShare));
  }

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
    const seen = pick(distributions.get(point.communeId)!, (entry) => entry.weight, random());
    const cropId = seen.cropCode ? (crops.get(seen.cropCode) ?? null) : null;
    if (seen.cropCode && !cropId) return [];
    return [{ ...base, landCover: seen.landCover, cropId, reason: null, distanceM: 8 }];
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
  const windowFrom = new Date(now.getTime() - 365 * 86_400_000);
  const estimates: CropAreaRow[] = [];
  for (const [communeId, entries] of distributions) {
    if (measured.has(communeId)) continue;
    const shares = expectedMapShares(entries);
    const areaHa = areas.get(communeId) ?? 0;
    const latitude = Number(points.find((point) => point.communeId === communeId)?.latitude ?? 9);
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
