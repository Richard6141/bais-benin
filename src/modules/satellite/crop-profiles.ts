import type { VegetationInterval } from "@/services/ports/remote-sensing-provider";

// Confrontation déclaration / satellite (ADR-0016, étape 2) : profils de végétation attendus par
// culture et par zone, et jugement d'une série NDVI de parcelle. Règles simples et explicables,
// à calibrer ensuite sur les visites de terrain ; fonctions pures, sans réseau ni base.
//
// Un couvert cultivé en saison pluviale dépasse d'ordinaire un NDVI de 0,5 à 0,7 sur Sentinel-2
// à 10 m ; les petites parcelles, les associations de cultures et l'enherbement tirent la valeur
// vers le bas, d'où des seuils prudents : un drapeau « à vérifier » demande une visite, il ne
// conclut à aucune fausse déclaration.

export type CropCategoryCode =
  "CEREAL" | "ROOT_TUBER" | "LEGUME" | "CASH_CROP" | "VEGETABLE" | "FRUIT" | "OILSEED";
export type CropCycleCode = "ANNUAL" | "PERENNIAL" | "GATHERED";
export type RainfallRegimeCode = "BIMODAL" | "UNIMODAL";
export type SubSeasonCode = "MAIN_RAINY" | "SHORT_RAINY" | "DRY" | "ANNUAL";

type Month = number;
export interface CropCalendarInput {
  sowing?: readonly [Month, Month];
  harvest: readonly [Month, Month];
}

export interface CropProfileInput {
  code: string;
  category: CropCategoryCode;
  cycle: CropCycleCode;
  calendar: { south?: CropCalendarInput; north?: CropCalendarInput };
}

export type ExpectedProfile =
  | { kind: "SEASONAL"; minPeak: number; minAmplitude: number }
  | { kind: "PERMANENT"; minMedian: number };

// Pic minimal attendu en saison et amplitude minimale entre sol nu et plein couvert.
const SEASONAL_THRESHOLDS: Record<CropCategoryCode, { minPeak: number; minAmplitude: number }> = {
  CEREAL: { minPeak: 0.45, minAmplitude: 0.15 },
  ROOT_TUBER: { minPeak: 0.45, minAmplitude: 0.12 },
  LEGUME: { minPeak: 0.4, minAmplitude: 0.12 },
  CASH_CROP: { minPeak: 0.45, minAmplitude: 0.15 },
  OILSEED: { minPeak: 0.4, minAmplitude: 0.12 },
  VEGETABLE: { minPeak: 0.35, minAmplitude: 0.1 },
  FRUIT: { minPeak: 0.4, minAmplitude: 0.1 },
};

// Couvert permanent attendu d'une plantation (anacarde, palmier, agrumes) ou d'un parc arboré.
const PERMANENT_MIN_MEDIAN = 0.4;

// Zones les plus sèches : couvert naturellement plus clair, seuils abaissés d'autant.
const ZONE_OFFSETS: Record<string, number> = { ZAE_1: 0.08, ZAE_2: 0.04 };

/** Profil attendu d'une culture dans une zone agro-écologique. */
export function expectedProfile(crop: CropProfileInput, zoneCode: string | null): ExpectedProfile {
  const offset = zoneCode ? (ZONE_OFFSETS[zoneCode] ?? 0) : 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  if (crop.cycle !== "ANNUAL") {
    return { kind: "PERMANENT", minMedian: round(PERMANENT_MIN_MEDIAN - offset) };
  }
  const thresholds = SEASONAL_THRESHOLDS[crop.category];
  return {
    kind: "SEASONAL",
    minPeak: round(thresholds.minPeak - offset),
    minAmplitude: thresholds.minAmplitude,
  };
}

export interface SeasonWindow {
  from: Date;
  to: Date;
  /** Période où le couvert doit culminer : après les semis, avant la récolte. */
  peakFrom: Date;
  peakTo: Date;
}

function monthStart(year: number, month: Month): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthEnd(year: number, month: Month): Date {
  return new Date(Date.UTC(year, month, 1) - 1000);
}

/**
 * Fenêtre de la saison à examiner, pour une campagne (année de démarrage) et un régime. La
 * grande saison suit le calendrier de la culture ; la petite saison du sud couvre septembre à
 * décembre ; les cultures pérennes sont vues sur les six mois précédant `now`. La contre-saison
 * irriguée n'est pas examinée (parcelles maraîchères trop petites pour 10 m).
 */
