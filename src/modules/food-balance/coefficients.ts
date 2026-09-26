// Coefficients du bilan alimentaire (ADR-0035), chacun avec sa source et son année : semences,
// pertes et extraction de la FAO pour le Bénin, énergie et part comestible de la table FAO/INFOODS
// d'Afrique de l'Ouest, besoins de FAOSTAT. Rien n'est estimé ici : tout vient d'une source publique.

export interface CitedSource {
  label: string;
  year: string;
  url: string;
}

export const SOURCES = {
  conversion: {
    label: "FAO, Technical Conversion Factors for Agricultural Commodities, page du Bénin",
    year: "moyennes 1992-1996",
    url: "https://www.fao.org/fileadmin/templates/ess/documents/methodology/tcf.pdf",
  },
  composition: {
    label: "FAO/INFOODS, table de composition des aliments d'Afrique de l'Ouest (WAFCT)",
    year: "2019",
    url: "https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx",
  },
  needs: {
    label: "FAOSTAT, indicateurs de sécurité alimentaire, Bénin",
    year: "2025 (valeurs estimées)",
    url: "https://www.fao.org/faostat/en/#data/FS",
  },
  staplesShare: {
    label: "FAOSTAT, part de l'énergie tirée des céréales, racines et tubercules, Bénin",
    year: "moyenne 2007-2009, dernière valeur publiée",
    url: "https://www.fao.org/faostat/en/#data/FS",
  },
} as const satisfies Record<string, CitedSource>;

export interface FoodCropFactors {
  cropCode: string;
  label: string;
  /** Semences de la campagne suivante, en kg par hectare semé (FAO, Bénin). */
  seedKgPerHa: number;
  /** Pertes entre la récolte et le ménage, en part de la production (FAO, Bénin). */
  lossShare: number;
  /** Produit transformé obtenu (riz usiné pour 1 de paddy), et ses propres pertes. */
  extraction: number;
  productLossShare: number;
  /** Part comestible du produit tel qu'acheté (WAFCT 2019). */
  edibleShare: number;
  /** Énergie, en kcal pour 100 g de partie comestible (WAFCT 2019), et le code de l'aliment. */
  kcalPer100g: number;
  foodCode: string;
}

/** Céréales, racines et tubercules : la catégorie que FAOSTAT suit pour la part de l'énergie. */
export const FOOD_CROPS: readonly FoodCropFactors[] = [
  {
    cropCode: "MAIZE",
    label: "Maïs",
    seedKgPerHa: 19,
    lossShare: 0.25,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 1,
    kcalPer100g: 335,
    foodCode: "01_014",
  },
  {
    cropCode: "SORGHUM",
    label: "Sorgho",
    seedKgPerHa: 14,
    lossShare: 0.1,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 1,
    kcalPer100g: 345,
    foodCode: "01_039",
  },
  {
    cropCode: "MILLET",
    label: "Mil",
    seedKgPerHa: 15,
    lossShare: 0.25,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 1,
    kcalPer100g: 365,
    foodCode: "01_017",
  },
  {
    cropCode: "RICE",
    label: "Riz (paddy, usiné à 67 %)",
    seedKgPerHa: 40,
    lossShare: 0.25,
    extraction: 0.67,
    productLossShare: 0.03,
    edibleShare: 1,
    kcalPer100g: 344,
    foodCode: "01_037",
  },
  {
    cropCode: "YAM",
    label: "Igname",
    seedKgPerHa: 2999,
    lossShare: 0.1,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 0.83,
    kcalPer100g: 126,
    foodCode: "02_019",
  },
  {
    cropCode: "CASSAVA",
    label: "Manioc",
    seedKgPerHa: 0,
    lossShare: 0.13,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 0.84,
    kcalPer100g: 142,
    foodCode: "02_001",
  },
  {
    cropCode: "SWEET_POTATO",
    label: "Patate douce",
    seedKgPerHa: 0,
    lossShare: 0.1,
    extraction: 1,
    productLossShare: 0,
    edibleShare: 0.83,
    kcalPer100g: 96,
    foodCode: "02_022",
  },
];

/** Besoins : énergie moyenne et minimale par personne et par jour, part des aliments de base. */
export const NEEDS = {
  averageKcalPerDay: 2237,
  minimumKcalPerDay: 1735,
  staplesShare: 0.72,
} as const;

/** Sous ce rapport entre besoin minimal et besoin moyen, le déficit est grave (77,6 %). */
export const SEVERE_THRESHOLD = NEEDS.minimumKcalPerDay / NEEDS.averageKcalPerDay;

export function foodCropFactors(cropCode: string): FoodCropFactors | null {
  return FOOD_CROPS.find((crop) => crop.cropCode === cropCode) ?? null;
}

/**
 * Calories disponibles pour l'alimentation à partir d'une production (t) et de la surface semée
 * (ha) : semences déduites, pertes, extraction, part comestible et énergie. Jamais négatif.
 */
export function kcalFromProduction(
  factors: FoodCropFactors,
  productionT: number,
  areaHa: number,
): number {
  const afterSeedKg = Math.max(0, productionT * 1000 - factors.seedKgPerHa * areaHa);
  const foodKg =
    afterSeedKg *
    (1 - factors.lossShare) *
    factors.extraction *
    (1 - factors.productLossShare) *
    factors.edibleShare;
  return foodKg * factors.kcalPer100g * 10;
}

/** Besoins annuels en calories tirées des céréales, racines et tubercules. */
export function annualStapleNeedsKcal(population: number): number {
  return population * NEEDS.averageKcalPerDay * NEEDS.staplesShare * 365;
}
