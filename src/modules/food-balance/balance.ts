import {
  SEVERE_THRESHOLD,
  annualStapleNeedsKcal,
  foodCropFactors,
  kcalFromProduction,
} from "./coefficients";

// Bilan alimentaire d'une commune (ADR-0035), en fonction pure : production attendue de chaque
// culture (surface de toute la commune × rendement de référence), calories disponibles, besoins
// de la population et couverture, avec sa fourchette et son statut.

export type AreaSource =
  | { kind: "survey"; campaignCode: string; cv: number | null }
  | { kind: "official"; sourceId: string; campaignCode: string };

export interface CropInput {
  cropCode: string;
  /** Surface de la culture dans toute la commune, avec ses bornes (marge du sondage). */
  areaHa: number;
  areaLowHa: number;
  areaHighHa: number;
  source: AreaSource;
  /** Rendement de référence de l'ADR-0020 et ses quartiles, en t/ha. */
  yieldRef: { meanTPerHa: number; p25TPerHa: number; p75TPerHa: number; basis: string };
}

export interface CommuneInput {
  code: string;
  name: string;
  population: number | null;
  crops: readonly CropInput[];
  /** Cultures vivrières sans surface connue : le bilan les ignore, il est donc sous-estimé. */
  missingCrops: readonly string[];
}

export type BalanceStatus = "covered" | "tension" | "deficit" | "not-evaluated";

export interface CropBalance {
  cropCode: string;
  label: string;
  areaHa: number;
  productionT: number;
  productionLowT: number;
  productionHighT: number;
  kcal: number;
  source: AreaSource;
  yieldBasis: string;
}

export interface CommuneBalance {
  code: string;
  name: string;
  population: number | null;
  needsKcal: number | null;
  availableKcal: { central: number; low: number; high: number };
  /** Calories disponibles rapportées aux besoins ; null sans évaluation. */
  coverage: { central: number; low: number; high: number } | null;
  status: BalanceStatus;
  /** Vrai si la fourchette chevauche un seuil : le statut est à confirmer. */
  toConfirm: boolean;
  crops: CropBalance[];
  missingCrops: readonly string[];
  /** Raison d'une commune non évaluée. */
  reason: string | null;
}

export function statusOf(coverage: number): Exclude<BalanceStatus, "not-evaluated"> {
  if (coverage >= 1) return "covered";
  if (coverage >= SEVERE_THRESHOLD) return "tension";
  return "deficit";
}

export function computeCommuneBalance(input: CommuneInput): CommuneBalance {
  const base = {
    code: input.code,
    name: input.name,
    population: input.population,
    missingCrops: input.missingCrops,
  };
  const empty = { central: 0, low: 0, high: 0 };
  const crops: CropBalance[] = [];
  const available = { ...empty };
  for (const crop of input.crops) {
    const factors = foodCropFactors(crop.cropCode);
    if (!factors) continue;
    const productionT = crop.areaHa * crop.yieldRef.meanTPerHa;
    const productionLowT = crop.areaLowHa * crop.yieldRef.p25TPerHa;
    const productionHighT = crop.areaHighHa * crop.yieldRef.p75TPerHa;
    const kcal = kcalFromProduction(factors, productionT, crop.areaHa);
    available.central += kcal;
    available.low += kcalFromProduction(factors, productionLowT, crop.areaLowHa);
    available.high += kcalFromProduction(factors, productionHighT, crop.areaHighHa);
    crops.push({
      cropCode: crop.cropCode,
      label: factors.label,
      areaHa: crop.areaHa,
      productionT,
      productionLowT,
      productionHighT,
      kcal,
      source: crop.source,
      yieldBasis: crop.yieldRef.basis,
    });
  }
  const notEvaluated = (reason: string): CommuneBalance => ({
    ...base,
    needsKcal: input.population ? annualStapleNeedsKcal(input.population) : null,
    availableKcal: available,
    coverage: null,
    status: "not-evaluated",
    toConfirm: false,
    crops,
    reason,
  });
  if (!input.population || input.population <= 0) return notEvaluated("Population inconnue");
  if (crops.length === 0) return notEvaluated("Aucune surface de toute la commune");
  const needsKcal = annualStapleNeedsKcal(input.population);
  const coverage = {
    central: available.central / needsKcal,
    low: available.low / needsKcal,
    high: available.high / needsKcal,
  };
  return {
    ...base,
    needsKcal,
    availableKcal: available,
    coverage,
    status: statusOf(coverage.central),
    toConfirm: statusOf(coverage.low) !== statusOf(coverage.high),
    crops,
    reason: null,
  };
}
