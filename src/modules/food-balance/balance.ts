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
  | {
      kind: "survey";
      campaignCode: string;
      cv: number | null;
      /** Points où l'agent a vu une culture vivrière, et points observés. */
      positives?: number;
      points?: number;
    }
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
  /** Raison de l'absence de surface, quand elle est connue (enquête trop maigre). */
  unavailableReason?: string;
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
  /** Vrai si le statut est à confirmer ; les raisons disent pourquoi. */
  toConfirm: boolean;
  confirmReasons: string[];
  crops: CropBalance[];
  missingCrops: readonly string[];
  /** Raison d'une commune non évaluée. */
  reason: string | null;
}

/**
 * Sans surface pour ces trois cultures, qui portent l'essentiel des calories du pays, un bilan
 * serait faux : une commune n'est pas évaluée (revue du chef d'équipe, repli sur la DSA).
 */
export const REQUIRED_CROPS = ["MAIZE", "YAM", "CASSAVA"] as const;

/** Rang d'un statut, du plus urgent au moins urgent : il ordonne listes et tris. */
export const STATUS_RANK: Record<BalanceStatus, number> = {
  deficit: 0,
  tension: 1,
  covered: 2,
  "not-evaluated": 3,
};

/**
 * Seuil de vraisemblance (ADR-0036) : au-delà de trois fois ses besoins, près du double du taux
 * national (161 %, FAOSTAT 2024), une commune est possible mais rare ; le chiffre est à confirmer.
 */
export const PLAUSIBLE_COVERAGE_MAX = 3;
/** Au-delà de ce coefficient de variation, une surface par sondage est imprécise (ADR-0035). */
export const PRECISE_SURVEY_CV = 0.2;

const percent = (value: number) => `${Math.round(value * 100)} %`;

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
    confirmReasons: [],
    crops,
    reason,
  });
  if (!input.population || input.population <= 0) return notEvaluated("Population inconnue");
  if (crops.length === 0) {
    return notEvaluated(input.unavailableReason ?? "Aucune surface de toute la commune");
  }
  if (REQUIRED_CROPS.some((code) => !crops.some((crop) => crop.cropCode === code))) {
    return notEvaluated("Surface manquante pour le maïs, l'igname ou le manioc");
  }
  const needsKcal = annualStapleNeedsKcal(input.population);
  const coverage = {
    central: available.central / needsKcal,
    low: available.low / needsKcal,
    high: available.high / needsKcal,
  };
  const status = statusOf(coverage.central);
  const confirmReasons: string[] = [];
  if (statusOf(coverage.low) !== statusOf(coverage.high)) {
    confirmReasons.push("La fourchette chevauche un seuil.");
  }
  // Une culture manquante sous-estime la couverture : un statut autre que « couverte » reste à
  // confirmer.
  if (input.missingCrops.length > 0 && status !== "covered") {
    confirmReasons.push("Des cultures n'ont pas de surface : la couverture est sous-estimée.");
  }
  if (coverage.central > PLAUSIBLE_COVERAGE_MAX) {
    confirmReasons.push(
      `Plus de ${percent(PLAUSIBLE_COVERAGE_MAX)} des besoins : surface ou rendement à vérifier.`,
    );
  }
  const survey = crops.find((crop) => crop.source.kind === "survey")?.source;
  if (survey?.kind === "survey" && survey.cv !== null && survey.cv > PRECISE_SURVEY_CV) {
    confirmReasons.push(
      `Surface vivrière de l'enquête à ${percent(survey.cv)} près${
        survey.positives !== undefined && survey.points !== undefined
          ? ` (${survey.positives > 1 ? `${survey.positives} points vivriers` : `${survey.positives} point vivrier`} sur ${survey.points})`
          : ""
      } : trop peu de points.`,
    );
  }
  return {
    ...base,
    needsKcal,
    availableKcal: available,
    coverage,
    status,
    toConfirm: confirmReasons.length > 0,
    confirmReasons,
    crops,
    reason: null,
  };
}
