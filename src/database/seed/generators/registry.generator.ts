/**
 * Générateur du registre synthétique : agriculteurs, exploitations, parcelles et déclarations de
 * cultures (docs/08 §6). Module pur : aucune entrée-sortie, aucune dépendance à Prisma ou Next.
 */

import {
  centroidOf,
  pointInPolygon,
  randomPointInPolygon,
  ringAreaHa,
  round,
  squareParcelAround,
  type Position,
} from "./geometry";
import { deterministicUuid, farmCode, farmerCode, syntheticPhone } from "./identifiers";
import { pickLinguisticArea, pickPersonName } from "./names";
import { createRandom, type Random, type WeightedItem } from "./random";
import type {
  CampaignInput,
  CommuneInput,
  CropInput,
  RegistryInput,
  RegistryOptions,
  SeasonCode,
  SyntheticFarm,
  SyntheticFarmer,
  SyntheticParcel,
  SyntheticParcelCrop,
  SyntheticRegistry,
  VerificationStatus,
} from "./registry.types";

const PROVENANCE = { reliability: "SYNTHETIC", sourceId: "BAIS_SEED" } as const;

/** Répartition cible des statuts sur les exploitations (docs/08 §6.5). */
const STATUS_WEIGHTS: readonly WeightedItem<VerificationStatus>[] = [
  { value: "DECLARED", weight: 55 },
  { value: "AGENT_VERIFIED", weight: 30 },
  { value: "FIELD_VERIFIED", weight: 15 },
];

/** Nombre de parcelles par exploitation, distribution décroissante (docs/08 §6.1). */
const PARCEL_COUNT_WEIGHTS: readonly WeightedItem<number>[] = [
  { value: 1, weight: 40 },
  { value: 2, weight: 35 },
  { value: 3, weight: 18 },
  { value: 4, weight: 7 },
];

/** Nombre de cultures par parcelle et par campagne : la monoculture domine, l'association existe. */
const CROP_COUNT_WEIGHTS: readonly WeightedItem<number>[] = [
  { value: 1, weight: 55 },
  { value: 2, weight: 33 },
  { value: 3, weight: 12 },
];

/** Superficie totale : log-normale de médiane 1,5 ha, bornée pour éviter les valeurs absurdes. */
const AREA_MEDIAN_HA = 1.5;
const AREA_SIGMA = 0.7;
const AREA_MIN_HA = 0.1;
const AREA_MAX_HA = 25;

/** Rayon de dispersion des parcelles autour du siège, en degrés (environ 1 km). */
const PARCEL_SCATTER_DEG = 0.009;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Répartit `total` exploitations entre les communes au prorata des poids, par la méthode des plus
 * forts restes : la somme tombe exactement sur `total`, sans commune oubliée par arrondi.
 */
export function allocateByWeight(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((acc, weight) => acc + Math.max(weight, 0), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (Math.max(weight, 0) / sum) * total);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}

/** Découpe une superficie en `count` parts positives dont la somme, à 3 décimales, est exacte. */
function splitArea(random: Random, totalHa: number, count: number): number[] {
  if (count === 1) return [totalHa];
  const weights = Array.from({ length: count }, () => 0.3 + random.next());
  const weightSum = weights.reduce((acc, value) => acc + value, 0);
  const parts = weights.map((weight) => round3((weight / weightSum) * totalHa));
  const allocated = parts.slice(0, -1).reduce((acc, value) => acc + value, 0);
  parts[count - 1] = round3(totalHa - allocated);
  return parts;
}

function pickParcelCenter(random: Random, commune: CommuneInput, origin: Position): Position {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate: Position = [
      round(origin[0] + (random.next() - 0.5) * 2 * PARCEL_SCATTER_DEG),
      round(origin[1] + (random.next() - 0.5) * 2 * PARCEL_SCATTER_DEG),
    ];
    if (pointInPolygon(candidate, commune.polygon)) return candidate;
  }
  // Siège en bordure de commune : la parcelle reste au siège plutôt que de sortir du territoire.
  return origin;
}

function pickSeason(random: Random, crop: CropInput): SeasonCode {
  if (crop.cycle !== "ANNUAL") return "ANNUAL";
  // La deuxième campagne n'existe que là où un calendrier « sud » (régime bimodal) est décrit.
  if (crop.calendar.south !== undefined && random.chance(0.2)) return "SHORT_RAINY";
  return "MAIN_RAINY";
}

function eligibleCrops(crops: readonly CropInput[], zoneCode: string): readonly CropInput[] {
  const inZone = crops.filter((crop) => crop.mainZoneCodes.includes(zoneCode));
  return inZone.length > 0 ? inZone : crops;
}

function lastCampaigns(campaigns: readonly CampaignInput[], count: number): CampaignInput[] {
  return [...campaigns].sort((a, b) => a.startYear - b.startYear).slice(-count);
}

