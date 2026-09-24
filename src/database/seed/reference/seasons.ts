/**
 * Campagnes agricoles et sous-saisons, d'après le §5 de docs/08-donnees-et-sources.md.
 *
 * La campagne suit la convention nationale de la campagne cotonnière et des statistiques
 * agricoles du MAEP : elle court du 1er avril au 31 mars de l'année suivante, ce qui englobe les
 * deux saisons du sud et la saison unique du nord. Les fenêtres ci-dessous sont des valeurs par
 * défaut ; une campagne peut les surcharger pour absorber une décision ministérielle
 * exceptionnelle.
 */

import type { RainfallRegime } from "./agro-ecological-zones";

/** Numéro de mois civil, de 1 (janvier) à 12 (décembre). */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Fenêtre mensuelle inclusive. Le mois de fin peut être inférieur au mois de début lorsque la
 * fenêtre chevauche le passage à l'année suivante (décembre à mars : [12, 3]).
 */
export type MonthWindow = readonly [start: Month, end: Month];

export const SEASON_CODES = ["MAIN_RAINY", "SHORT_RAINY", "DRY", "ANNUAL"] as const;

export type SeasonCode = (typeof SEASON_CODES)[number];

export interface SeasonTemplate {
  code: SeasonCode;
  /** Sigle utilisé par le MAEP dans les statistiques agricoles ; absent pour la saison annuelle. */
  maepCode: "GS" | "PS" | "CS" | null;
  nameFr: string;
  /**
   * Fenêtre par régime pluviométrique. `null` signifie que la sous-saison n'existe pas dans ce
   * régime : la petite saison des pluies n'a pas d'équivalent au nord.
   */
  windows: Readonly<Record<RainfallRegime, MonthWindow | null>>;
  usageFr: string;
}

export const SEASON_TEMPLATES: readonly SeasonTemplate[] = [
  {
    code: "MAIN_RAINY",
    maepCode: "GS",
    nameFr: "Grande saison",
    // Au nord, la campagne unique des cultures pluviales est rattachée à la grande saison, avec une
    // fenêtre étendue jusqu'en octobre.
    windows: { BIMODAL: [4, 7], UNIMODAL: [4, 10] },
    usageFr: "Première campagne au sud ; campagne unique des cultures pluviales au nord.",
  },
  {
    code: "SHORT_RAINY",
    maepCode: "PS",
    nameFr: "Petite saison",
    windows: { BIMODAL: [9, 11], UNIMODAL: null },
    usageFr: "Deuxième campagne au sud (maïs à cycle court, niébé, maraîchage).",
  },
  {
    code: "DRY",
    maepCode: "CS",
    nameFr: "Contre-saison sèche",
    windows: { BIMODAL: [12, 3], UNIMODAL: [12, 3] },
    usageFr: "Maraîchage irrigué et de bas-fond, récoltes tardives, commercialisation.",
  },
  {
    code: "ANNUAL",
    maepCode: null,
    nameFr: "Campagne entière",
    // Utilisée pour les cultures pérennes et de cueillette, rattachées à la campagne de leur récolte
    // principale plutôt qu'à une sous-saison de semis.
    windows: { BIMODAL: [4, 3], UNIMODAL: [4, 3] },
    usageFr: "Cultures pérennes et de cueillette, rattachées à la campagne de récolte principale.",
  },
];

/** Code d'une campagne à partir de son année de démarrage : 2025 donne "2025-2026". */
export function buildSeasonCode(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

export interface CampaignWindow {
  /** Date ISO du premier jour de la campagne (1er avril de l'année de démarrage). */
  startsOn: string;
  /** Date ISO du dernier jour de la campagne (31 mars de l'année suivante). */
  endsOn: string;
}

/** Bornes par défaut d'une campagne, avant toute surcharge ministérielle. */
export function campaignWindow(startYear: number): CampaignWindow {
  return {
    startsOn: `${startYear}-04-01`,
    endsOn: `${startYear + 1}-03-31`,
  };
}
