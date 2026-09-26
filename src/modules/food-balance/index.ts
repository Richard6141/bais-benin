// Bilan alimentaire prévisionnel par commune (ADR-0035) : production vivrière de toute la
// commune convertie en calories, face aux besoins de sa population.

export {
  computeCommuneBalance,
  statusOf,
  type AreaSource,
  type BalanceStatus,
  type CommuneBalance,
  type CommuneInput,
  type CropBalance,
  type CropInput,
} from "./balance";
export {
  FOOD_CROPS,
  NEEDS,
  SEVERE_THRESHOLD,
  SOURCES,
  annualStapleNeedsKcal,
  foodCropFactors,
  kcalFromProduction,
  type CitedSource,
  type FoodCropFactors,
} from "./coefficients";
export { getFoodBalance, type FoodBalanceView } from "./load";
