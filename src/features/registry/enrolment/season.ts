import type { SeasonCode } from "./enrolment-types";

// Sous-saison déduite du mois et du régime pluviométrique de la commune (docs/08 §3.1 et §5).
// Au sud (bimodal), la grande saison va de mars à juillet et la petite de septembre à novembre ;
// au nord (unimodal), une seule saison d'avril à octobre. Le reste est contre-saison sèche.
export function seasonForMonth(
  month: number,
  rainfallRegime: "BIMODAL" | "UNIMODAL" | null,
): Exclude<SeasonCode, "ANNUAL"> {
  if (rainfallRegime === "BIMODAL") {
    if (month >= 3 && month <= 7) return "MAIN_RAINY";
    if (month >= 8 && month <= 11) return "SHORT_RAINY";
    return "DRY";
  }
  if (month >= 4 && month <= 10) return "MAIN_RAINY";
  return "DRY";
}

export const SEASON_LABELS: Record<SeasonCode, string> = {
  MAIN_RAINY: "Grande saison des pluies",
  SHORT_RAINY: "Petite saison des pluies",
  DRY: "Contre-saison sèche",
  ANNUAL: "Toute la campagne (culture pérenne)",
};

/** Campagne ouverte, sinon la plus récente : celle à laquelle rattacher les cultures déclarées. */
export function currentCampaignCode(
  campaigns: readonly { code: string; startYear: number; status: string }[],
): string | null {
  const open = campaigns.find((campaign) => campaign.status === "OPEN");
  if (open) return open.code;
  const latest = [...campaigns].sort((a, b) => b.startYear - a.startYear)[0];
  return latest?.code ?? null;
}