export function generateSyntheticRegistry(
  input: RegistryInput,
  options: RegistryOptions,
): SyntheticRegistry {
  if (input.communes.length === 0) throw new RangeError("Aucune commune fournie");
  if (input.crops.length === 0) throw new RangeError("Aucune culture fournie");

  const root = createRandom(options.seed);
  const registry: SyntheticRegistry = { farmers: [], farms: [], parcels: [], parcelCrops: [] };
  const campaigns = lastCampaigns(input.campaigns, 2);
  const usedPhones = new Set<string>();
  const key = (...parts: (string | number)[]) => `${options.seed}:${parts.join(":")}`;

  const allocation = allocateByWeight(
    input.communes.map((commune) => commune.ruralPopulationWeight),
    options.farmCount,
  );

  let farmerSequence = 0;
  input.communes.forEach((commune, communeIndex) => {
    // Un générateur par commune : ajouter une commune ne change pas les tirages des autres.
    const random = root.fork(`commune:${commune.code}`);
    const crops = eligibleCrops(input.crops, commune.zoneCode);
    const communeFarmCount = allocation[communeIndex] ?? 0;

    for (let local = 1; local <= communeFarmCount; local += 1) {
      farmerSequence += 1;
      const farmerId = deterministicUuid(key("farmer", farmerSequence));
      const farmId = deterministicUuid(key("farm", farmerSequence));
      const gender = random.chance(0.65) ? "M" : "F";
      const area = pickLinguisticArea(random, commune.departementCode);
      const name = pickPersonName(random, area, gender);

      let phone = syntheticPhone(random.int(0, 9_999_999));
      while (usedPhones.has(phone)) phone = syntheticPhone(random.int(0, 9_999_999));
      usedPhones.add(phone);

      const farmer: SyntheticFarmer = {
        id: farmerId,
        code: farmerCode(farmerSequence),
        firstName: name.firstName,
        lastName: name.lastName,
        gender,
        birthYear: random.int(1950, 2004),
        householdSize: random.int(2, 12),
        phone,
        communeCode: commune.code,
        linguisticArea: area,
        ...PROVENANCE,
      };

      const totalAreaHa = round3(
        Math.min(AREA_MAX_HA, Math.max(AREA_MIN_HA, random.logNormal(AREA_MEDIAN_HA, AREA_SIGMA))),
      );
      const parcelCount = random.weightedPick(PARCEL_COUNT_WEIGHTS);
      const location = randomPointInPolygon(random, commune.polygon);
      const farm: SyntheticFarm = {
        id: farmId,
        // Séquence globale : deux communes aux trois mêmes lettres (Adjarra, Adjohoun) ne peuvent
        // pas produire le même code.
        code: farmCode(commune.departementName, commune.name, farmerSequence),
        farmerId,
        communeCode: commune.code,
        departementCode: commune.departementCode,
        zoneCode: commune.zoneCode,
        location,
        totalAreaHa,
        parcelCount,
        verificationStatus: random.weightedPick(STATUS_WEIGHTS),
        ...PROVENANCE,
      };

      const areas = splitArea(random, totalAreaHa, parcelCount);
      areas.forEach((declaredAreaHa, parcelIndex) => {
        const parcelId = deterministicUuid(key("parcel", farmerSequence, parcelIndex + 1));
        // L'écart déclaré / mesuré (0 à 20 %) est la matière des contrôles de cohérence (docs/08 §9).
        const deviation = 1 + (random.next() - 0.5) * 0.4;
        const targetAreaHa = Math.max(0.01, declaredAreaHa * deviation);
        const ring = squareParcelAround(
          pickParcelCenter(random, commune, location),
          targetAreaHa,
          random,
        );
        const parcel: SyntheticParcel = {
          id: parcelId,
          code: `${farm.code}-P${parcelIndex + 1}`,
          farmId,
          communeCode: commune.code,
          geometry: { type: "Polygon", coordinates: [ring] },
          centroid: centroidOf(ring),
          declaredAreaHa,
          computedAreaHa: round3(ringAreaHa(ring)),
          ...PROVENANCE,
        };
        registry.parcels.push(parcel);

        for (const campaign of campaigns) {
          const cropCount = Math.min(random.weightedPick(CROP_COUNT_WEIGHTS), crops.length);
          const chosen = random.shuffle(crops).slice(0, cropCount);
          const shares = splitArea(random, declaredAreaHa, cropCount);
          chosen.forEach((crop, cropIndex) => {
            const parcelCrop: SyntheticParcelCrop = {
              id: deterministicUuid(key("parcel-crop", parcelId, campaign.code, crop.code)),
              parcelId,
              campaignCode: campaign.code,
              cropCode: crop.code,
              seasonCode: pickSeason(random, crop),
              areaHa: shares[cropIndex] ?? declaredAreaHa,
              ...PROVENANCE,
            };
            registry.parcelCrops.push(parcelCrop);
          });
        }
      });

      registry.farmers.push(farmer);
      registry.farms.push(farm);
    }
  });

  return registry;
}