export function seasonWindow(
  crop: CropProfileInput,
  regime: RainfallRegimeCode,
  subSeason: SubSeasonCode,
  startYear: number,
  now: Date,
): SeasonWindow | null {
  if (subSeason === "DRY") return null;
  if (subSeason === "ANNUAL" || crop.cycle !== "ANNUAL") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
    return { from, to: now, peakFrom: from, peakTo: now };
  }
  if (subSeason === "SHORT_RAINY") {
    if (regime !== "BIMODAL") return null;
    return {
      from: monthStart(startYear, 9),
      to: monthEnd(startYear, 12),
      peakFrom: monthStart(startYear, 10),
      peakTo: monthEnd(startYear, 11),
    };
  }
  const calendar =
    (regime === "BIMODAL" ? crop.calendar.south : crop.calendar.north) ??
    crop.calendar.south ??
    crop.calendar.north;
  if (!calendar?.sowing) return null;
  const [sowingStart, sowingEnd] = calendar.sowing;
  const [harvestStart, harvestEnd] = calendar.harvest;
  const harvestYear = (month: Month) => (month < sowingStart ? startYear + 1 : startYear);
  const from = monthStart(startYear, sowingStart);
  const to = monthEnd(harvestYear(harvestEnd), harvestEnd);
  // Le couvert culmine entre le mois qui suit la fin des semis et le début de la récolte.
  const peakStartMonth = sowingEnd === 12 ? 1 : sowingEnd + 1;
  let peakFrom = monthStart(harvestYear(peakStartMonth), peakStartMonth);
  const peakTo = monthEnd(harvestYear(harvestStart), harvestStart);
  if (peakFrom > peakTo) peakFrom = monthStart(startYear, sowingEnd);
  return { from, to, peakFrom, peakTo };
}

export type VegetationCheckStatus = "CONSISTENT" | "TO_VERIFY" | "INSUFFICIENT_DATA" | "PENDING";
export type VegetationCheckReason = "LOW_PEAK" | "NO_CYCLE" | "LOW_COVER";

export interface VegetationVerdict {
  status: VegetationCheckStatus;
  reason: VegetationCheckReason | null;
  /** NDVI le plus haut sur la période de pic (couvert permanent : médiane). */
  peak: number | null;
  /** NDVI le plus bas de la saison, sol nu ou couvert minimal. */
  base: number | null;
  validIntervals: number;
  /** Seuil comparé à `peak`. */
  expected: number;
}

// Une décade ne compte que si assez de pixels de 10 m ont échappé aux nuages.
const MIN_VALID_PIXELS = 3;
const MIN_PEAK_INTERVALS = 2;
const MIN_PERMANENT_INTERVALS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Juge une série NDVI de parcelle face au profil attendu de la culture déclarée. */
export function evaluateVegetation(
  series: readonly VegetationInterval[],
  profile: ExpectedProfile,
  window: SeasonWindow,
  now: Date,
): VegetationVerdict {
  const valid = series.filter(
    (interval): interval is VegetationInterval & { ndviMean: number } =>
      interval.ndviMean !== null && interval.validPixels >= MIN_VALID_PIXELS,
  );
  const values = valid.map((interval) => interval.ndviMean);
  const base = values.length > 0 ? round3(Math.min(...values)) : null;

  if (profile.kind === "PERMANENT") {
    if (valid.length < MIN_PERMANENT_INTERVALS) {
      return {
        status: "INSUFFICIENT_DATA",
        reason: null,
        peak: null,
        base,
        validIntervals: valid.length,
        expected: profile.minMedian,
      };
    }
    const cover = round3(median(values));
    return {
      status: cover < profile.minMedian ? "TO_VERIFY" : "CONSISTENT",
      reason: cover < profile.minMedian ? "LOW_COVER" : null,
      peak: cover,
      base,
      validIntervals: valid.length,
      expected: profile.minMedian,
    };
  }

  const inPeak = valid.filter((interval) => {
    const middle = (Date.parse(interval.from) + Date.parse(interval.to)) / 2;
    return middle >= window.peakFrom.getTime() && middle <= window.peakTo.getTime();
  });
  const peak = inPeak.length > 0 ? round3(Math.max(...inPeak.map((i) => i.ndviMean))) : null;
  const verdict = (status: VegetationCheckStatus, reason: VegetationCheckReason | null) => ({
    status,
    reason,
    peak,
    base,
    validIntervals: valid.length,
    expected: profile.minPeak,
  });
  // Un couvert déjà dense avant la fin de la période de pic suffit à conclure.
  const peakOver = now.getTime() > window.peakTo.getTime();
  if (
    peak !== null &&
    peak >= profile.minPeak &&
    base !== null &&
    peak - base >= profile.minAmplitude
  ) {
    return verdict("CONSISTENT", null);
  }
  if (!peakOver) return verdict("PENDING", null);
  if (inPeak.length < MIN_PEAK_INTERVALS || peak === null)
    return verdict("INSUFFICIENT_DATA", null);
  if (peak < profile.minPeak) return verdict("TO_VERIFY", "LOW_PEAK");
  return verdict("TO_VERIFY", "NO_CYCLE");
}
